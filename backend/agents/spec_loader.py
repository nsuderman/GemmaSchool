from pathlib import Path


PROJECT_DIR = Path("/project")
AGENTS_DIR = PROJECT_DIR / "agents"


def load_agent_spec(name: str) -> str:
    path = AGENTS_DIR / f"{name}.md"
    if not path.exists():
        return ""
    try:
        return path.read_text(encoding="utf-8")
    except Exception:
        return ""
