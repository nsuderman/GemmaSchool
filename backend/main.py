from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os
import json
from pathlib import Path

from routers import quests, agents, setup, vault

load_dotenv()

app = FastAPI(title="GemmaSchool API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(setup.router,  prefix="/setup",  tags=["setup"])
app.include_router(quests.router, prefix="/quests", tags=["quests"])
app.include_router(agents.router, prefix="/agents", tags=["agents"])
app.include_router(vault.router,  prefix="/vault",  tags=["vault"])


# --- WebSocket Connection Manager ---

class ConnectionManager:
    def __init__(self):
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        self.active.remove(ws)

    async def broadcast(self, event: str, data: dict):
        message = json.dumps({"event": event, "data": data})
        for ws in list(self.active):
            try:
                await ws.send_text(message)
            except Exception:
                self.active.remove(ws)


manager = ConnectionManager()

# Make manager available to routers
app.state.ws_manager = manager

MODEL_FILE_TO_ID = {
    "gemma-4-E2B-it-Q4_K_M.gguf": "gemma4:e2b",
    "gemma-4-E4B-it-Q4_K_M.gguf": "gemma4:e4b",
    "gemma-4-26B-A4B-it-UD-Q4_K_M.gguf": "gemma4:26b",
}


def _env_value(key: str, default: str = "") -> str:
    env_path = Path("/project/.env")
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            k, v = stripped.split("=", 1)
            if k.strip() == key:
                return v.strip()
    return os.getenv(key, default)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()  # keep connection alive
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@app.get("/health")
async def health():
    import requests as _requests

    llama_url = _env_value("LLAMA_BASE_URL", "http://llama-server:8080")
    configured_model = _env_value("LLAMA_MODEL", "")
    configured_file = _env_value("LLAMA_MODEL_FILE", "")
    models_dir = Path("/project/models")

    active_file = configured_file
    active_model = configured_model
    active_target = models_dir / configured_file if configured_file else None

    if active_target and active_target.exists():
        if active_target.is_symlink():
            resolved = active_target.resolve().name
            active_file = resolved
            active_model = MODEL_FILE_TO_ID.get(resolved, configured_model or "unknown")
        else:
            active_file = active_target.name
            active_model = MODEL_FILE_TO_ID.get(active_file, configured_model or "unknown")

    available_files = sorted([p.name for p in models_dir.glob("*.gguf")]) if models_dir.exists() else []

    try:
        _requests.get(f"{llama_url}/health", timeout=3)
        llama_ok = True
    except Exception:
        llama_ok = False

    return {
        "status": "ok",
        "llama": llama_url,
        "llama_reachable": llama_ok,
        "vault_path": os.getenv("VAULT_PATH", "/vault"),
        "models": {
            "configured": configured_model,
            "configured_file": configured_file,
            "active": active_model,
            "active_file": active_file,
            "available_files": available_files,
            "hint": (
                None if active_file
                else "Use the setup wizard to download and configure a GGUF model."
            ),
        },
    }
