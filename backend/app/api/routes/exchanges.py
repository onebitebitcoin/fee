from fastapi import APIRouter

from backend.app.services.live_market import list_exchanges

router = APIRouter()


@router.get('')
def get_exchanges() -> dict:
    return list_exchanges()
