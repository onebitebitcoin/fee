"""거래소 최소 주문 금액 정적 레지스트리.

한국 거래소 KRW 마켓 최소 주문 금액은 약관 고정값이라 실시간 수집 대상이 아니다.
업비트만 공식 확인(5,000원)이고 나머지는 대표 근사값이다. 값 정확화가 필요하면
이 파일만 수정한다.

용도: 매수 시 투자금이 최소 주문 단위로 나눠떨어지지 않아 남는 잔돈을
'버려지는 금액(discarded_krw)'으로 근사 표시한다. (시장가 금액지정 매수에선
실제 잔돈이 거의 0이지만, 최소 단위 기준 보수적 근사로 노출한다.)
"""
from __future__ import annotations

# 한국 거래소 KRW 마켓 최소 주문 금액 (원). 출처: 각 거래소 주문 화면/약관.
# upbit: 공식 5,000원. 그 외: 대표 근사값(추후 정확화 가능).
KOREA_MIN_ORDER_KRW: dict[str, int] = {
    'upbit': 5000,
    'bithumb': 1000,
    'coinone': 1000,
    'korbit': 1000,
    'gopax': 1000,
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
