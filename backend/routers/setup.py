import asyncio
import json
import os
import threading
import uuid
from pathlib import Path

import psutil
import requests
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

router = APIRouter()

PROJECT_DIR = Path("/project")
MODELS_DIR = PROJECT_DIR / "models"
ENV_PATH = PROJECT_DIR / ".env"

MODEL_CATALOG = {
    "gemma4:e2b": {
        "label": "Gemma 4 E2B (Q4_K_M)",
        "file": "gemma-4-E2B-it-Q4_K_M.gguf",
        "url": "https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF/resolve/main/gemma-4-E2B-it-Q4_K_M.gguf?download=true",
    },
    "gemma4:e4b": {
        "label": "Gemma 4 E4B (Q4_K_M)",
        "file": "gemma-4-E4B-it-Q4_K_M.gguf",
        "url": "https://huggingface.co/unsloth/gemma-4-E4B-it-GGUF/resolve/main/gemma-4-E4B-it-Q4_K_M.gguf?download=true",
    },
    "gemma4:26b": {
        "label": "Gemma 4 26B-A4B (UD-Q4_K_M)",
        "file": "gemma-4-26B-A4B-it-UD-Q4_K_M.gguf",
        "url": "https://huggingface.co/unsloth/gemma-4-26B-A4B-it-GGUF/resolve/main/gemma-4-26B-A4B-it-UD-Q4_K_M.gguf?download=true",
    },
}

# ── Shared session state ──────────────────────────────────────
_sessions: dict[str, dict] = {}


def _ws_emit(ws_manager, loop, event: str, data: dict):
    """Fire-and-forget WebSocket broadcast from a background thread."""
    if ws_manager is None or loop is None:
        return
    try:
        asyncio.run_coroutine_threadsafe(ws_manager.broadcast(event, data), loop)
    except Exception:
        pass


def _env_value(key: str, default: str = "") -> str:
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text().splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            k, v = stripped.split("=", 1)
            if k.strip() == key:
                return v.strip()
    return os.getenv(key, default)


# ── Schemas ───────────────────────────────────────────────────

class SetupConfig(BaseModel):
    model: str | None = Field(default=None)
    model_name: str | None = Field(default=None)


class ActivateConfig(BaseModel):
    model: str | None = Field(default=None)
    model_name: str | None = Field(default=None)


# ── System info ───────────────────────────────────────────────

@router.get("/sysinfo")
async def sysinfo():
    """Return host RAM, CPU count, and a recommended model key.

    HOST_RAM_GB / HOST_CPU_CORES are injected by the launcher scripts
    (sysctl on macOS, wmic on Windows) before Docker starts, giving the
    real hardware values regardless of Docker memory limits.
    """
    # Prefer launcher-supplied host values — they are always accurate.
    host_ram_env = os.getenv("HOST_RAM_GB", "").strip()
    host_cpu_env = os.getenv("HOST_CPU_CORES", "").strip()

    vm = psutil.virtual_memory()

    if host_ram_env and host_ram_env != "0":
        ram_gb = float(host_ram_env)
    else:
        ram_gb = vm.total / (1024 ** 3)

    if host_cpu_env and host_cpu_env != "0":
        cpu_cores = int(host_cpu_env)
    else:
        cpu_cores = psutil.cpu_count(logical=False) or psutil.cpu_count(logical=True)

    # Available RAM is always live from psutil — reflects current usage on host.
    available_gb = vm.available / (1024 ** 3)

    # Recommend based on available RAM so we don't suggest a model that
    # won't fit alongside whatever the user already has running.
    if available_gb >= 20:
        recommended = "gemma4:26b"
    elif available_gb >= 5:
        recommended = "gemma4:e4b"
    else:
        recommended = "gemma4:e2b"

    return {
        "ram_gb":       round(ram_gb, 1),
        "available_gb": round(available_gb, 1),
        "cpu_cores":    cpu_cores,
        "recommended":  recommended,
    }


# ── Status ────────────────────────────────────────────────────

@router.get("/status")
async def setup_status():
    """Check whether a local GGUF model is configured and present."""
    configured = _env_value("LLAMA_MODEL_FILE", "").strip()
    configured_path = MODELS_DIR / configured if configured else None

    available_files = sorted([p.name for p in MODELS_DIR.glob("*.gguf")]) if MODELS_DIR.exists() else []
    has_model = bool(configured_path and configured_path.exists()) or bool(available_files)

    return {
        "needs_setup": not has_model,
        "models_available": available_files,
        "configured_model": configured if configured else None,
    }


