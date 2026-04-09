from fastapi import APIRouter, HTTPException
from pathlib import Path
import os
import re

router = APIRouter()

VAULT_PATH = Path(os.getenv("VAULT_PATH", "/vault"))
QUESTS_DIR = VAULT_PATH / "Daily_Quests"


@router.get("/")
async def list_quests():
    if not QUESTS_DIR.exists():
        return []
    files = sorted(QUESTS_DIR.glob("*.md"))
    return [{"name": f.stem, "file": f.name} for f in files]


@router.get("/{quest_name}")
async def get_quest(quest_name: str):
    # Sanitize to prevent path traversal
    safe_name = re.sub(r"[^a-zA-Z0-9_\-]", "", quest_name)
    path = QUESTS_DIR / f"{safe_name}.md"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Quest not found")
    return {"name": safe_name, "content": path.read_text()}


@router.patch("/{quest_name}/complete")
async def complete_quest(quest_name: str, request: dict):
    safe_name = re.sub(r"[^a-zA-Z0-9_\-]", "", quest_name)
    path = QUESTS_DIR / f"{safe_name}.md"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Quest not found")

    content = path.read_text()
    content = content.replace("status: pending", "status: completed", 1)
    path.write_text(content)

    return {"name": safe_name, "status": "completed"}
