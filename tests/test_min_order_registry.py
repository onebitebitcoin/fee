"""최소 주문 금액 레지스트리 + 잔돈 계산 단위 테스트."""
from __future__ import annotations

from backend.app.domain.min_order_registry import (
    calc_discarded_krw,
    get_min_order_krw,
)


def test_get_min_order_known_exchanges():
    assert get_min_order_krw("upbit") == 5000
    assert get_min_order_krw("bithumb") == 1000


def test_get_min_order_unknown_falls_back():
    assert get_min_order_krw("nonexistent") == 1000


def test_calc_discarded_krw_remainder():
    # 1,003,000원을 업비트 5,000원 단위로 내림 → 3,000원이 버려진다
    assert calc_discarded_krw(1_003_000, "upbit") == 3000


def test_calc_discarded_krw_exact_multiple_is_zero():
    assert calc_discarded_krw(10_000_000, "upbit") == 0


def test_calc_discarded_krw_bithumb_unit():
    assert calc_discarded_krw(1_000_555, "bithumb") == 555
