import asyncio
import json
import logging
import os
import re
import uuid
from calendar import monthcalendar, monthrange
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path

import requests
import httpx
from pydantic import BaseModel

from .spec_loader import load_agent_spec

try:
    import holidays as holidays_lib
except Exception:  # pragma: no cover
    holidays_lib = None

try:
    from pydantic_ai import Agent, RunContext
except Exception:  # pragma: no cover
    Agent = None
    RunContext = None


VAULT_PATH = Path(os.getenv("VAULT_PATH", "/vault"))
CHRONOS_PATH = VAULT_PATH / "chronos"
CALENDAR_FILE = CHRONOS_PATH / "calendar_events.json"
_LEGACY_CALENDAR_FILE = VAULT_PATH / "calendar_events.json"
SYSTEM_SETTINGS_FILE = VAULT_PATH / "system_settings.json"

# Tools that only read vault state — safe to execute concurrently.
_READ_ONLY_TOOLS = frozenset({"list_events_tool", "list_us_holidays_tool"})
logger = logging.getLogger(__name__)
inference_lock = asyncio.Semaphore(1)
STABLE_TOOLING = os.getenv("CHRONOS_STABLE_TOOLING", "0").strip().lower() in {"1", "true", "yes", "on"}

# Persistent HTTP client — reuses the TCP connection to llama-server across
# requests instead of opening a new connection on every Chronos message.
_http_client: httpx.AsyncClient | None = None


def _get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(timeout=httpx.Timeout(5.0, read=90.0))
    return _http_client


async def _parallel_read_context(student_id: str | None) -> dict:
    """Fetch calendar events and school-year holidays concurrently.

    Read-only tools (_READ_ONLY_TOOLS) carry no vault side-effects, so they
    are safe to run with asyncio.gather().  Write tools (create/update/delete)
    are always executed serially through the deterministic fallback path.
    """
    loop = asyncio.get_event_loop()
    events, hol_tuple = await asyncio.gather(
        loop.run_in_executor(None, visible_events, student_id),
        loop.run_in_executor(None, holidays_in_school_year),
    )
    _, _, holidays = hol_tuple
    return {
        "events": events,
        "holidays": [{"date": d, "name": n} for d, n in holidays],
    }


class ChronosResult(BaseModel):
    reply: str
    actions: list[str] = []


@dataclass
class ChronosDeps:
    is_parent: bool
    student_id: str | None


def _load_events() -> list[dict]:
    # One-time migration: move legacy root-level file into agent-scoped path.
    if not CALENDAR_FILE.exists() and _LEGACY_CALENDAR_FILE.exists():
        CHRONOS_PATH.mkdir(parents=True, exist_ok=True)
        _LEGACY_CALENDAR_FILE.rename(CALENDAR_FILE)
    if not CALENDAR_FILE.exists():
        return []
    try:
        return json.loads(CALENDAR_FILE.read_text()).get("events", [])
    except Exception:
        return []


def _save_events(events: list[dict]):
    CHRONOS_PATH.mkdir(parents=True, exist_ok=True)
    CALENDAR_FILE.write_text(json.dumps({"events": events}, indent=2))


def _system_calendar() -> dict:
    if not SYSTEM_SETTINGS_FILE.exists():
        today = date.today()
        # If today is before August, we're in the school year that started last year.
        y = today.year if today.month >= 8 else today.year - 1
        return {"school_year_start": f"{y}-08-15", "school_year_end": f"{y + 1}-05-31", "holidays": []}
    try:
        return json.loads(SYSTEM_SETTINGS_FILE.read_text()).get("calendar", {})
    except Exception:
        return {}


def _nth_weekday(year: int, month: int, weekday: int, nth: int) -> date:
    cal = monthcalendar(year, month)
    day = [wk[weekday] for wk in cal if wk[weekday] != 0][nth - 1]
    return date(year, month, day)


def _last_weekday(year: int, month: int, weekday: int) -> date:
    cal = monthcalendar(year, month)
    day = [wk[weekday] for wk in cal if wk[weekday] != 0][-1]
    return date(year, month, day)


def _observed(dt: date) -> date:
    if dt.weekday() == 5:
        return dt - timedelta(days=1)
    if dt.weekday() == 6:
        return dt + timedelta(days=1)
    return dt


def us_federal_holidays(year: int) -> list[tuple[str, str]]:
    if holidays_lib is not None:
        try:
            us = holidays_lib.US(years=[year], observed=True)
            rows = sorted([(d.isoformat(), str(name)) for d, name in us.items()], key=lambda x: x[0])
            if rows:
                return rows
        except Exception:
            pass

    # Fallback deterministic rules if library lookup fails.
    rows: list[tuple[str, str]] = []
    rows.append((_observed(date(year, 1, 1)).isoformat(), "New Year's Day"))
    rows.append((_nth_weekday(year, 1, 0, 3).isoformat(), "Martin Luther King Jr. Day"))
    rows.append((_nth_weekday(year, 2, 0, 3).isoformat(), "Presidents Day"))
    rows.append((_last_weekday(year, 5, 0).isoformat(), "Memorial Day"))
    rows.append((_observed(date(year, 6, 19)).isoformat(), "Juneteenth"))
    rows.append((_observed(date(year, 7, 4)).isoformat(), "Independence Day"))
    rows.append((_nth_weekday(year, 9, 0, 1).isoformat(), "Labor Day"))
    rows.append((_nth_weekday(year, 10, 0, 2).isoformat(), "Columbus Day"))
    rows.append((_observed(date(year, 11, 11)).isoformat(), "Veterans Day"))
    rows.append((_nth_weekday(year, 11, 3, 4).isoformat(), "Thanksgiving"))
    rows.append((_observed(date(year, 12, 25)).isoformat(), "Christmas Day"))
    return rows


