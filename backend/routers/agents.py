import asyncio

from fastapi import APIRouter, HTTPException, Request

router = APIRouter()

AGENT_META = {
    "architect": {
        "label": "The Architect",
        "task": "Generate 180-day Daily Quest plan from curriculum",
        "icon": "architecture",
    },
    "scout": {
        "label": "The Scout",
        "task": "Generate hero images for new quest topics",
        "icon": "explore",
    },
    "auditor": {
        "label": "The Auditor",
        "task": "Analyze student worksheets and update quest status",
        "icon": "fact_check",
    },
    "director": {
        "label": "The Director",
        "task": "Orchestrate semester sweep and sync vault",
        "icon": "hub",
    },
}


@router.get("/status")
async def agents_status():
    """Returns the readiness status of all agents."""
    return {name: "ready" for name in AGENT_META}


@router.post("/{agent_name}/run")
async def run_agent(agent_name: str, request: Request):
    """Trigger an agent and broadcast progress via WebSocket."""
    if agent_name not in AGENT_META:
        raise HTTPException(status_code=400, detail=f"Unknown agent '{agent_name}'")

    ws_manager = getattr(request.app.state, "ws_manager", None)
    meta = AGENT_META[agent_name]

    if ws_manager:
        await ws_manager.broadcast("agent.task.start", {
            "agent": agent_name,
            "label": meta["label"],
            "task": meta["task"],
        })
        asyncio.create_task(_simulate_agent_run(agent_name, meta, ws_manager))

    return {"ok": True, "agent": agent_name, "task": meta["task"]}


async def _simulate_agent_run(agent_name: str, meta: dict, ws_manager):
    """Broadcast agent progress events. Replace with real agent logic."""
    steps = {
        "architect": [
            (2, "Parsing curriculum documents..."),
            (4, "Generating quest structure for 180 days..."),
            (3, "Writing Daily Quest Markdown files..."),
        ],
        "scout": [
            (2, "Scanning vault for new quest topics..."),
            (3, "Generating visual prompts for FastSD..."),
        ],
        "auditor": [
            (2, "Loading student worksheet images..."),
            (4, "Running vision analysis..."),
            (2, "Updating quest completion status..."),
        ],
        "director": [
            (2, "Running semester sweep..."),
            (3, "Syncing vault index..."),
            (2, "Dispatching agent tasks..."),
        ],
    }

    for delay, message in steps.get(agent_name, [(3, "Processing...")]):
        await asyncio.sleep(delay)
        await ws_manager.broadcast("agent.task.progress", {
            "agent": agent_name,
            "label": meta["label"],
            "message": message,
        })

    await ws_manager.broadcast("agent.task.complete", {
        "agent": agent_name,
        "label": meta["label"],
        "task": meta["task"],
        "message": f"{meta['label']} completed successfully.",
    })
