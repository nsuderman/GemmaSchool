import json
import os
from datetime import date
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

VAULT_PATH = Path(os.getenv("VAULT_PATH", "/vault"))
SETTINGS_FILE = VAULT_PATH / "system_settings.json"


class Holiday(BaseModel):
    date: str
    label: str = "Holiday"


class CalendarSettings(BaseModel):
    school_year_start: str
    school_year_end: str
    holidays: list[Holiday] = []


def _default_calendar() -> dict:
    year = date.today().year
    return {
        "school_year_start": f"{year}-08-15",
        "school_year_end": f"{year + 1}-05-31",
        "holidays": [],
    }


def _load_settings() -> dict:
    if not SETTINGS_FILE.exists():
        return _default_calendar()
    try:
        data = json.loads(SETTINGS_FILE.read_text())
    except Exception:
        return _default_calendar()
    cal = data.get("calendar", {})
    merged = _default_calendar()
    merged.update({k: v for k, v in cal.items() if k in merged})
    return merged


def _save_calendar(settings: dict):
    VAULT_PATH.mkdir(parents=True, exist_ok=True)
    payload = {"calendar": settings}
    SETTINGS_FILE.write_text(json.dumps(payload, indent=2))


@router.get("/calendar")
async def get_calendar_settings():
    return _load_settings()


@router.put("/calendar")
async def update_calendar_settings(body: CalendarSettings):
    value = {
        "school_year_start": body.school_year_start,
        "school_year_end": body.school_year_end,
        "holidays": [h.model_dump() for h in body.holidays],
    }
    _save_calendar(value)
    return value