def visible_events(student_id: str | None = None) -> list[dict]:
    events = _load_events()
    if not student_id:
        return events
    return [
        e for e in events
        if e.get("scope") == "global" or (e.get("scope") == "student" and e.get("student_id") == student_id)
    ]


def _can_mutate_event(deps: ChronosDeps, event: dict) -> bool:
    if deps.is_parent:
        return True
    return event.get("scope") == "student" and event.get("student_id") == deps.student_id


def create_event(*, deps: ChronosDeps, title: str, date_value: str, kind: str, scope: str, student_id: str | None = None, end_date: str | None = None, notes: str = "") -> dict:
    if scope == "global" and not deps.is_parent:
        raise ValueError("Only a parent can create global events")
    if scope == "student" and not deps.is_parent:
        student_id = deps.student_id

    row = {
        "id": str(uuid.uuid4()),
        "title": title.strip(),
        "date": date_value.strip(),
        "end_date": (end_date or "").strip() or None,
        "kind": (kind or "holiday").strip(),
        "scope": scope,
        "student_id": (student_id or "").strip() or None,
        "notes": (notes or "").strip(),
    }
    events = _load_events()
    events.append(row)
    _save_events(events)
    return row


def update_event(*, deps: ChronosDeps, event_id: str, title: str | None = None, date_value: str | None = None, end_date: str | None = None, notes: str | None = None) -> dict:
    events = _load_events()
    for i, event in enumerate(events):
        if event.get("id") != event_id:
            continue
        if not _can_mutate_event(deps, event):
            raise ValueError("Permission denied for this event")
        if title is not None:
            event["title"] = title.strip()
        if date_value is not None:
            event["date"] = date_value.strip()
        if end_date is not None:
            event["end_date"] = end_date.strip() or None
        if notes is not None:
            event["notes"] = notes.strip()
        events[i] = event
        _save_events(events)
        return event
    raise ValueError("Event not found")


def delete_event(*, deps: ChronosDeps, event_id: str) -> bool:
    events = _load_events()
    target = next((e for e in events if e.get("id") == event_id), None)
    if target is None:
        raise ValueError("Event not found")
    if not _can_mutate_event(deps, target):
        raise ValueError("Permission denied for this event")
    remaining = [e for e in events if e.get("id") != event_id]
    _save_events(remaining)
    return True


def holidays_in_school_year() -> tuple[str, str, list[tuple[str, str]]]:
    cal = _system_calendar()
    start = cal.get("school_year_start", "")
    end = cal.get("school_year_end", "")
    start_year = datetime.strptime(start, "%Y-%m-%d").year
    end_year = datetime.strptime(end, "%Y-%m-%d").year
    rows: list[tuple[str, str]] = []
    for year in range(start_year, end_year + 1):
        rows.extend(us_federal_holidays(year))
    rows = [r for r in rows if start <= r[0] <= end]
    return start, end, rows


def holidays_in_date_range(start: str, end: str) -> list[tuple[str, str]]:
    start_year = datetime.strptime(start, "%Y-%m-%d").year
    end_year = datetime.strptime(end, "%Y-%m-%d").year
    rows: list[tuple[str, str]] = []
    for year in range(start_year, end_year + 1):
        rows.extend(us_federal_holidays(year))
    return [r for r in rows if start <= r[0] <= end]


