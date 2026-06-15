"""path_graph.py 엣지 함수 단위 테스트.

각 엣지의 제약 통과/위반, 수수료 계산 정확성을 검증한다.
AAA 패턴: Arrange → Act → Assert
"""
from __future__ import annotations

from types import SimpleNamespace

import pytest

from backend.app.domain.path_graph import (
    Blocked,
    Leg,
    global_buy_leg,
    global_buy_maker_leg,
    global_sell_leg,
    korea_buy_leg,
    korea_sell_leg,
    row_from_dict,
    swap_leg,
    withdraw_leg,
)

# 공통 상수
USD_KRW = 1400.0
BTC_USD = 100_000.0
KRW_PER_BTC = BTC_USD * USD_KRW  # 140,000,000


def _wd_row(
    *,
    enabled=True,
    fee=0.0002,
    fee_krw=28_000,
    network_label="Bitcoin",
    min_withdrawal=None,
    max_withdrawal=None,
    suspension_reason=None,
):
    """SimpleNamespace 출금 row 팩토리."""
    ns = SimpleNamespace(
        enabled=enabled,
        fee=fee,
        fee_krw=fee_krw,
        network_label=network_label,
        suspension_reason=suspension_reason,
    )
    if min_withdrawal is not None:
        ns.min_withdrawal = min_withdrawal
    if max_withdrawal is not None:
        ns.max_withdrawal = max_withdrawal
    return ns


def _swap_row(
    *,
    service_name="BitFreezer",
    fee_pct=0.45,
    fee_fixed_sat=0,
    min_amount_sat=0,
    max_amount_sat=100_000_000,
    enabled=True,
):
    return SimpleNamespace(
        service_name=service_name,
        fee_pct=fee_pct,
        fee_fixed_sat=fee_fixed_sat,
        min_amount_sat=min_amount_sat,
        max_amount_sat=max_amount_sat,
        enabled=enabled,
    )


# ── korea_buy_leg ─────────────────────────────────────────────────────────────

class TestKoreaBuyLeg:
    def test_btc_buy_amount_correct(self):
        # Arrange
        amount_krw = 10_000_000
        taker = 0.0025  # 0.25%
        # Act
        leg = korea_buy_leg(amount_krw, taker, KRW_PER_BTC, 'BTC', USD_KRW)
        # Assert
        trading_fee_krw = round(amount_krw * taker)
        expected_btc = (amount_krw - trading_fee_krw) / KRW_PER_BTC
        assert leg.fee_krw == trading_fee_krw
        assert abs(leg.amount_out - expected_btc) < 1e-10

    def test_usdt_buy_uses_usd_krw_rate(self):
        # Arrange
        amount_krw = 5_000_000
        taker = 0.001
        # Act
        leg = korea_buy_leg(amount_krw, taker, KRW_PER_BTC, 'USDT', USD_KRW)
        # Assert
        trading_fee_krw = round(amount_krw * taker)
        expected_usdt = (amount_krw - trading_fee_krw) / USD_KRW
        assert leg.fee_krw == trading_fee_krw
        assert abs(leg.amount_out - expected_usdt) < 1e-8

    def test_component_label_and_rate(self):
        # Arrange
        amount_krw = 1_000_000
        taker = 0.0025
        # Act
        leg = korea_buy_leg(amount_krw, taker, KRW_PER_BTC, 'BTC', USD_KRW)
        # Assert
        assert len(leg.components) == 1
        comp = leg.components[0]
        assert '매수 수수료' in comp['label']
        assert comp['rate_pct'] == 0.25
        assert comp['is_fixed'] is False

    def test_returns_leg_instance(self):
        leg = korea_buy_leg(1_000_000, 0.0025, KRW_PER_BTC, 'BTC', USD_KRW)
        assert isinstance(leg, Leg)


# ── withdraw_leg ──────────────────────────────────────────────────────────────

