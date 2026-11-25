"""첫 화면 시세 카드 보강 — 24시간 가격 추이와 선물 시장 신호(펀딩비·미결제약정)."""
import logging

from fastapi import APIRouter, HTTPException

from backend.app.services import btc_trend_service, derivatives_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get('/btc-24h')
def get_btc_24h() -> dict:
    try:
        trend = btc_trend_service.get_btc_24h_trend()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f'가격 추이를 불러오지 못했습니다: {exc}') from exc
    # 선물 신호는 보조 정보라서 실패해도 가격은 그대로 보여 주고, 화면에는 실패 문구를 띄운다
    try:
        derivatives = derivatives_service.get_derivatives_summary()
        derivatives_error = None
    except Exception as exc:
        logger.warning('derivatives summary failed: %s', exc)
        derivatives, derivatives_error = None, str(exc)
    return {'price': trend, 'derivatives': derivatives, 'derivatives_error': derivatives_error}
