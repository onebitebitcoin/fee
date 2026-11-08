"""첫 화면 시세 카드 보강 — 24시간 가격 추이와 청산 규모."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.app.db.session import get_db
from backend.app.services import btc_trend_service, liquidation_service

router = APIRouter()


@router.get('/btc-24h')
def get_btc_24h(db: Session = Depends(get_db)) -> dict:
    try:
        trend = btc_trend_service.get_btc_24h_trend()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f'가격 추이를 불러오지 못했습니다: {exc}') from exc
    liquidations = liquidation_service.hourly_summary(db, datetime.now(timezone.utc))
    return {'price': trend, 'liquidations': liquidations}