class TestWithdrawLeg:
    def test_basic_success(self):
        # Arrange
        row = _wd_row(fee=0.0002, fee_krw=28_000)
        amount = 0.01
        # Act
        result = withdraw_leg(row, amount, coin='BTC', price_krw=KRW_PER_BTC, usd_krw=USD_KRW)
        # Assert
        assert isinstance(result, Leg)
        assert result.amount_out == pytest.approx(amount - 0.0002)
        assert result.fee_krw == 28_000

    def test_disabled_returns_blocked(self):
        # Arrange
        row = _wd_row(enabled=False)
        # Act
        result = withdraw_leg(row, 0.01, coin='BTC', price_krw=KRW_PER_BTC, usd_krw=USD_KRW)
        # Assert
        assert isinstance(result, Blocked)
        assert result.reason == 'disabled'

    def test_disabled_with_suspension_reason(self):
        # Arrange
        row = _wd_row(enabled=False, suspension_reason='점검 중')
        # Act
        result = withdraw_leg(row, 0.01, coin='BTC', price_krw=KRW_PER_BTC, usd_krw=USD_KRW)
        # Assert
        assert isinstance(result, Blocked)
        assert result.reason == '점검 중'

    def test_fee_none_returns_blocked(self):
        # Arrange
        row = _wd_row(fee=None, fee_krw=None)
        # Act
        result = withdraw_leg(row, 0.01, coin='BTC', price_krw=KRW_PER_BTC, usd_krw=USD_KRW)
        # Assert
        assert isinstance(result, Blocked)

    def test_min_withdrawal_violation(self):
        # Arrange: 출금 수량 0.001 BTC < min 0.01 BTC
        row = _wd_row(fee=0.0002, fee_krw=28_000, min_withdrawal=0.01)
        # Act
        result = withdraw_leg(row, 0.001, coin='BTC', price_krw=KRW_PER_BTC, usd_krw=USD_KRW)
        # Assert
        assert isinstance(result, Blocked)
        assert '최소 한도' in result.reason

    def test_min_withdrawal_pass(self):
        # Arrange: 출금 수량 0.1 BTC >= min 0.01 BTC
        row = _wd_row(fee=0.0002, fee_krw=28_000, min_withdrawal=0.01)
        # Act
        result = withdraw_leg(row, 0.1, coin='BTC', price_krw=KRW_PER_BTC, usd_krw=USD_KRW)
        # Assert
        assert isinstance(result, Leg)

    def test_max_withdrawal_violation(self):
        # Arrange: 출금 수량 0.1 BTC > max 0.05 BTC
        row = _wd_row(fee=0.00001, fee_krw=1_400, max_withdrawal=0.05)
        # Act
        result = withdraw_leg(row, 0.1, coin='BTC', price_krw=KRW_PER_BTC, usd_krw=USD_KRW)
        # Assert
        assert isinstance(result, Blocked)
        assert '최대 한도' in result.reason

    def test_max_withdrawal_pass(self):
        # Arrange: 출금 수량 0.03 BTC <= max 0.05 BTC
        row = _wd_row(fee=0.00001, fee_krw=1_400, max_withdrawal=0.05)
        # Act
        result = withdraw_leg(row, 0.03, coin='BTC', price_krw=KRW_PER_BTC, usd_krw=USD_KRW)
        # Assert
        assert isinstance(result, Leg)

    def test_min_and_max_both_none_no_restriction(self):
        # Arrange: min/max 필드 자체가 없는 기존 픽스처
        row = SimpleNamespace(enabled=True, fee=0.0002, fee_krw=28_000, network_label='Bitcoin')
        # Act — min/max 없어도 AttributeError 발생하면 안 됨
        result = withdraw_leg(row, 0.01, coin='BTC', price_krw=KRW_PER_BTC, usd_krw=USD_KRW)
        # Assert
        assert isinstance(result, Leg)

    def test_num_txs_multiplies_fee(self):
        # Arrange: 2회 분할 출금
        row = _wd_row(fee=0.0002, fee_krw=28_000)
        amount = 0.01
        # Act
        result = withdraw_leg(row, amount, coin='BTC', price_krw=KRW_PER_BTC, usd_krw=USD_KRW, num_txs=2)
        # Assert
        assert result.fee_krw == 28_000 * 2
        assert result.amount_out == pytest.approx(amount - 0.0002 * 2)

    def test_fee_krw_none_falls_back_to_price_calculation(self):
        # Arrange: fee_krw=None → price_krw 기반 계산
        row = _wd_row(fee=0.0002, fee_krw=None)
        # Act
        result = withdraw_leg(row, 0.01, coin='BTC', price_krw=KRW_PER_BTC, usd_krw=USD_KRW)
        # Assert
        assert isinstance(result, Leg)
        expected_fee_krw = round(0.0002 * KRW_PER_BTC)
        assert result.fee_krw == expected_fee_krw

    def test_suspension_check_via_maintenance_status(self):
        # Arrange
        row = _wd_row(enabled=True, fee=0.0002, fee_krw=28_000, network_label='Bitcoin')
        maintenance = {
            'bithumb': [{'coin': 'BTC', 'network': 'bitcoin', 'reason': '긴급 점검'}]
        }
        # Act
        result = withdraw_leg(
            row, 0.01, coin='BTC', price_krw=KRW_PER_BTC, usd_krw=USD_KRW,
            maintenance_status=maintenance, exchange='bithumb',
        )
        # Assert
        assert isinstance(result, Blocked)
        assert '긴급 점검' in result.reason

    def test_component_is_fixed(self):
        row = _wd_row(fee=0.0002, fee_krw=28_000)
        result = withdraw_leg(row, 0.01, coin='BTC', price_krw=KRW_PER_BTC, usd_krw=USD_KRW)
        assert result.components[0]['is_fixed'] is True