@router.get("/models")
async def list_models():
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    active_file = _env_value("LLAMA_MODEL_FILE", "").strip() or None

    model_rows = []
    known_files = set()
    for model_id, meta in MODEL_CATALOG.items():
        file_path = MODELS_DIR / meta["file"]
        known_files.add(meta["file"])
        model_rows.append({
            "id": model_id,
            "label": meta["label"],
            "file": meta["file"],
            "url": meta["url"],
            "downloaded": file_path.exists() and file_path.stat().st_size > 0,
            "size_bytes": file_path.stat().st_size if file_path.exists() else 0,
            "active": active_file == meta["file"],
        })

    extras = []
    for file_path in sorted(MODELS_DIR.glob("*.gguf")):
        if file_path.name in known_files:
            continue
        extras.append({
            "id": file_path.stem,
            "label": file_path.name,
            "file": file_path.name,
            "url": None,
            "downloaded": True,
            "size_bytes": file_path.stat().st_size,
            "active": active_file == file_path.name,
        })

    return {
        "active_file": active_file,
        "models": model_rows,
        "extra_models": extras,
    }


@router.post("/activate")
async def activate_model(config: ActivateConfig, request: Request):
    requested_model = (config.model or config.model_name or "").strip()
    if not requested_model:
        raise HTTPException(status_code=400, detail="Missing model name")

    if requested_model in MODEL_CATALOG:
        model_file = MODEL_CATALOG[requested_model]["file"]
        model_name = requested_model
        label = MODEL_CATALOG[requested_model]["label"]
    else:
        model_file = requested_model
        model_name = requested_model.replace(".gguf", "")
        label = model_file

    source_path = MODELS_DIR / model_file
    if not source_path.exists() or source_path.stat().st_size == 0:
        raise HTTPException(status_code=404, detail=f"Model file '{model_file}' not found")

    _write_env(model_name, model_file)

    ws_manager = getattr(request.app.state, "ws_manager", None)
    loop = getattr(request.app.state, "loop", None)
    _ws_emit(ws_manager, loop, "model.activated", {
        "model_id": model_name,
        "label": label,
        "file": model_file,
        "restart_required": True,
    })

    return {
        "ok": True,
        "active_file": model_file,
        "active_model": model_name,
        "restart_required": True,
        "message": "Model target updated. Restart llama-server to fully apply the new model.",
    }


# ── Start pull ────────────────────────────────────────────────

