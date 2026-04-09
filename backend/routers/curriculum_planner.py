import json
import os
from datetime import date, datetime, timedelta
from pathlib import Path

import requests
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

VAULT_PATH = Path(os.getenv("VAULT_PATH", "/vault"))
CURRICULUM_INDEX = VAULT_PATH / "Curriculum" / "curriculum_index.json"
SETTINGS_FILE = VAULT_PATH / "system_settings.json"
EVENTS_FILE = VAULT_PATH / "calendar_events.json"


class ProposeBody(BaseModel):
    lessons_target: int | None = None


class ChatBody(BaseModel):
    messages: list[dict]


def _load_curriculum_items() -> list[dict]:
    if not CURRICULUM_INDEX.exists():
        return []
    try:
        return json.loads(CURRICULUM_INDEX.read_text()).get("items", [])
    except Exception:
        return []


def _get_item(curriculum_id: str) -> dict:
    for item in _load_curriculum_items():
        if item.get("id") == curriculum_id:
            return item
    raise HTTPException(status_code=404, detail="Curriculum item not found")


def _calendar_settings() -> dict:
    if not SETTINGS_FILE.exists():
        year = date.today().year
        return {
            "school_year_start": f"{year}-08-15",
            "school_year_end": f"{year + 1}-05-31",
            "holidays": [],
        }
    try:
        return json.loads(SETTINGS_FILE.read_text()).get("calendar", {})
    except Exception:
        return {}


def _workdays(start: date, end: date, holidays: set[str]) -> list[date]:
    days = []
    cursor = start
    while cursor <= end:
        if cursor.weekday() < 5 and cursor.isoformat() not in holidays:
            days.append(cursor)
        cursor += timedelta(days=1)
    return days


def _blocked_dates(student_id: str) -> set[str]:
    blocked: set[str] = set()
    if not EVENTS_FILE.exists():
        return blocked
    try:
        events = json.loads(EVENTS_FILE.read_text()).get("events", [])
    except Exception:
        return blocked

    block_kinds = {"holiday", "vacation", "field_trip"}
    for e in events:
        kind = str(e.get("kind", "")).strip().lower()
        if kind not in block_kinds:
            continue

        scope = e.get("scope")
        if scope == "student" and e.get("student_id") != student_id:
            continue
        if scope not in {"global", "student"}:
            continue

        start_date = str(e.get("date", "")).strip()
        end_date = str(e.get("end_date") or start_date).strip()
        if not start_date:
            continue
        try:
            s = datetime.strptime(start_date, "%Y-%m-%d").date()
            t = datetime.strptime(end_date, "%Y-%m-%d").date()
        except Exception:
            continue
        if t < s:
            s, t = t, s
        cur = s
        while cur <= t:
            blocked.add(cur.isoformat())
            cur += timedelta(days=1)
    return blocked


def _extract_lessons(item: dict, default_count: int) -> list[str]:
    path = item.get("path")
    if not path:
        return [f"Lesson {i + 1}" for i in range(default_count)]

    target = VAULT_PATH / path
    if not target.exists() or target.suffix.lower() not in {".md", ".txt"}:
        return [f"Lesson {i + 1}" for i in range(default_count)]

    try:
        lines = [ln.strip("-#* \t") for ln in target.read_text(encoding="utf-8").splitlines()]
    except Exception:
        return [f"Lesson {i + 1}" for i in range(default_count)]

    lesson_lines = [ln for ln in lines if len(ln) >= 8][: max(default_count, 6)]
    if not lesson_lines:
        return [f"Lesson {i + 1}" for i in range(default_count)]
    return lesson_lines[: max(default_count, len(lesson_lines))]


@router.get("/curriculum/{curriculum_id}")
async def get_curriculum_item(curriculum_id: str):
    return _get_item(curriculum_id)


@router.post("/curriculum/{curriculum_id}/propose")
async def propose_schedule(curriculum_id: str, body: ProposeBody):
    item = _get_item(curriculum_id)
    cal = _calendar_settings()

    try:
        start = datetime.strptime(cal.get("school_year_start"), "%Y-%m-%d").date()
        end = datetime.strptime(cal.get("school_year_end"), "%Y-%m-%d").date()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid calendar settings")

    holiday_set = {h.get("date") for h in cal.get("holidays", []) if h.get("date")}
    holiday_set.update(_blocked_dates(item.get("student_id", "")))
    slots = _workdays(start, end, holiday_set)
    if not slots:
        raise HTTPException(status_code=400, detail="No school days available in selected calendar")

    lesson_count = body.lessons_target or min(len(slots), 36)
    lessons = _extract_lessons(item, lesson_count)
    lessons = lessons[: min(len(lessons), len(slots))]

    sessions = []
    for idx, lesson in enumerate(lessons):
        sessions.append({
            "day": idx + 1,
            "date": slots[idx].isoformat(),
            "lesson": lesson,
            "status": "planned",
        })

    return {
        "curriculum_id": curriculum_id,
        "student_id": item.get("student_id"),
        "grade_level": item.get("grade_level"),
        "subject": item.get("subject"),
        "semester": item.get("semester"),
        "calendar": {
            "school_year_start": start.isoformat(),
            "school_year_end": end.isoformat(),
            "holiday_count": len(holiday_set),
        },
        "sessions": sessions,
    }


@router.post("/curriculum/{curriculum_id}/chat")
async def chat_curriculum_agent(curriculum_id: str, body: ChatBody):
    item = _get_item(curriculum_id)
    llama_url = os.getenv("LLAMA_BASE_URL", "http://llama-server:8080")
    model_name = os.getenv("LLAMA_MODEL_FILE", "")
    if model_name.endswith(".gguf"):
        model_name = model_name[:-5]

    system_prompt = (
        "You are the GemmaSchool Curriculum Agent. Help a parent adjust a homeschool plan. "
        f"Student grade: {item.get('grade_level') or 'unknown'}. "
        f"Subject: {item.get('subject')}. Semester: {item.get('semester')}. "
        "Be practical, concise, and propose concrete schedule changes."
    )

    messages = [{"role": "system", "content": system_prompt}] + body.messages[-12:]

    try:
        resp = requests.post(
            f"{llama_url}/v1/chat/completions",
            json={
                "model": model_name or "",
                "messages": messages,
                "temperature": 0.3,
                "max_tokens": 350,
            },
            timeout=60,
        )
        resp.raise_for_status()
        data = resp.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        if content:
            return {"reply": content}
    except Exception:
        pass

    return {
        "reply": (
            "I can help adjust the plan. Share what should change (pace, difficulty, or sequence), "
            "and I will propose a revised weekly schedule."
        )
    }
