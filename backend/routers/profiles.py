import hashlib
import json
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

VAULT_PATH = Path(os.getenv("VAULT_PATH", "/vault"))
PROFILES_FILE = VAULT_PATH / "profiles.json"

AVATAR_COLORS = ["primary", "secondary", "tertiary", "error", "indigo", "rose", "amber", "teal"]


def _hash_pin(pin: str) -> str:
    return hashlib.sha256(pin.encode()).hexdigest()


def _load() -> list[dict]:
    if not PROFILES_FILE.exists():
        return []
    try:
        return json.loads(PROFILES_FILE.read_text()).get("profiles", [])
    except Exception:
        return []


def _save(profiles: list[dict]):
    VAULT_PATH.mkdir(parents=True, exist_ok=True)
    PROFILES_FILE.write_text(json.dumps({"profiles": profiles}, indent=2))


def _strip_pin(p: dict) -> dict:
    """Return profile dict without the pin_hash field, but with a has_pin boolean."""
    result = {k: v for k, v in p.items() if k != "pin_hash"}
    result["has_pin"] = bool(p.get("pin_hash"))
    return result


# ── Request bodies ────────────────────────────────────────────

class CreateProfileBody(BaseModel):
    name: str
    role: str = "student"        # 'parent' | 'student'
    color: str = "primary"
    pin: str | None = None       # raw 4-digit PIN; None = no PIN


class UpdateProfileBody(BaseModel):
    name: str | None = None
    color: str | None = None
    pin: str | None = None       # new PIN; empty string = remove PIN


class VerifyPinBody(BaseModel):
    profile_id: str
    pin: str


# ── Endpoints ─────────────────────────────────────────────────

@router.get("")
def list_profiles():
    profiles = _load()
    # Bootstrap: if empty, create a default parent profile with no PIN
    if not profiles:
        default = {
            "id": str(uuid.uuid4()),
            "name": "Parent",
            "role": "parent",
            "color": "primary",
            "pin_hash": None,
        }
        _save([default])
        profiles = [default]
    return {"profiles": [_strip_pin(p) for p in profiles]}


@router.post("")
def create_profile(body: CreateProfileBody):
    profiles = _load()
    if body.role not in ("parent", "student"):
        raise HTTPException(400, "role must be 'parent' or 'student'")
    if body.color not in AVATAR_COLORS:
        body.color = "secondary"
    new_profile = {
        "id": str(uuid.uuid4()),
        "name": body.name.strip(),
        "role": body.role,
        "color": body.color,
        "pin_hash": _hash_pin(body.pin) if body.pin else None,
    }
    profiles.append(new_profile)
    _save(profiles)
    return _strip_pin(new_profile)


@router.put("/{profile_id}")
def update_profile(profile_id: str, body: UpdateProfileBody):
    profiles = _load()
    for p in profiles:
        if p["id"] == profile_id:
            if body.name is not None:
                p["name"] = body.name.strip()
            if body.color is not None:
                p["color"] = body.color
            if body.pin is not None:
                p["pin_hash"] = _hash_pin(body.pin) if body.pin else None
            _save(profiles)
            return _strip_pin(p)
    raise HTTPException(404, "Profile not found")


@router.delete("/{profile_id}")
def delete_profile(profile_id: str):
    profiles = _load()
    remaining = [p for p in profiles if p["id"] != profile_id]
    if len(remaining) == len(profiles):
        raise HTTPException(404, "Profile not found")
    # Must always have at least one parent
    if not any(p["role"] == "parent" for p in remaining):
        raise HTTPException(400, "Cannot delete the last parent profile")
    _save(remaining)
    return {"ok": True}


@router.post("/verify-pin")
def verify_pin(body: VerifyPinBody):
    profiles = _load()
    for p in profiles:
        if p["id"] == body.profile_id:
            if p.get("pin_hash") is None:
                return {"ok": True}   # no PIN set — always passes
            if p["pin_hash"] == _hash_pin(body.pin):
                return {"ok": True}
            raise HTTPException(403, "Incorrect PIN")
    raise HTTPException(404, "Profile not found")