@router.post("/start")
async def start_setup(config: SetupConfig, request: Request):
    requested_model = (config.model or config.model_name or "gemma4:e2b").strip()
    if requested_model not in MODEL_CATALOG:
        raise HTTPException(status_code=400, detail=f"Unknown model '{requested_model}'")

    model_meta = MODEL_CATALOG[requested_model]
    session_id = str(uuid.uuid4())
    _sessions[session_id] = {
        "status":  "starting",
        "model":   requested_model,
        "file":    {
            "label":      model_meta["label"],
            "status":     "pending",
            "downloaded": 0,
            "total":      0,
            "pct":        0,
            "filename":   model_meta["file"],
        },
        "files": {},
        "error": None,
    }
    _sessions[session_id]["files"] = {model_meta["file"]: _sessions[session_id]["file"]}

    ws_manager = getattr(request.app.state, "ws_manager", None)
    loop = getattr(request.app.state, "loop", None)

    thread = threading.Thread(
        target=_download_model,
        args=(session_id, requested_model, ws_manager, loop),
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

def _download_model(session_id: str, model_key: str, ws_manager=None, loop=None):
    state   = _sessions[session_id]
    f_state = state["file"]
    model_meta = MODEL_CATALOG[model_key]
    target_path = MODELS_DIR / model_meta["file"]

    state["status"]  = "downloading"
    f_state["status"] = "downloading"

    _ws_emit(ws_manager, loop, "model.download.start", {
        "model_id": model_key,
        "label": model_meta["label"],
        "file": model_meta["file"],
    })

    try:
        MODELS_DIR.mkdir(parents=True, exist_ok=True)

        if target_path.exists() and target_path.stat().st_size > 0:
            f_state.update({
                "status": "done",
                "total": target_path.stat().st_size,
                "downloaded": target_path.stat().st_size,
                "pct": 100,
            })
            state["status"] = "complete"
            _write_env(model_key, model_meta["file"])
            _ws_emit(ws_manager, loop, "model.download.complete", {
                "model_id": model_key,
                "label": model_meta["label"],
                "file": model_meta["file"],
                "cached": True,
            })
            return

        with requests.get(model_meta["url"], stream=True, timeout=30) as resp:
            resp.raise_for_status()
            total = int(resp.headers.get("content-length", 0))
            downloaded = 0
            last_emitted_pct = -1

            f_state.update({"total": total, "downloaded": 0, "pct": 0})

            with target_path.open("wb") as out:
                for chunk in resp.iter_content(chunk_size=1024 * 1024):
                    if not chunk:
                        continue
                    out.write(chunk)
                    downloaded += len(chunk)
                    pct = round(downloaded / total * 100, 1) if total else 0
                    f_state.update({
                        "downloaded": downloaded,
                        "pct": pct,
                        "status": "downloading",
                    })
                    # Emit WS progress every 10% to avoid flooding the feed
                    if pct - last_emitted_pct >= 10:
                        _ws_emit(ws_manager, loop, "model.download.progress", {
                            "model_id": model_key,
                            "label": model_meta["label"],
                            "pct": pct,
                            "downloaded_mb": round(downloaded / 1024 ** 2, 1),
                            "total_mb": round(total / 1024 ** 2, 1),
                        })
                        last_emitted_pct = pct

        f_state.update({"status": "done", "pct": 100, "layer": "downloaded"})
        state["status"] = "complete"
        _write_env(model_key, model_meta["file"])
        _ws_emit(ws_manager, loop, "model.download.complete", {
            "model_id": model_key,
            "label": model_meta["label"],
            "file": model_meta["file"],
            "cached": False,
        })

    except Exception as exc:
        if target_path.exists() and target_path.stat().st_size == 0:
            try:
                target_path.unlink()
            except Exception:
                pass
        state["status"] = "error"
        state["error"]  = str(exc)
        f_state["status"] = "error"
        _ws_emit(ws_manager, loop, "model.download.error", {
            "model_id": model_key,
            "label": model_meta["label"],
            "error": str(exc),
        })


# ── Write .env ────────────────────────────────────────────────

def _write_env(model_name: str, model_file: str):
    env_path     = PROJECT_DIR / ".env"
    example_path = PROJECT_DIR / ".env.example"

    if not env_path.exists() and example_path.exists():
        base = example_path.read_text()
    elif env_path.exists():
        base = env_path.read_text()
    else:
        base = ""

    updates = {
        "LLAMA_MODEL": model_name,
        "LLAMA_MODEL_FILE": model_file,
        "LLAMA_BASE_URL": "http://llama-server:8080",
    }

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


# ── Restart llama-server ──────────────────────────────────────

LLAMA_CONTAINER = "gemmaschool-llama"


@router.post("/restart")
async def restart_llama(request: Request):
    """Restart the llama-server container to load the newly activated model."""
    ws_manager = getattr(request.app.state, "ws_manager", None)

    if ws_manager:
        await ws_manager.broadcast("system.restarting", {
            "message": "Switching model — llama-server is restarting…",
        })

    asyncio.create_task(_do_restart(ws_manager))
    return {"ok": True, "message": "Restart initiated"}


async def _do_restart(ws_manager):
    llama_url = _env_value("LLAMA_BASE_URL", "http://llama-server:8080")
    loop = asyncio.get_running_loop()

    try:
        import docker as docker_sdk

        client = await loop.run_in_executor(None, docker_sdk.from_env)
        container = await loop.run_in_executor(None, client.containers.get, LLAMA_CONTAINER)
        await loop.run_in_executor(None, container.restart)

    except ImportError:
        if ws_manager:
            await ws_manager.broadcast("system.restart_failed", {
                "message": "docker SDK unavailable — restart manually.",
                "command": f"docker restart {LLAMA_CONTAINER}",
            })
        return
    except Exception as exc:
        if ws_manager:
            await ws_manager.broadcast("system.restart_failed", {
                "message": f"Restart failed: {exc}",
                "command": f"docker restart {LLAMA_CONTAINER}",
            })
        return

    # Poll llama health until it's ready (model load can take a while)
    for _ in range(40):
        await asyncio.sleep(3)
        try:
            resp = requests.get(f"{llama_url}/health", timeout=3)
            if resp.ok:
                break
        except Exception:
            continue

    if ws_manager:
        await ws_manager.broadcast("system.online", {
            "message": "llama-server restarted with new model.",
        })
