import json
import os
import uuid
from calendar import monthcalendar
from datetime import date, datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from agents.chronos import run_chronos, stream_chronos

router = APIRouter()

VAULT_PATH = Path(os.getenv("VAULT_PATH", "/vault"))
CALENDAR_FILE = VAULT_PATH / "calendar_events.json"
SYSTEM_SETTINGS_FILE = VAULT_PATH / "system_settings.json"


class CalendarEventBody(BaseModel):
    title: str
    date: str
    end_date: str | None = None
    kind: str = "holiday"   # holiday | vacation | field_trip | personal
    scope: str = "global"   # global | student
    student_id: str | None = None
    notes: str | None = None


class CalendarAgentBody(BaseModel):
    messages: list[dict]
    is_parent: bool = False
    student_id: str | None = None
    thread_id: str | None = None


_thread_memory: dict[str, dict] = {}
THREAD_TTL_SECONDS = 45 * 60
THREAD_MAX_MESSAGES = 24


def _prune_threads():
    now = datetime.utcnow().timestamp()
    stale = [tid for tid, data in _thread_memory.items() if now - data.get("updated_at", 0) > THREAD_TTL_SECONDS]
    for tid in stale:
        _thread_memory.pop(tid, None)


def _load_thread_messages(thread_id: str | None) -> list[dict]:
    if not thread_id:
        return []
    _prune_threads()
    data = _thread_memory.get(thread_id)
    if not data:
        return []
    return list(data.get("messages", []))


def _store_thread_turn(thread_id: str | None, user_message: str, assistant_reply: str):
    if not thread_id:
        return
    _prune_threads()
    history = _load_thread_messages(thread_id)
    history.append({"role": "user", "content": user_message})
    history.append({"role": "assistant", "content": assistant_reply})
    history = history[-THREAD_MAX_MESSAGES:]
    _thread_memory[thread_id] = {
        "messages": history,
        "updated_at": datetime.utcnow().timestamp(),
    }


def _latest_user(messages: list[dict]) -> str:
    for msg in reversed(messages):
        if msg.get("role") == "user":
            return str(msg.get("content", "")).strip()
    return ""


def _load_events() -> list[dict]:
    if not CALENDAR_FILE.exists():
        return []
    try:
        return json.loads(CALENDAR_FILE.read_text()).get("events", [])
    except Exception:
        return []


def _save_events(events: list[dict]):
    VAULT_PATH.mkdir(parents=True, exist_ok=True)
    CALENDAR_FILE.write_text(json.dumps({"events": events}, indent=2))


def _system_calendar() -> dict:
    if not SYSTEM_SETTINGS_FILE.exists():
        y = date.today().year
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


def _us_federal_holidays(year: int) -> list[tuple[str, str]]:
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


def _visible_events(student_id: str | None = None) -> list[dict]:
    events = _load_events()
    if not student_id:
        return events
    return [
        e for e in events
        if e.get("scope") == "global" or (e.get("scope") == "student" and e.get("student_id") == student_id)
    ]


def _create_event_row(*, title: str, date_value: str, kind: str, scope: str, student_id: str | None = None, notes: str = "") -> dict:
    body = CalendarEventBody(
        title=title,
        date=date_value,
        kind=kind,
        scope=scope,
        student_id=student_id,
        notes=notes,
    )
    _validate_event(body)
    row = {
        "id": str(uuid.uuid4()),
        "title": body.title.strip(),
        "date": body.date.strip(),
        "end_date": None,
        "kind": body.kind.strip() or "holiday",
        "scope": body.scope,
        "student_id": (body.student_id or "").strip() or None,
        "notes": (body.notes or "").strip(),
    }
    events = _load_events()
    events.append(row)
    _save_events(events)
    return row


def _validate_event(body: CalendarEventBody):
    if not body.title.strip():
        raise HTTPException(status_code=400, detail="title is required")
    if not body.date.strip():
        raise HTTPException(status_code=400, detail="date is required")
    if body.scope not in {"global", "student"}:
        raise HTTPException(status_code=400, detail="scope must be global or student")
    if body.scope == "student" and not (body.student_id or "").strip():
        raise HTTPException(status_code=400, detail="student_id is required for student events")


@router.get("/events")
async def list_events(student_id: str | None = None):
    return {"events": _visible_events(student_id)}


@router.post("/events")
async def create_event(body: CalendarEventBody):
    _validate_event(body)
    events = _load_events()

    row = {
        "id": str(uuid.uuid4()),
        "title": body.title.strip(),
        "date": body.date.strip(),
        "end_date": (body.end_date or "").strip() or None,
        "kind": body.kind.strip() or "holiday",
        "scope": body.scope,
        "student_id": (body.student_id or "").strip() or None,
        "notes": (body.notes or "").strip(),
    }
    events.append(row)
    _save_events(events)
    return row


@router.put("/events/{event_id}")
async def update_event(event_id: str, body: CalendarEventBody):
    _validate_event(body)
    events = _load_events()
    for i, e in enumerate(events):
        if e.get("id") == event_id:
            events[i] = {
                **e,
                "title": body.title.strip(),
                "date": body.date.strip(),
                "end_date": (body.end_date or "").strip() or None,
                "kind": body.kind.strip() or "holiday",
                "scope": body.scope,
                "student_id": (body.student_id or "").strip() or None,
                "notes": (body.notes or "").strip(),
            }
            _save_events(events)
            return events[i]
    raise HTTPException(status_code=404, detail="Event not found")


@router.delete("/events/{event_id}")
async def delete_event(event_id: str):
    events = _load_events()
    remaining = [e for e in events if e.get("id") != event_id]
    if len(remaining) == len(events):
        raise HTTPException(status_code=404, detail="Event not found")
    _save_events(remaining)
    return {"ok": True}


@router.post("/agent/chat")
async def calendar_agent_chat(body: CalendarAgentBody):
    history = _load_thread_messages(body.thread_id)
    merged = history + body.messages
    result = await run_chronos(
        merged,
        is_parent=body.is_parent,
        student_id=body.student_id,
    )
    user_text = _latest_user(body.messages)
    _store_thread_turn(body.thread_id, user_text, result.get("reply", ""))
    return result


@router.post("/agent/stream")
async def calendar_agent_stream(body: CalendarAgentBody):
    history = _load_thread_messages(body.thread_id)
    merged = history + body.messages
    user_text = _latest_user(body.messages)

    async def event_stream():
        final_reply = ""
        async for event in stream_chronos(
            merged,
            is_parent=body.is_parent,
            student_id=body.student_id,
        ):
            if event.get("type") == "final":
                final_reply = str(event.get("reply", ""))
            yield f"data: {json.dumps(event)}\n\n"

        if final_reply:
            _store_thread_turn(body.thread_id, user_text, final_reply)

    return StreamingResponse(event_stream(), media_type="text/event-stream")
