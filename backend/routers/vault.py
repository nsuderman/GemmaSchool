import re
from pathlib import Path
import os

from fastapi import APIRouter

try:
    import yaml
    YAML_AVAILABLE = True
except ImportError:
    YAML_AVAILABLE = False

router = APIRouter()

VAULT_PATH  = Path(os.getenv("VAULT_PATH", "/vault"))
QUESTS_DIR  = VAULT_PATH / "Daily_Quests"
WIKILINK_RE = re.compile(r'\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]')


def _slug(text: str) -> str:
    """Normalise a title or filename to a consistent node ID."""
    return re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')


def _parse_frontmatter(content: str) -> tuple[dict, str]:
    """Return (frontmatter_dict, body_text). Handles missing YAML gracefully."""
    if not content.startswith('---'):
        return {}, content

    parts = content.split('---', 2)
    if len(parts) < 3:
        return {}, content

    fm: dict = {}
    if YAML_AVAILABLE:
        try:
            fm = yaml.safe_load(parts[1]) or {}
        except Exception:
            fm = {}

    return fm, parts[2]


def _parse_quest(path: Path) -> dict:
    try:
        raw = path.read_text(encoding='utf-8')
    except Exception:
        raw = ''

    fm, body = _parse_frontmatter(raw)

    title   = fm.get('title',   path.stem.replace('-', ' ').title())
    subject = fm.get('subject', 'General')
    status  = fm.get('status',  'pending')
    day     = fm.get('day',     0)
    gap     = bool(fm.get('knowledge_gap', False))

    # Extract [[wikilinks]] from body
    raw_links = WIKILINK_RE.findall(body)
    link_slugs = list({_slug(l) for l in raw_links})

    return {
        'id':            _slug(path.stem),
        'title':         title,
        'subject':       subject,
        'status':        status,
        'day':           day,
        'knowledge_gap': gap,
        'file':          path.name,
        '_link_targets': link_slugs,   # resolved into edges below
    }


@router.get("/graph")
async def vault_graph():
    """
    Returns a force-graph payload: { nodes, links }.
    Nodes = Daily Quest markdown files.
    Links = [[wikilink]] connections between quests.
    """
    if not QUESTS_DIR.exists():
        return {"nodes": [], "links": [], "stats": _empty_stats()}

    quest_files = sorted(QUESTS_DIR.glob("*.md"))
    quests      = [_parse_quest(f) for f in quest_files]

    # Build id → node map for link resolution
    node_ids = {q['id'] for q in quests}

    nodes = []
    for q in quests:
        nodes.append({
            'id':            q['id'],
            'title':         q['title'],
            'subject':       q['subject'],
            'status':        q['status'],
            'day':           q['day'],
            'knowledge_gap': q['knowledge_gap'],
            'file':          q['file'],
        })

    # Deduplicated edges — only keep links where both nodes exist
    seen_edges: set[tuple] = set()
    links = []
    for q in quests:
        for target in q['_link_targets']:
            if target in node_ids and target != q['id']:
                key = tuple(sorted([q['id'], target]))
                if key not in seen_edges:
                    seen_edges.add(key)
                    links.append({'source': q['id'], 'target': target})

    return {
        'nodes': nodes,
        'links': links,
        'stats': {
            'total':          len(nodes),
            'completed':      sum(1 for n in nodes if n['status'] == 'completed'),
            'pending':        sum(1 for n in nodes if n['status'] == 'pending'),
            'knowledge_gaps': sum(1 for n in nodes if n['knowledge_gap']),
            'subjects':       sorted({n['subject'] for n in nodes}),
        },
    }


@router.get("/quests/{quest_id}")
async def get_quest_detail(quest_id: str):
    """Return full markdown content of a single quest by slug ID."""
    if not QUESTS_DIR.exists():
        return {"error": "Vault not found"}

    for path in QUESTS_DIR.glob("*.md"):
        if _slug(path.stem) == quest_id:
            raw = path.read_text(encoding='utf-8')
            fm, body = _parse_frontmatter(raw)
            return {
                'id':          quest_id,
                'frontmatter': fm,
                'body':        body.strip(),
                'file':        path.name,
            }

    return {"error": "Quest not found"}


def _empty_stats():
    return {
        'total': 0, 'completed': 0, 'pending': 0,
        'knowledge_gaps': 0, 'subjects': [],
    }
