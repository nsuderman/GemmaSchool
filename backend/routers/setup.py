import asyncio
import json
import os
import threading
import uuid
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

router = APIRouter()

# ── Shared download state ─────────────────────────────────────
# session_id -> state dict updated by background threads
_sessions: dict[str, dict] = {}

MODELS_DIR = Path("/models")
PROJECT_DIR = Path("/project")  # mounted project root for .env write


# ── Schemas ───────────────────────────────────────────────────

class SetupConfig(BaseModel):
    hf_token: str
    logic_repo: str = "google/gemma-3-4b-it-qat-q4_0-gguf"
    logic_file: str = "gemma-3-4b-it-q4_0.gguf"
    vision_repo: str = "google/gemma-3-4b-it-qat-q4_0-gguf"
    vision_file: str = "gemma-3-4b-it-q4_0.gguf"
    gpu_layers: int = 0
    threads: int = 4
    ctx_size: int = 4096


# ── Status endpoint ───────────────────────────────────────────

@router.get("/status")
async def setup_status():
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    gguf_files = list(MODELS_DIR.glob("*.gguf"))
    expected = os.getenv("LLAMA_MODEL", "")
    model_found = (MODELS_DIR / expected).exists() if expected else False

    return {
        "needs_setup": not model_found and len(gguf_files) == 0,
        "model_found": model_found,
        "models_available": [f.name for f in gguf_files],
        "expected_model": expected,
    }


# ── Start download ────────────────────────────────────────────

@router.post("/start")
async def start_setup(config: SetupConfig):
    session_id = str(uuid.uuid4())

    _sessions[session_id] = {
        "status": "starting",
        "files": {},
        "error": None,
    }

    # Run downloads in a background thread (blocking IO)
    thread = threading.Thread(
        target=_run_downloads,
        args=(session_id, config),
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

        # Keep-alive comment so browser doesn't time out
        yield ": connected\n\n"

        while True:
            state = _sessions.get(session_id, {})
            yield f"data: {json.dumps(state)}\n\n"

            terminal = state.get("status") in ("complete", "error")
            if terminal:
                break

            await asyncio.sleep(0.4)

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ── Background worker ─────────────────────────────────────────

def _run_downloads(session_id: str, config: SetupConfig):
    state = _sessions[session_id]

    models_to_fetch = [
        {
            "key":  "logic",
            "repo": config.logic_repo,
            "file": config.logic_file,
            "label": "Logic Model (Architect / Scout / Director)",
        },
    ]

    # Only add vision as a separate download if it's a different file
    if config.vision_file != config.logic_file:
        models_to_fetch.append({
            "key":  "vision",
            "repo": config.vision_repo,
            "file": config.vision_file,
            "label": "Vision Model (Auditor)",
        })

    for model in models_to_fetch:
        key  = model["key"]
        repo = model["repo"]
        filename = model["file"]
        dest = MODELS_DIR / filename

        state["files"][key] = {
            "filename": filename,
            "label": model["label"],
            "status": "pending",
            "downloaded": 0,
            "total": 0,
            "pct": 0,
        }

    state["status"] = "downloading"

    for model in models_to_fetch:
        key      = model["key"]
        repo     = model["repo"]
        filename = model["file"]
        dest     = MODELS_DIR / filename

        # Skip if already downloaded
        if dest.exists() and dest.stat().st_size > 1_000_000:
            total = dest.stat().st_size
            state["files"][key].update({
                "status": "done",
                "downloaded": total,
                "total": total,
                "pct": 100,
            })
            continue

        file_state = state["files"][key]
        file_state["status"] = "downloading"

        # Resolve expected file size from HF metadata
        total_size = _get_hf_file_size(repo, filename, config.hf_token)
        file_state["total"] = total_size

        # Start size-polling thread
        stop_event = threading.Event()
        poll_thread = threading.Thread(
            target=_poll_file_size,
            args=(dest, total_size, file_state, stop_event),
            daemon=True,
        )
        poll_thread.start()

        # Download (blocking)
        try:
            _hf_download(repo, filename, config.hf_token, str(MODELS_DIR))
            stop_event.set()
            poll_thread.join(timeout=2)

            actual_size = dest.stat().st_size if dest.exists() else total_size
            file_state.update({
                "status": "done",
                "downloaded": actual_size,
                "total": actual_size,
                "pct": 100,
            })

        except Exception as exc:
            stop_event.set()
            poll_thread.join(timeout=2)
            state["status"] = "error"
            state["error"] = str(exc)
            return

    # Write .env and finish
    _write_env(config)
    state["status"] = "complete"


def _poll_file_size(dest: Path, total: int, file_state: dict, stop: threading.Event):
    while not stop.is_set():
        try:
            if dest.exists():
                current = dest.stat().st_size
                file_state["downloaded"] = current
                if total > 0:
                    file_state["pct"] = min(round(current / total * 100, 1), 99)
        except Exception:
            pass
        stop.wait(timeout=0.5)


def _get_hf_file_size(repo_id: str, filename: str, token: str) -> int:
    try:
        from huggingface_hub import hf_hub_url, get_hf_file_metadata
        url = hf_hub_url(repo_id=repo_id, filename=filename)
        meta = get_hf_file_metadata(url, token=token)
        return meta.size or 0
    except Exception:
        return 0


def _hf_download(repo_id: str, filename: str, token: str, local_dir: str):
    from huggingface_hub import hf_hub_download
    hf_hub_download(
        repo_id=repo_id,
        filename=filename,
        token=token,
        local_dir=local_dir,
        local_dir_use_symlinks=False,
    )


def _write_env(config: SetupConfig):
    """Write / update the .env file in the mounted project root."""
    env_path = PROJECT_DIR / ".env"
    example_path = PROJECT_DIR / ".env.example"

    # Start from .env.example if no .env exists yet
    if not env_path.exists() and example_path.exists():
        base = example_path.read_text()
    elif env_path.exists():
        base = env_path.read_text()
    else:
        base = ""

    updates = {
        "HF_TOKEN":        config.hf_token,
        "LLAMA_MODEL":     config.logic_file,
        "LLAMA_GPU_LAYERS": str(config.gpu_layers),
        "LLAMA_THREADS":   str(config.threads),
        "LLAMA_CTX_SIZE":  str(config.ctx_size),
        "GGUF_LOGIC_REPO": config.logic_repo,
        "GGUF_LOGIC_FILE": config.logic_file,
        "GGUF_VISION_REPO": config.vision_repo,
        "GGUF_VISION_FILE": config.vision_file,
    }

    lines = base.splitlines()
    written_keys: set[str] = set()
    new_lines = []

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

    # Append any keys not already in the file
    for key, val in updates.items():
        if key not in written_keys:
            new_lines.append(f"{key}={val}")

    env_path.write_text("\n".join(new_lines) + "\n")