def _add_months(base: date, months: int) -> date:
    month_index = (base.month - 1) + months
    year = base.year + (month_index // 12)
    month = (month_index % 12) + 1
    day = min(base.day, monthrange(year, month)[1])
    return date(year, month, day)


def _extract_relative_range_end(text: str, today_dt: date) -> tuple[date, str] | None:
    number_words = {
        "one": 1,
        "two": 2,
        "three": 3,
        "four": 4,
        "five": 5,
        "six": 6,
        "seven": 7,
        "eight": 8,
        "nine": 9,
        "ten": 10,
        "eleven": 11,
        "twelve": 12,
    }

    pattern = re.compile(r"next\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(day|days|week|weeks|month|months)")
    match = pattern.search(text)
    if not match:
        return None

    raw_num = match.group(1)
    unit = match.group(2)
    amount = int(raw_num) if raw_num.isdigit() else number_words.get(raw_num)
    if not amount or amount < 1:
        return None

    if unit.startswith("day"):
        end_dt = today_dt + timedelta(days=amount)
        label = f"next {amount} days"
    elif unit.startswith("week"):
        end_dt = today_dt + timedelta(days=amount * 7)
        label = f"next {amount} weeks"
    else:
        end_dt = _add_months(today_dt, amount)
        label = f"next {amount} months"

    return end_dt, label


def _extract_iso_dates(text: str) -> list[str]:
    return re.findall(r"\b\d{4}-\d{2}-\d{2}\b", text)


def _all_user_text(messages: list[dict]) -> str:
    return "\n".join([
        str(m.get("content", "")).lower()
        for m in messages
        if m.get("role") == "user"
    ])


def _resolve_event_reference(messages: list[dict], deps: ChronosDeps) -> dict | None:
    pool = visible_events(None if deps.is_parent else deps.student_id)
    if not pool:
        return None

    latest = _latest_user_message(messages).lower()
    all_user = _all_user_text(messages)
    convo_text = "\n".join([str(m.get("content", "")).lower() for m in messages])

    # 1) explicit ISO date mention
    for iso in _extract_iso_dates(latest) + _extract_iso_dates(all_user):
        hit = next((e for e in pool if str(e.get("date")) == iso), None)
        if hit:
            return hit

    # 2) month/day mention
    md = _extract_month_day_query(latest) or _extract_month_day_query(all_user)
    if md:
        month, day = md
        hit = next(
            (e for e in pool if len(str(e.get("date", ""))) >= 10 and int(str(e.get("date"))[5:7]) == month and int(str(e.get("date"))[8:10]) == day),
            None,
        )
        if hit:
            return hit

    # 3) title mention in conversation
    scored = []
    for e in pool:
        title = str(e.get("title", "")).strip()
        if not title:
            continue
        title_l = title.lower()
        if title_l in convo_text:
            scored.append((3 + len(title_l), e))
            continue
        tokens = [t for t in re.split(r"[^a-z0-9]+", title_l) if len(t) >= 4]
        overlap = sum(1 for t in tokens if t in all_user)
        if overlap:
            scored.append((overlap, e))

    if scored:
        scored.sort(key=lambda x: x[0], reverse=True)
        return scored[0][1]

    return None


def _week_monday_friday(iso_date: str) -> tuple[str, str]:
    base = datetime.strptime(iso_date, "%Y-%m-%d").date()
    monday = base - timedelta(days=base.weekday())
    friday = monday + timedelta(days=4)
    return monday.isoformat(), friday.isoformat()


def _extract_weekday_range(text: str) -> tuple[int, int] | None:
    names = {
        "monday": 0,
        "tuesday": 1,
        "wednesday": 2,
        "thursday": 3,
        "friday": 4,
        "saturday": 5,
        "sunday": 6,
    }
    m = re.search(r"\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b\s+(?:through|to|thru|until)\s+\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b", text)
    if not m:
        return None
    return names[m.group(1)], names[m.group(2)]


def _week_range_for_event(iso_date: str, start_weekday: int, end_weekday: int) -> tuple[str, str]:
    base = datetime.strptime(iso_date, "%Y-%m-%d").date()
    monday = base - timedelta(days=base.weekday())
    start = monday + timedelta(days=start_weekday)
    end = monday + timedelta(days=end_weekday)
    if end < start:
        end = end + timedelta(days=7)
    return start.isoformat(), end.isoformat()


def _extract_event_title(text: str, fallback: str = "Holiday") -> str:
    quoted = re.search(r'"([^"]{2,80})"', text)
    if quoted:
        return quoted.group(1).strip()

    called = re.search(r"(?:called|named)\s+([a-z0-9\s\-']{2,80})", text)
    if called:
        return called.group(1).strip().title()

    if "winter break" in text:
        return "Winter Break"
    if "spring break" in text:
        return "Spring Break"
    if "fall break" in text:
        return "Fall Break"
    return fallback


def _extract_month_day_query(text: str) -> tuple[int, int] | None:
    month_names = {
        "january": 1, "february": 2, "march": 3, "april": 4,
        "may": 5, "june": 6, "july": 7, "august": 8,
        "september": 9, "october": 10, "november": 11, "december": 12,
    }
    m = re.search(r"\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?\b", text)
    if not m:
        return None
    month = month_names[m.group(1)]
    day = int(m.group(2))
    if day < 1 or day > 31:
        return None
    return month, day


def _answer_is_date_holiday(text: str) -> str | None:
    lower = text.lower()
    if "is" not in lower or "holiday" not in lower:
        return None

    md = _extract_month_day_query(lower)
    if not md:
        iso = re.search(r"\b(\d{4}-\d{2}-\d{2})\b", lower)
        if iso:
            target = iso.group(1)
            _, _, rows = holidays_in_school_year()
            hit = next((name for d, name in rows if d == target), None)
            if hit:
                return f"Yes. {target} is {hit}."
            return f"No. {target} is not a US federal holiday in the configured school year."
        return None

    month, day = md
    _, _, rows = holidays_in_school_year()
    hits = [(d, name) for d, name in rows if int(d[5:7]) == month and int(d[8:10]) == day]
    if hits:
        date_value, name = hits[0]
        return f"Yes. {date_value} is {name}."
    month_labels = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    return f"No. {month_labels[month - 1]} {day} is not a US federal holiday in the configured school year."


def import_holidays_for_school_year(deps: ChronosDeps) -> int:
    if not deps.is_parent:
        raise ValueError("Only a parent can import global holidays")
    start, end, rows = holidays_in_school_year()
    existing = {(e.get("date"), e.get("title")) for e in _load_events() if e.get("scope") == "global"}
    created = 0
    for holiday_date, holiday_name in rows:
        key = (holiday_date, holiday_name)
        if key in existing:
            continue
        create_event(
            deps=deps,
            title=holiday_name,
            date_value=holiday_date,
            kind="holiday",
            scope="global",
            end_date=None,
            notes="Imported by Chronos",
        )
        existing.add(key)
        created += 1
    _ = (start, end)
    return created


_agent = None


def _build_agent():
    if Agent is None:
        return None
    spec = load_agent_spec("chronos")
    system_prompt = spec or "You are Chronos, a scheduling agent."

    llm_file = os.getenv("LLAMA_MODEL_FILE", "")
    model_name = llm_file[:-5] if llm_file.endswith(".gguf") else (llm_file or "")
    os.environ.setdefault("OPENAI_API_KEY", "local")
    os.environ["OPENAI_BASE_URL"] = f"{os.getenv('LLAMA_BASE_URL', 'http://llama-server:8080')}/v1"

    model_ref = f"openai:{model_name or 'current-model'}"
    agent = Agent(
        model_ref,
        deps_type=ChronosDeps,
        output_type=ChronosResult,
        system_prompt=system_prompt,
    )

    @agent.tool
    def list_events_tool(ctx: RunContext[ChronosDeps]) -> list[dict]:
        return visible_events(ctx.deps.student_id)

    @agent.tool
    def create_event_tool(
        ctx: RunContext[ChronosDeps],
        title: str,
        date_value: str,
        kind: str = "holiday",
        scope: str = "global",
        student_id: str | None = None,
        end_date: str | None = None,
        notes: str = "",
    ) -> dict:
        return create_event(
            deps=ctx.deps,
            title=title,
            date_value=date_value,
            kind=kind,
            scope=scope,
            student_id=student_id,
            end_date=end_date,
            notes=notes,
        )

    @agent.tool
    def update_event_tool(
        ctx: RunContext[ChronosDeps],
        event_id: str,
        title: str | None = None,
        date_value: str | None = None,
        end_date: str | None = None,
        notes: str | None = None,
    ) -> dict:
        return update_event(
            deps=ctx.deps,
            event_id=event_id,
            title=title,
            date_value=date_value,
            end_date=end_date,
            notes=notes,
        )

    @agent.tool
    def delete_event_tool(ctx: RunContext[ChronosDeps], event_id: str) -> bool:
        return delete_event(deps=ctx.deps, event_id=event_id)

    @agent.tool
    def list_us_holidays_tool(ctx: RunContext[ChronosDeps]) -> list[dict]:
        _ = ctx
        start, end, rows = holidays_in_school_year()
        return [{"date": d, "name": n, "school_year_start": start, "school_year_end": end} for d, n in rows]

    @agent.tool
    def import_us_holidays_tool(ctx: RunContext[ChronosDeps]) -> dict:
        created = import_holidays_for_school_year(ctx.deps)
        return {"created": created}

    return agent


def _latest_user_message(messages: list[dict]) -> str:
    for msg in reversed(messages):
        if msg.get("role") == "user":
            return str(msg.get("content", "")).strip()
    return ""


def _system_prompt() -> str:
    return load_agent_spec("chronos") or "You are Chronos, a scheduling agent."


def _llama_model_name() -> str:
    model_file = os.getenv("LLAMA_MODEL_FILE", "")
    if model_file.endswith(".gguf"):
        return model_file[:-5]
    return model_file or ""


def _chat_with_llama(messages: list[dict]) -> str | None:
    llama_url = os.getenv("LLAMA_BASE_URL", "http://llama-server:8080")
    model_name = _llama_model_name()
    payload_messages = [{"role": "system", "content": _system_prompt()}] + messages[-14:]
    try:
        resp = requests.post(
            f"{llama_url}/v1/chat/completions",
            json={
                "model": model_name,
                "messages": payload_messages,
                "temperature": 0.25,
                "max_tokens": 280,
            },
            timeout=45,
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("choices", [{}])[0].get("message", {}).get("content", "") or None
    except Exception:
        return None


def _chat_with_llama_payload(payload_messages: list[dict]) -> str | None:
    llama_url = os.getenv("LLAMA_BASE_URL", "http://llama-server:8080")
    model_name = _llama_model_name()
    try:
        resp = requests.post(
            f"{llama_url}/v1/chat/completions",
            json={
                "model": model_name,
                "messages": payload_messages,
                "temperature": 0.25,
                "max_tokens": 280,
            },
            timeout=45,
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("choices", [{}])[0].get("message", {}).get("content", "") or None
    except Exception:
        return None


def _naturalize_tool_result(user_text: str, tool_reply: str) -> str | None:
    prompt = [
        {
            "role": "system",
            "content": (
                _system_prompt()
                + "\nUse the provided tool result as ground truth."
                + "\nRespond naturally in 1-2 concise sentences."
                + "\nAnswer the user's exact question first, then optional context."
                + "\nDo not include chain-of-thought or internal reasoning."
            ),
        },
        {
            "role": "user",
            "content": (
                f"User request: {user_text}\n"
                f"Tool result (authoritative): {tool_reply}\n"
                "Return only the final user-facing response."
            ),
        },
    ]

    # Try twice before giving up.
    reply = _chat_with_llama_payload(prompt)
    if reply:
        return _sanitize_llm_text(reply)
    return _sanitize_llm_text(_chat_with_llama_payload(prompt))


def _is_incomplete_nlg(text: str | None) -> bool:
    if not text:
        return True
    trimmed = text.strip()
    if len(trimmed) < 12:
        return True
    if len(trimmed) < 80 and trimmed[-1] not in ".!?":
        return True
    return False


def _sanitize_llm_text(text: str | None) -> str | None:
    if not text:
        return text
    cleaned = re.sub(r"<\|tool_call\|>.*", "", text, flags=re.IGNORECASE | re.DOTALL)
    cleaned = re.sub(r"\bcall:tool_code\b.*", "", cleaned, flags=re.IGNORECASE | re.DOTALL)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()
    return cleaned


def count_school_days(start: date, end: date, holiday_dates: set[str]) -> int:
    """Count weekdays between start (exclusive) and end (inclusive), minus holidays."""
    count = 0
    current = start + timedelta(days=1)
    while current <= end:
        if current.weekday() < 5 and current.isoformat() not in holiday_dates:
            count += 1
        current += timedelta(days=1)
    return count


def _school_days_until_summer() -> dict:
    """Deterministically count remaining school days using Python — never trust the LLM for this."""
    cal = _system_calendar()
    today = date.today()
    end_str = cal.get("school_year_end", "")
    if not end_str:
        return {"reply": "No school year end date is configured. Set it in Calendar Settings.", "actions": ["school_days_error"]}
    try:
        end = date.fromisoformat(end_str)
    except ValueError:
        return {"reply": f"School year end date '{end_str}' is not valid.", "actions": ["school_days_error"]}

    if today > end:
        return {"reply": "The school year has already ended — enjoy summer!", "actions": ["school_days_done"]}

    _, _, holiday_rows = holidays_in_school_year()
    holiday_dates = {d for d, _ in holiday_rows}
    remaining = count_school_days(today, end, holiday_dates)

    # Find the next holiday in the window for context.
    upcoming = next(
        ((d, n) for d, n in sorted(holiday_rows) if date.fromisoformat(d) > today and date.fromisoformat(d) <= end),
        None,
    )
    note = f" The only holiday in this window is {upcoming[1]} on {upcoming[0]}." if upcoming else " No holidays remain in the school year."

    return {
        "reply": f"You have {remaining} school days left before summer (through {end_str}).{note}",
        "actions": ["count_school_days"],
    }


def _next_holiday() -> dict:
    """Return the next upcoming US federal holiday and how many weeks away it is."""
    today = date.today()
    _, _, rows = holidays_in_school_year()
    upcoming = [(d, n) for d, n in rows if date.fromisoformat(d) > today]
    if not upcoming:
        return {"reply": "There are no more holidays in the school year.", "actions": ["next_holiday"]}
    next_date_str, next_name = min(upcoming, key=lambda x: x[0])
    next_date = date.fromisoformat(next_date_str)
    days_away = (next_date - today).days
    weeks, extra_days = divmod(days_away, 7)
    if weeks == 0:
        timing = f"{days_away} day{'s' if days_away != 1 else ''}"
    elif extra_days == 0:
        timing = f"{weeks} week{'s' if weeks != 1 else ''} exactly"
    else:
        timing = f"{weeks} week{'s' if weeks != 1 else ''} and {extra_days} day{'s' if extra_days != 1 else ''}"
    return {
        "reply": f"Your next holiday is **{next_name}** on {next_date_str} — {timing} away.",
        "actions": ["next_holiday"],
    }


def _is_tool_intent(text: str) -> bool:
    t = text.lower()
    holiday_query = "holiday" in t
    today_query = (
        ("today" in t and "date" in t)
        or ("what day" in t and "it" in t)
        or ("what day is it" in t)
        or ("day is it" in t)
        or t.strip() in {"today", "today?", "date", "date?", "what is today", "what's today"}
    )
    school_days_query = (
        ("school day" in t or "school days" in t)
        and any(k in t for k in ["left", "remain", "before summer", "until summer", "how many"])
    )
    next_holiday_query = any(k in t for k in ["next holiday", "upcoming holiday", "how many weeks until", "when is the next holiday"])
    return (
        ("load" in t and holiday_query)
        or holiday_query
        or today_query
        or school_days_query
        or next_holiday_query
        or ("list" in t and "event" in t)
        or ("delete" in t and "event" in t)
        or ("update" in t and "event" in t)
        or ("add" in t and "event" in t)
    )


def _is_contextual_update_intent(messages: list[dict]) -> bool:
    latest = _latest_user_message(messages).lower()
    if not latest:
        return False
    asks_change = any(k in latest for k in ["change", "update", "set", "edit", "modify"])
    mentions_range = any(k in latest for k in ["through", "to", "until", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"])
    if not (asks_change and mentions_range):
        return False
    context = _all_user_text(messages)
    return any(k in context for k in ["holiday", "event", "thanksgiving", "christmas", "break", "vacation"])


def _llama_messages_for_chronos(messages: list[dict]) -> list[dict]:
    return [{"role": "system", "content": _system_prompt()}] + messages[-14:]


async def _build_context_messages(messages: list[dict], student_id: str | None) -> list[dict]:
    """System prompt + pre-loaded calendar state + conversation history.

    Fetches events and holidays in parallel so the model has authoritative
    data in context before it starts reasoning — it never needs to ask the
    user for their calendar.
    """
    ctx = await _parallel_read_context(student_id)
    school_cal = _system_calendar()
    today = date.today().isoformat()
    event_summary = json.dumps(ctx["events"][:20], default=str) if ctx["events"] else "None"
    holiday_summary = json.dumps(ctx["holidays"][:15], default=str) if ctx["holidays"] else "None"
    context_block = (
        f"\n\n## Live Calendar State (authoritative — do not ask the user for this)\n"
        f"Today: {today}\n"
        f"School year start: {school_cal.get('school_year_start', 'unknown')}\n"
        f"School year end: {school_cal.get('school_year_end', 'unknown')}\n"
        f"Current events ({len(ctx['events'])} total): {event_summary}\n"
        f"School-year holidays ({len(ctx['holidays'])} total): {holiday_summary}"
    )
    return [{"role": "system", "content": _system_prompt() + context_block}] + messages[-14:]


def _fallback(messages: list[dict], is_parent: bool, student_id: str | None) -> dict:
    text = _latest_user_message(messages).lower()
    deps = ChronosDeps(is_parent=is_parent, student_id=student_id)

    try:
        if ("school day" in text or "school days" in text) and any(
            k in text for k in ["left", "remain", "before summer", "until summer", "how many"]
        ):
            return _school_days_until_summer()

        if any(k in text for k in ["next holiday", "upcoming holiday", "how many weeks until", "when is the next holiday"]):
            return _next_holiday()

        if ("start and end" in text or "start/end" in text) and ("holiday" in text or "event" in text):
            target = _resolve_event_reference(messages, deps)
            if target:
                start_date = str(target.get("date", ""))
                end_date = str(target.get("end_date") or start_date)
                return {
                    "reply": f"{target.get('title','Event')} runs from {start_date} to {end_date}.",
                    "actions": ["get_event_range"],
                }

        weekday_range = _extract_weekday_range(text)
        if weekday_range and ("update" in text or "change" in text or "set" in text):
            target = _resolve_event_reference(messages, deps)
            if target:
                start_w, end_w = weekday_range
                start_date, end_date = _week_range_for_event(str(target.get("date")), start_w, end_w)
                updated = update_event(
                    deps=deps,
                    event_id=str(target.get("id")),
                    date_value=start_date,
                    end_date=end_date,
                )
                return {
                    "reply": f"Updated {updated.get('title','event')} to run from {start_date} to {end_date}.",
                    "actions": ["update_event_range"],
                }

        if ("monday" in text and "friday" in text) and ("update" in text or "change" in text):
            target = _resolve_event_reference(messages, deps)
            if target:
                monday, friday = _week_monday_friday(str(target.get("date")))
                updated = update_event(
                    deps=deps,
                    event_id=str(target.get("id")),
                    date_value=monday,
                    end_date=friday,
                )
                return {
                    "reply": f"Updated {updated.get('title','event')} to run from {monday} to {friday}.",
                    "actions": ["update_event_range"],
                }

        date_holiday_answer = _answer_is_date_holiday(text)
        if date_holiday_answer:
            return {
                "reply": date_holiday_answer,
                "actions": ["check_holiday_date"],
            }

        if (
            ("today" in text and "date" in text)
            or ("what day" in text and "it" in text)
            or ("what day is it" in text)
            or ("day is it" in text)
            or text.strip() in {"today", "today?", "date", "date?", "what is today", "what's today"}
        ):
            today = date.today().isoformat()
            return {
                "reply": f"Today is {today}.",
                "actions": ["get_today_date"],
            }

        if (
            "holiday" in text and (
                "load" in text
                or "import" in text
                or ("add" in text and "calendar" in text)
            )
            and not _extract_iso_dates(text)
            and "from" not in text
        ):
            created = import_holidays_for_school_year(deps)
            return {"reply": f"Imported {created} US federal holidays into the global school calendar.", "actions": [f"create_event x{created} (global holidays)"]}

        if (
            ("holiday" in text or "break" in text or "vacation" in text)
            and ("add" in text or "create" in text or "schedule" in text)
        ):
            dates = _extract_iso_dates(text)
            if dates:
                start_date = dates[0]
                end_date = dates[1] if len(dates) > 1 else None
                title = _extract_event_title(text, fallback="School Holiday")
                scope = "global" if deps.is_parent else "student"
                event = create_event(
                    deps=deps,
                    title=title,
                    date_value=start_date,
                    end_date=end_date,
                    kind="holiday" if "holiday" in text or "break" in text else "vacation",
                    scope=scope,
                    student_id=deps.student_id if scope == "student" else None,
                    notes="Added by Chronos",
                )
                range_text = f" ({start_date} to {end_date})" if end_date else f" ({start_date})"
                return {
                    "reply": f"Added {event.get('title')}{range_text} to the {scope} calendar.",
                    "actions": ["create_event_range" if end_date else "create_event"],
                }

        if "holiday" in text:
            today = date.today().isoformat()
            today_dt = date.today()
            relative_end = _extract_relative_range_end(text, today_dt)

            asks_remaining_calendar_year = (
                "school year" not in text and
                "year" in text and (
                    "rest of the year" in text
                    or "remainder of the year" in text
                    or "remain" in text
                )
            )

            asks_remaining_school_year = (
                "school year" in text and (
                    "rest" in text or "remain" in text or "remainder" in text
                )
            )

            if relative_end:
                end_dt, range_label = relative_end
                end_date = end_dt.isoformat()
                rows = holidays_in_date_range(today, end_date)
                preview = "\n".join([f"- {d}: {n}" for d, n in rows[:24]])
                return {
                    "reply": f"US federal holidays for the {range_label} ({today} to {end_date}):\n{preview}" if preview else f"No US federal holidays occur in the {range_label} ({today} to {end_date}).",
                    "actions": ["list_us_holidays_relative_range"],
                }

            if asks_remaining_calendar_year:
                year_end = f"{date.today().year}-12-31"
                rows = holidays_in_date_range(today, year_end)
                preview = "\n".join([f"- {d}: {n}" for d, n in rows[:20]])
                return {
                    "reply": f"US federal holidays from {today} through {year_end}:\n{preview}" if preview else f"No US federal holidays remain between {today} and {year_end}.",
                    "actions": ["list_us_holidays_remaining_year"],
                }

            if asks_remaining_school_year:
                start, end, rows = holidays_in_school_year()
                rows = [r for r in rows if r[0] >= today]
                preview = "\n".join([f"- {d}: {n}" for d, n in rows[:20]])
                return {
                    "reply": f"US federal holidays remaining in the school year ({today} to {end}):\n{preview}" if preview else f"No US federal holidays remain in the school year after {today}.",
                    "actions": ["list_us_holidays_remaining_school_year"],
                }

            start, end, rows = holidays_in_school_year()
            preview = "\n".join([f"- {d}: {n}" for d, n in rows[:16]])
            return {"reply": f"US federal holidays during {start} to {end}:\n{preview}", "actions": ["list_us_holidays"]}

        if "list" in text and "event" in text:
            rows = visible_events(student_id)
            preview = "\n".join([f"- {e.get('id')[:8]} {e.get('date')} {e.get('title')} ({e.get('scope')})" for e in rows[:20]])
            return {"reply": f"Current calendar events:\n{preview}" if preview else "No events found.", "actions": ["list_events"]}
    except Exception as exc:
        return {"reply": f"Chronos hit an error: {exc}", "actions": []}

    return {
        "reply": "Chronos can manage calendar CRUD and US holiday imports. Ask me to list events, import US holidays, or update specific dates.",
        "actions": [],
    }


async def run_chronos(messages: list[dict], *, is_parent: bool, student_id: str | None) -> dict:
    async with inference_lock:
        global _agent
        if _agent is None and STABLE_TOOLING:
            try:
                _agent = _build_agent()
            except Exception as exc:
                logger.warning("Chronos agent init failed, falling back: %r", exc)
                _agent = None

        user_text = _latest_user_message(messages)
        if not user_text:
            return {"reply": "Tell me what to change on the calendar.", "actions": []}

        # Hybrid intent-first path: deterministic tools first for reliability/latency.
        if _is_tool_intent(user_text) or _is_contextual_update_intent(messages):
            result = _fallback(messages, is_parent, student_id)
            styled = _naturalize_tool_result(user_text, result.get("reply", ""))
            if _is_incomplete_nlg(styled):
                styled = result.get("reply", "")
            return {
                "reply": styled or result.get("reply", ""),
                "actions": result.get("actions", []) + ["llm_nlg"],
            }

        if _agent is None:
            llm_reply = _chat_with_llama(messages)
            if llm_reply:
                return {"reply": llm_reply, "actions": ["llm_chat"]}
            return _fallback(messages, is_parent, student_id)

        try:
            deps = ChronosDeps(is_parent=is_parent, student_id=student_id)
            # Pre-load read-only context in parallel before the model starts reasoning.
            ctx = await _parallel_read_context(student_id)
            context_block = (
                f"Pre-loaded calendar state ({len(ctx['events'])} events): "
                + json.dumps(ctx["events"][:20], default=str)
                + f"\nUpcoming school-year holidays ({len(ctx['holidays'])}): "
                + json.dumps(ctx["holidays"][:15], default=str)
            )
            transcript = "\n".join([
                f"{m.get('role', 'user')}: {str(m.get('content', '')).strip()}" for m in messages[-14:]
            ])
            prompt = (
                f"Context (fetched in parallel, authoritative):\n{context_block}\n\n"
                f"Conversation so far:\n{transcript}\n\nRespond as Chronos and use tools when needed."
            )
            result = await asyncio.wait_for(_agent.run(prompt, deps=deps), timeout=35)
            data = result.output
            return {"reply": data.reply, "actions": data.actions}
        except Exception as exc:
            logger.warning("Chronos PydanticAI path failed, using fallback: %r", exc)
            llm_reply = _chat_with_llama(messages)
            if llm_reply:
                return {"reply": llm_reply, "actions": ["llm_chat_fallback"]}
            return _fallback(messages, is_parent, student_id)


async def stream_chronos(messages: list[dict], *, is_parent: bool, student_id: str | None):
    async with inference_lock:
        user_text = _latest_user_message(messages)
        if not user_text:
            yield {"type": "final", "reply": "Tell me what to change on the calendar.", "thinking": "", "actions": []}
            return

        if _is_tool_intent(user_text) or _is_contextual_update_intent(messages):
            result = _fallback(messages, is_parent, student_id)
            llama_url = os.getenv("LLAMA_BASE_URL", "http://llama-server:8080")
            model_name = _llama_model_name()
            payload = {
                "model": model_name,
                "messages": [
                    {
                        "role": "system",
                        "content": _system_prompt() + "\nUse the provided tool result as ground truth. Respond naturally in 1-2 concise sentences. Answer the user's exact question first. Do not include chain-of-thought.",
                    },
                    {
                        "role": "user",
                        "content": f"User request: {user_text}\nTool result (authoritative): {result.get('reply','')}\nReturn the final response to the user.",
                    },
                ],
                "temperature": 0.25,
                "max_tokens": 300,
                "stream": True,
            }

            full_content = ""
            full_thinking = ""
            try:
                client = _get_http_client()
                async with client.stream("POST", f"{llama_url}/v1/chat/completions", json=payload) as resp:
                        if resp.status_code >= 400:
                            raise RuntimeError(f"stream status {resp.status_code}")
                        async for line in resp.aiter_lines():
                            if not line or not line.startswith("data:"):
                                continue
                            data = line[5:].strip()
                            if data == "[DONE]":
                                break
                            try:
                                chunk = json.loads(data)
                            except Exception:
                                continue
                            delta = (chunk.get("choices") or [{}])[0].get("delta", {})
                            thinking_piece = delta.get("reasoning_content")
                            if thinking_piece:
                                full_thinking += thinking_piece
                                yield {"type": "thinking", "delta": thinking_piece}
                            content_piece = delta.get("content")
                            if content_piece:
                                full_content += content_piece
                                yield {"type": "delta", "delta": content_piece}

                safe_content = _sanitize_llm_text(full_content.strip())
                yield {
                    "type": "final",
                    "reply": (safe_content if not _is_incomplete_nlg(safe_content) else result.get("reply", "")) or result.get("reply", ""),
                    "thinking": full_thinking.strip(),
                    "actions": result.get("actions", []) + ["llm_nlg_stream"],
                }
                return
            except Exception:
                styled = _naturalize_tool_result(user_text, result.get("reply", ""))
                if _is_incomplete_nlg(styled):
                    styled = result.get("reply", "")
                yield {
                    "type": "final",
                    "reply": styled or result.get("reply", ""),
                    "thinking": "",
                    "actions": result.get("actions", []) + ["llm_nlg_fallback"],
                }
                return

        llama_url = os.getenv("LLAMA_BASE_URL", "http://llama-server:8080")
        model_name = _llama_model_name()
        payload = {
            "model": model_name,
            "messages": await _build_context_messages(messages, student_id),
            "temperature": 0.25,
            "max_tokens": 2048,
            "stream": True,
        }

        full_content = ""
        full_thinking = ""

        try:
            client = _get_http_client()
            async with client.stream("POST", f"{llama_url}/v1/chat/completions", json=payload) as resp:
                    if resp.status_code >= 400:
                        fallback = _chat_with_llama(messages)
                        if fallback:
                            yield {"type": "final", "reply": fallback, "thinking": "", "actions": ["llm_chat_fallback"]}
                            return
                        yield {"type": "error", "error": f"LLM stream failed ({resp.status_code})"}
                        return

                    async for line in resp.aiter_lines():
                        if not line or not line.startswith("data:"):
                            continue
                        data = line[5:].strip()
                        if data == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data)
                        except Exception:
                            continue

                        delta = (chunk.get("choices") or [{}])[0].get("delta", {})
                        thinking_piece = delta.get("reasoning_content")
                        if thinking_piece:
                            full_thinking += thinking_piece
                            yield {"type": "thinking", "delta": thinking_piece}

                        content_piece = delta.get("content")
                        if content_piece:
                            full_content += content_piece
                            yield {"type": "delta", "delta": content_piece}

            if not full_content:
                fallback = _chat_with_llama(messages)
                if fallback:
                    full_content = fallback

            yield {
                "type": "final",
                "reply": full_content.strip() or "Chronos is ready.",
                "thinking": full_thinking.strip(),
                "actions": ["llm_stream"],
            }
        except Exception as exc:
            logger.warning("Chronos stream failed, using fallback: %r", exc)
            fallback = _chat_with_llama(messages)
            if fallback:
                yield {"type": "final", "reply": fallback, "thinking": "", "actions": ["llm_chat_fallback"]}
                return
            fallback_tool = _fallback(messages, is_parent, student_id)
            yield {
                "type": "final",
                "reply": fallback_tool.get("reply", "Chronos unavailable"),
                "thinking": "",
                "actions": fallback_tool.get("actions", []),
            }
