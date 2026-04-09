from fastapi import APIRouter

router = APIRouter()


@router.get("/status")
async def agents_status():
    """Returns the readiness status of all agents."""
    return {
        "architect": "ready",
        "scout": "ready",
        "auditor": "ready",
        "director": "ready",
    }
