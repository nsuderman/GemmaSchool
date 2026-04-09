import json
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

router = APIRouter()

VAULT_PATH = Path(os.getenv("VAULT_PATH", "/vault"))
CURRICULUM_DIR = VAULT_PATH / "Curriculum"
INDEX_FILE = CURRICULUM_DIR / "curriculum_index.json"
PROFILES_FILE = VAULT_PATH / "profiles.json"


def _safe_filename(name: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9._-]+", "_", name).strip("_")
    return cleaned or "curriculum.bin"


def _safe_segment(name: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_-]+", "-", name).strip("-")
    return cleaned or "general"


def _load_index() -> list[dict]:
    if not INDEX_FILE.exists():
        return []
    try:
        return json.loads(INDEX_FILE.read_text()).get("items", [])
    except Exception:
        return []


def _student_grade(student_id: str) -> str | None:
    if not PROFILES_FILE.exists():
        return None
    try:
        profiles = json.loads(PROFILES_FILE.read_text()).get("profiles", [])
    except Exception:
        return None
    for p in profiles:
        if p.get("id") == student_id and p.get("role") == "student":
            grade = (p.get("grade_level") or "").strip()
            return grade or None
    return None


def _save_index(items: list[dict]):
    CURRICULUM_DIR.mkdir(parents=True, exist_ok=True)
    INDEX_FILE.write_text(json.dumps({"items": items}, indent=2))


@router.get("/students/{student_id}")
async def list_student_curriculum(
    student_id: str,
    year: int | None = None,
    term: str | None = None,
    subject: str | None = None,
):
    items = _load_index()
    rows = [i for i in items if i.get("student_id") == student_id]
    if year is not None:
        rows = [i for i in rows if i.get("year") == year]
    if term:
        rows = [i for i in rows if str(i.get("term", "")).lower() == term.lower()]
    if subject:
        rows = [i for i in rows if str(i.get("subject", "")).lower() == subject.lower()]
    rows.sort(key=lambda r: r.get("created_at", ""), reverse=True)
    return {"items": rows}


@router.post("/upload")
async def upload_curriculum(
    student_id: str = Form(...),
    subject: str = Form(...),
    year: int | None = Form(default=None),
    term: str | None = Form(default=None),
    title: str | None = Form(default=None),
    notes: str | None = Form(default=None),
    content: str | None = Form(default=None),
    file: UploadFile | None = File(default=None),
):
    if not student_id.strip():
        raise HTTPException(status_code=400, detail="student_id is required")
    if not subject.strip():
        raise HTTPException(status_code=400, detail="subject is required")
    if file is None and not (content or "").strip():
        raise HTTPException(status_code=400, detail="Provide a file or text content")

    valid_terms = {"spring", "summer", "fall", "winter"}
    now = datetime.now(timezone.utc)
    resolved_year = year if year is not None else now.year
    resolved_term = (term or "").strip().lower() or "spring"
    if resolved_term not in valid_terms:
        raise HTTPException(status_code=400, detail="term must be Spring, Summer, Fall, or Winter")

    term_label = resolved_term.capitalize()
    subject_label = subject.strip()
    term_dir = f"{resolved_year}-{resolved_term}"

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    student_dir = CURRICULUM_DIR / _safe_segment(student_id) / term_dir / _safe_segment(subject_label)
    student_dir.mkdir(parents=True, exist_ok=True)

    rel_paths: list[str] = []
    if file is not None:
        filename = _safe_filename(file.filename or f"curriculum-{stamp}.bin")
        target = student_dir / f"{stamp}-{filename}"
        payload = await file.read()
        target.write_bytes(payload)
        rel_paths.append(str(target.relative_to(VAULT_PATH)))

    if (content or "").strip():
        text_name = f"{stamp}-{_safe_filename((title or subject_label or 'curriculum').lower())}.md"
        text_target = student_dir / text_name
        text_target.write_text((content or "").strip() + "\n", encoding="utf-8")
        rel_paths.append(str(text_target.relative_to(VAULT_PATH)))

    item = {
        "id": str(uuid.uuid4()),
        "student_id": student_id,
        "grade_level": _student_grade(student_id),
        "subject": subject_label,
        "year": resolved_year,
        "term": term_label,
        "semester": f"{resolved_year} {term_label}",
        "title": (title or "").strip() or f"{subject_label} Curriculum",
        "notes": (notes or "").strip(),
        "path": rel_paths[0] if rel_paths else None,
        "assets": rel_paths,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    items = _load_index()
    items.append(item)
    _save_index(items)
    return item
