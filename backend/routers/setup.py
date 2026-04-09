import asyncio
import json
import os
import threading
import uuid
from pathlib import Path

import psutil
import requests
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

router = APIRouter()

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://ollama:11434")
PROJECT_DIR     = Path("/project")

# ── Shared session state ──────────────────────────────────────
_sessions: dict[str, dict] = {}


# ── Schemas ───────────────────────────────────────────────────

class SetupConfig(BaseModel):
    model: str = "gemma4:4b"


# ── System info ───────────────────────────────────────────────

@router.get("/sysinfo")
async def sysinfo():
    """Return host RAM, CPU count, and a recommended Ollama model.

    HOST_RAM_GB / HOST_CPU_CORES are injected by the launcher scripts
    (sysctl on macOS, wmic on Windows) before Docker starts, giving the
    real hardware values regardless of Docker memory limits.
    """
    # Prefer launcher-supplied host values — they are always accurate.
    host_ram_env = os.getenv("HOST_RAM_GB", "").strip()
    host_cpu_env = os.getenv("HOST_CPU_CORES", "").strip()

    if host_ram_env and host_ram_env != "0":
        ram_gb = float(host_ram_env)
    else:
        ram_gb = psutil.virtual_memory().total / (1024 ** 3)

    if host_cpu_env and host_cpu_env != "0":
        cpu_cores = int(host_cpu_env)
    else:
        cpu_cores = psutil.cpu_count(logical=False) or psutil.cpu_count(logical=True)

    if ram_gb >= 16:
        recommended = "gemma4:12b"
    elif ram_gb >= 6:
        recommended = "gemma4:4b"
    else:
        recommended = "gemma4:2b"

    return {
        "ram_gb":      round(ram_gb, 1),
        "cpu_cores":   cpu_cores,
        "recommended": recommended,
    }


# ── Status ────────────────────────────────────────────────────

@router.get("/status")
async def setup_status():
    """Check whether a model is already pulled in Ollama."""
    try:
        resp = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=5)
        models = [m["name"] for m in resp.json().get("models", [])]
        has_model = len(models) > 0
        return {
            "needs_setup": not has_model,
            "models_available": models,
        }
    except Exception:
        # Ollama not reachable yet — show setup
        return {"needs_setup": True, "models_available": []}


# ── Start pull ────────────────────────────────────────────────

@router.post("/start")
async def start_setup(config: SetupConfig):
    session_id = str(uuid.uuid4())
    _sessions[session_id] = {
        "status":  "starting",
        "model":   config.model,
        "file":    {
            "label":      config.model,
            "status":     "pending",
            "downloaded": 0,
            "total":      0,
            "pct":        0,
        },
        "error": None,
    }

    thread = threading.Thread(
        target=_pull_model,
        args=(session_id, config.model),
        daemon=True,
    )
    thread.start()

    return {"session_id": session_id}


# ── SSE progress stream ───────────────────────────────────────

@router.get("/progress/{session_id}")
async def stream_progress(session_id: str):
    async def generator():
        if session_id not in _sessions:
            yield f"data: {json.dumps({'error': 'session not found'})}\n\n"
            return

        yield ": connected\n\n"

        while True:
            state = _sessions.get(session_id, {})
            yield f"data: {json.dumps(state)}\n\n"

            if state.get("status") in ("complete", "error"):
                break

            await asyncio.sleep(0.4)

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Background pull worker ────────────────────────────────────

def _pull_model(session_id: str, model_name: str):
    state   = _sessions[session_id]
    f_state = state["file"]

    state["status"]  = "downloading"
    f_state["status"] = "downloading"

    try:
        resp = requests.post(
            f"{OLLAMA_BASE_URL}/api/pull",
            json={"name": model_name, "stream": True},
            stream=True,
            timeout=None,   # pulls can take many minutes
        )
        resp.raise_for_status()

        for raw_line in resp.iter_lines():
            if not raw_line:
                continue
            try:
                data = json.loads(raw_line)
            except json.JSONDecodeError:
                continue

            status_text = data.get("status", "")

            # Layer download progress
            if "total" in data and "completed" in data:
                total     = data["total"]
                completed = data["completed"]
                f_state.update({
                    "total":      total,
                    "downloaded": completed,
                    "pct":        round(completed / total * 100, 1) if total else 0,
                    "status":     "downloading",
                    "layer":      status_text,
                })

            elif status_text == "success":
                f_state.update({"status": "done", "pct": 100})
                state["status"] = "complete"
                _write_env(model_name)
                return

            else:
                # Status messages: "pulling manifest", "verifying sha256", etc.
                f_state["layer"] = status_text

        # Stream ended without explicit success
        state["status"] = "complete"
        f_state.update({"status": "done", "pct": 100})
        _write_env(model_name)

    except Exception as exc:
        state["status"] = "error"
        state["error"]  = str(exc)
        f_state["status"] = "error"


# ── Write .env ────────────────────────────────────────────────

def _write_env(model_name: str):
    env_path     = PROJECT_DIR / ".env"
    example_path = PROJECT_DIR / ".env.example"

    if not env_path.exists() and example_path.exists():
        base = example_path.read_text()
    elif env_path.exists():
        base = env_path.read_text()
    else:
        base = ""

    updates = {"OLLAMA_MODEL": model_name}

    lines        = base.splitlines()
    written_keys: set[str] = set()
    new_lines    = []

    for line in lines:
        stripped = line.strip()
        if stripped.startswith("#") or "=" not in stripped:
            new_lines.append(line)
            continue
        key = stripped.split("=", 1)[0].strip()
        if key in updates:
            new_lines.append(f"{key}={updates[key]}")
            written_keys.add(key)
        else:
            new_lines.append(line)

    for key, val in updates.items():
        if key not in written_keys:
            new_lines.append(f"{key}={val}")

    try:
        env_path.write_text("\n".join(new_lines) + "\n")
    except Exception:
        pass   # non-fatal if /project not mounted
