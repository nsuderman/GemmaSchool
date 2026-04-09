from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os
import json

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
    ollama_url = os.getenv("OLLAMA_BASE_URL", "http://ollama:11434")
    ollama_model = os.getenv("OLLAMA_MODEL", "")

    try:
        resp = _requests.get(f"{ollama_url}/api/tags", timeout=3)
        models = [m["name"] for m in resp.json().get("models", [])]
        ollama_ok = True
    except Exception:
        models = []
        ollama_ok = False

    return {
        "status": "ok",
        "ollama": ollama_url,
        "ollama_reachable": ollama_ok,
        "vault_path": os.getenv("VAULT_PATH", "/vault"),
        "models": {
            "configured": ollama_model,
            "available": models,
            "hint": (
                None if models
                else "Use the setup wizard to pull a Gemma model via Ollama."
            ),
        },
    }