# ── global_buy_leg ────────────────────────────────────────────────────────────

class TestGlobalBuyLeg:
    def test_usdt_to_btc_amount_correct(self):
        # Arrange
        usdt_in = 1000.0  # USDT
        global_taker = 0.001  # 0.1%
        # Act
        leg = global_buy_leg(usdt_in, global_taker, BTC_USD, USD_KRW)
        # Assert
        fee_usdt = usdt_in * global_taker
        usdt_for_btc = usdt_in - fee_usdt
        expected_btc = usdt_for_btc / BTC_USD
        assert leg.amount_out == pytest.approx(expected_btc)
        assert leg.fee_krw == round(fee_usdt * USD_KRW)

    def test_component_rate_pct(self):
        leg = global_buy_leg(1000.0, 0.001, BTC_USD, USD_KRW)
        comp = leg.components[0]
        assert comp['rate_pct'] == 0.1
        assert comp['is_fixed'] is False

    def test_returns_leg(self):
        leg = global_buy_leg(1000.0, 0.001, BTC_USD, USD_KRW)
        assert isinstance(leg, Leg)


# ── swap_leg ──────────────────────────────────────────────────────────────────

class TestSwapLeg:
    def test_basic_success(self):
        # Arrange: 0.01 BTC 스왑, 0.45% 수수료
        swap = _swap_row(fee_pct=0.45, min_amount_sat=10_000, max_amount_sat=100_000_000)
        btc_in = 0.01
        # Act
        result = swap_leg(swap, btc_in, BTC_USD, USD_KRW)
        # Assert
        assert isinstance(result, Leg)
        fee_pct = 0.45 / 100
        expected_fee_btc = btc_in * fee_pct
        expected_btc_out = btc_in - expected_fee_btc
        assert result.amount_out == pytest.approx(expected_btc_out)

    def test_min_amount_violation(self):
        # Arrange: btc_in 0.0001 BTC < min 0.001 BTC (100_000 sat)
        swap = _swap_row(min_amount_sat=100_000)  # 0.001 BTC
        # Act
        result = swap_leg(swap, 0.0001, BTC_USD, USD_KRW)
        # Assert
        assert isinstance(result, Blocked)
        assert '최소' in result.reason

    def test_max_amount_violation(self):
        # Arrange: btc_in 2.0 BTC > max 1.0 BTC (100_000_000 sat)
        swap = _swap_row(max_amount_sat=100_000_000)  # 1.0 BTC
        # Act
        result = swap_leg(swap, 2.0, BTC_USD, USD_KRW)
        # Assert
        assert isinstance(result, Blocked)
        assert '최대' in result.reason

    def test_max_amount_none_means_no_limit(self):
        # Arrange: max_amount_sat=None → 상한 없음
        swap = _swap_row(max_amount_sat=None)
        # Act
        result = swap_leg(swap, 100.0, BTC_USD, USD_KRW)
        # Assert
        assert isinstance(result, Leg)

    def test_fixed_fee_added(self):
        # Arrange: fee_fixed_sat=1000 (0.00001 BTC), fee_pct=0
        swap = _swap_row(fee_pct=0.0, fee_fixed_sat=1_000)
        btc_in = 0.01
        # Act
        result = swap_leg(swap, btc_in, BTC_USD, USD_KRW)
        # Assert
        expected_fee_btc = 1_000 / 1e8
        assert result.amount_out == pytest.approx(btc_in - expected_fee_btc)

    def test_fee_krw_calculation(self):
        # Arrange
        swap = _swap_row(fee_pct=1.0)  # 1%
        btc_in = 0.1
        # Act
        result = swap_leg(swap, btc_in, BTC_USD, USD_KRW)
        # Assert
        fee_btc = btc_in * 0.01
        expected_fee_krw = round(fee_btc * BTC_USD * USD_KRW)
        assert result.fee_krw == expected_fee_krw

    def test_component_service_name_in_label(self):
        swap = _swap_row(service_name='Coinos')
        result = swap_leg(swap, 0.01, BTC_USD, USD_KRW)
        assert 'Coinos' in result.components[0]['label']


# ── Leg 불변식 ────────────────────────────────────────────────────────────────

class TestLegInvariant:
    def test_leg_is_frozen(self):
        leg = Leg(amount_out=0.01, fee_krw=1000, components=[])
        with pytest.raises((AttributeError, TypeError)):
            leg.amount_out = 0.02  # type: ignore[misc]

    def test_blocked_is_frozen(self):
        b = Blocked(reason='test')
        with pytest.raises((AttributeError, TypeError)):
            b.reason = 'other'  # type: ignore[misc]


