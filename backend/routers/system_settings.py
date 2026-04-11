import json
import logging
import os
import sys
import threading
import time
from datetime import date
from pathlib import Path

import docker
from fastapi import APIRouter
from pydantic import BaseModel

log = logging.getLogger(__name__)

router = APIRouter()

VAULT_PATH = Path(os.getenv("VAULT_PATH", "/vault"))
SETTINGS_FILE = VAULT_PATH / "system_settings.json"
PROJECT_NAME = os.getenv("COMPOSE_PROJECT_NAME", "gemmaschool")


class Holiday(BaseModel):
    date: str
    label: str = "Holiday"


class CalendarSettings(BaseModel):
    school_year_start: str
    school_year_end: str
    holidays: list[Holiday] = []


def _default_calendar() -> dict:
    today = date.today()
    # If today is before August, the current academic year started last year.
    year = today.year if today.month >= 8 else today.year - 1
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


def _stop_project_resources(project_name: str):
    time.sleep(1.2)
    try:
        client = docker.from_env()
    except Exception as exc:
        log.error("shutdown: cannot connect to Docker: %s", exc)
        sys.exit(1)

    current_container_id = os.getenv("HOSTNAME", "")
    log.info("shutdown: project=%s current_id=%s", project_name, current_container_id)

    # Primary: match by compose project label.
    containers = client.containers.list(
        all=True,
        filters={"label": f"com.docker.compose.project={project_name}"},
    )

    # Fallback: if label search returned nothing, match by name prefix.
    if not containers:
        log.warning("shutdown: no containers found by label, falling back to name prefix")
        all_containers = client.containers.list(all=True)
        containers = [c for c in all_containers if any(
            n.lstrip("/").startswith(project_name) for n in c.names
        )]

    log.info("shutdown: found %d container(s)", len(containers))

    def _stop(container):
        try:
            log.info("shutdown: stopping %s", container.name)
            container.stop(timeout=5)
        except Exception as exc:
            log.warning("shutdown: stop %s failed: %s", container.name, exc)
        try:
            container.remove(v=True, force=True)
        except Exception:
            pass

    # Stop all containers except self first.
    for container in containers:
        if current_container_id and container.id.startswith(current_container_id):
            continue
        _stop(container)

    # Best-effort network cleanup.
    try:
        networks = client.networks.list(
            filters={"label": f"com.docker.compose.project={project_name}"}
        )
        for net in networks:
            try:
                net.remove()
            except Exception:
                pass
    except Exception:
        pass

    # Finally stop self.
    for container in containers:
        if current_container_id and container.id.startswith(current_container_id):
            _stop(container)
            break

    # Hard exit in case the container.stop() call doesn't reach us.
    sys.exit(0)


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


@router.post("/runtime/stop")
async def stop_runtime():
    thread = threading.Thread(
        target=_stop_project_resources,
        args=(PROJECT_NAME,),
        daemon=True,
    )
    thread.start()
    return {
        "ok": True,
        "message": "Shutdown initiated. GemmaSchool containers will stop shortly.",
    }
