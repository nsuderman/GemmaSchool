from fastapi import APIRouter, HTTPException, Request
from pathlib import Path
import os
import re
import yaml

router = APIRouter()

VAULT_PATH = Path(os.getenv("VAULT_PATH", "/vault"))
QUESTS_DIR = VAULT_PATH / "Daily_Quests"


@router.get("/")
async def list_quests(student_id: str | None = None):
    if not QUESTS_DIR.exists():
        return []

    def parse_frontmatter(text: str) -> dict:
        if not text.startswith("---"):
            return {}
        parts = text.split("---", 2)
        if len(parts) < 3:
            return {}
        try:
            return yaml.safe_load(parts[1]) or {}
        except Exception:
            return {}

    files = sorted(QUESTS_DIR.glob("*.md"))
    rows = []
    for f in files:
        raw = f.read_text(encoding="utf-8")
        fm = parse_frontmatter(raw)
        quest_student = str(fm.get("student_id", "")).strip() or None
        if student_id and quest_student != student_id:
            continue
        rows.append({
            "name": f.stem,
            "file": f.name,
            "title": fm.get("title", f.stem),
            "subject": fm.get("subject", "General"),
            "status": fm.get("status", "pending"),
            "day": fm.get("day", 0),
            "student_id": quest_student,
        })
    return rows


@router.get("/{quest_name}")
async def get_quest(quest_name: str):
    # Sanitize to prevent path traversal
    safe_name = re.sub(r"[^a-zA-Z0-9_\-]", "", quest_name)
    path = QUESTS_DIR / f"{safe_name}.md"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Quest not found")
    return {"name": safe_name, "content": path.read_text()}


@router.patch("/{quest_name}/complete")
async def complete_quest(quest_name: str, req: Request):
    safe_name = re.sub(r"[^a-zA-Z0-9_\-]", "", quest_name)
    path = QUESTS_DIR / f"{safe_name}.md"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Quest not found")

    content = path.read_text()
    content = content.replace("status: pending", "status: completed", 1)
    path.write_text(content)

    ws_manager = getattr(req.app.state, "ws_manager", None)
    if ws_manager:
        await ws_manager.broadcast("quest.completed", {"quest": safe_name})

    return {"name": safe_name, "status": "completed"}
