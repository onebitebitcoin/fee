"""거래소 최소 주문 금액 정적 레지스트리.

한국 거래소 KRW 마켓 최소 주문 금액은 약관 고정값이라 실시간 수집 대상이 아니다.
업비트만 공식 확인(5,000원)이고 나머지는 대표 근사값이다. 값 정확화가 필요하면
backend/app/domain/exchanges/profiles.py 의 min_order_krw 필드를 수정한다.

이 파일은 기존 호출 인터페이스를 유지하는 thin wrapper다.
"""
from __future__ import annotations

from backend.app.domain.exchanges.profiles import get_korea_profiles

# 한국 거래소 KRW 마켓 최소 주문 금액 (원). profiles.py 에서 파생.
KOREA_MIN_ORDER_KRW: dict[str, int] = {
    p.id: p.min_order_krw
    for p in get_korea_profiles()
    if p.min_order_krw is not None
}

_DEFAULT_MIN_ORDER_KRW = 1000


def get_min_order_krw(exchange: str) -> int:
    """거래소 KRW 마켓 최소 주문 금액(원). 미등록 거래소는 기본값."""
    return KOREA_MIN_ORDER_KRW.get(exchange, _DEFAULT_MIN_ORDER_KRW)


def calc_discarded_krw(amount_krw: int, exchange: str) -> int:
    """투자금을 최소 주문 단위로 내림했을 때 버려지는 잔돈(원).

    amount_krw가 최소 주문 단위로 나눠떨어지지 않으면 나머지가 버려진다.
    """
    min_order = get_min_order_krw(exchange)
    if min_order <= 0:
        return 0
    return int(amount_krw % min_order)