# ── row_from_dict 어댑터 ──────────────────────────────────────────────────────

class TestRowFromDict:
    def test_maps_live_dict_keys_to_row_attrs(self):
        # Arrange
        d = {'label': 'Lightning Network', 'fee': 0.000001, 'enabled': True, 'min': 2e-05, 'max': 0.01}
        # Act
        row = row_from_dict(d)
        # Assert
        assert row.network_label == 'Lightning Network'
        assert row.fee == 0.000001
        assert row.enabled is True
        assert row.fee_krw is None
        assert row.min_withdrawal == 2e-05
        assert row.max_withdrawal == 0.01

    def test_missing_keys_default_safely(self):
        # Arrange — min/max/enabled 누락
        d = {'label': 'Bitcoin', 'fee': 0.0005}
        # Act
        row = row_from_dict(d)
        # Assert
        assert row.enabled is True       # 기본 True
        assert row.min_withdrawal is None
        assert row.max_withdrawal is None

    def test_adapted_row_works_with_withdraw_leg(self):
        # Arrange — live dict를 어댑터 통해 withdraw_leg에 투입
        row = row_from_dict({'label': 'Lightning Network', 'fee': 0.000001, 'enabled': True, 'max': 0.01})
        # Act — 한도 내
        ok = withdraw_leg(row, 0.005, coin='BTC', price_krw=KRW_PER_BTC, usd_krw=USD_KRW)
        # 한도 초과
        blocked = withdraw_leg(row, 0.5, coin='BTC', price_krw=KRW_PER_BTC, usd_krw=USD_KRW)
        # Assert
        assert isinstance(ok, Leg)
        assert isinstance(blocked, Blocked)
        assert '최대 한도' in blocked.reason


# ── korea_sell_leg (매도) ─────────────────────────────────────────────────────

class TestKoreaSellLeg:
    def test_btc_sell_subtracts_taker_fee(self):
        # Arrange — 1 BTC 매도, taker 0.25%
        # Act
        leg = korea_sell_leg(1.0, 0.0025, KRW_PER_BTC, 'BTC', USD_KRW)
        # Assert — gross 1.4억, 수수료 0.25%
        assert leg.fee_krw == round(KRW_PER_BTC * 0.0025)
        assert leg.amount_out == round(KRW_PER_BTC - leg.fee_krw)
        assert 'BTC 매도' in leg.components[0]['label']

    def test_usdt_converts_at_usd_krw(self):
        # Arrange — 100 USDT → KRW
        # Act
        leg = korea_sell_leg(100.0, 0.001, KRW_PER_BTC, 'USDT', USD_KRW)
        # Assert — gross 100 * 1400
        gross = 100.0 * USD_KRW
        assert leg.fee_krw == round(gross * 0.001)
        assert leg.amount_out == round(gross - leg.fee_krw)
        assert 'KRW 전환' in leg.components[0]['label']


# ── global_sell_leg (매도) ────────────────────────────────────────────────────

class TestGlobalSellLeg:
    def test_btc_to_usdt_subtracts_taker(self):
        # Arrange — 0.01 BTC 매도, taker 0.1%
        # Act
        leg = global_sell_leg(0.01, 0.001, BTC_USD, USD_KRW)
        # Assert
        gross_usdt = 0.01 * BTC_USD
        assert leg.amount_out == pytest.approx(gross_usdt * (1 - 0.001))
        assert leg.fee_krw == round(gross_usdt * 0.001 * USD_KRW)


# ── global_buy_maker_leg (FDUSD) ─────────────────────────────────────────────

class TestGlobalBuyMakerLeg:
    def test_convert_spread_and_maker_fee_components(self):
        # Arrange — 1000 USDT, 전환 스프레드 0.05%, maker 0%
        # Act
        leg = global_buy_maker_leg(1000.0, 0.0, 0.0005, BTC_USD, USD_KRW)
        # Assert — 2개 컴포넌트 (전환 + maker)
        assert len(leg.components) == 2
        assert 'FDUSD 전환' in leg.components[0]['label']
        assert 'maker' in leg.components[1]['label']
        # maker 0% → maker 수수료 0, 전환 스프레드만
        convert_fee_usdt = 1000.0 * 0.0005
        assert leg.fee_krw == round(convert_fee_usdt * USD_KRW)

    def test_btc_out_after_convert_and_maker(self):
        # Arrange — maker 0.1%, 전환 0.05%
        # Act
        leg = global_buy_maker_leg(1000.0, 0.001, 0.0005, BTC_USD, USD_KRW)
        # Assert — FDUSD 전환 후 maker 매수
        fdusd = 1000.0 * (1 - 0.0005)
        btc = (fdusd * (1 - 0.001)) / BTC_USD
        assert leg.amount_out == pytest.approx(btc)
