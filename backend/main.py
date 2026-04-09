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
    from pathlib import Path
    llama_url = os.getenv("LLAMA_SERVER_URL", "http://localhost:8080")
    models_dir = Path("/models")
    model_file = os.getenv("LLAMA_MODEL", "")

    model_found = (models_dir / model_file).exists() if model_file else False
    gguf_files = list(models_dir.glob("*.gguf")) if models_dir.exists() else []

    return {
        "status": "ok",
        "llama_server": llama_url,
        "vault_path": os.getenv("VAULT_PATH", "/vault"),
        "models": {
            "expected": model_file,
            "found": model_found,
            "available": [f.name for f in gguf_files],
            "hint": (
                None if model_found
                else "Run scripts/download_models.sh to fetch GGUF models from Hugging Face."
            ),
        },
    }
