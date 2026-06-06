"""buy 경로 전 시나리오 결정론 테스트.

라이브 API/DB에 의존하지 않고 합성 스냅샷 행을 직접 주입해
5종 경로(BTC 직접 / BTC 경유 온체인 / BTC 경유 LN / USDT 온체인 / USDT LN)와
트래블룰 분할 경계, 불변식을 고정한다.

advisor 가이드: bare MagicMock 금지 (truthy Mock 이 산술/`== 'ln_to_onchain'`을 깨뜨림).
SimpleNamespace + 실수치 + 명시적 direction 사용.
"""
from __future__ import annotations

from types import SimpleNamespace

import pytest

from backend.app.domain.paths_buy import find_cheapest_path_from_snapshot_rows

USD_KRW = 1400.0
BTC_USD = 100_000.0
KRW_PER_BTC = BTC_USD * USD_KRW  # 140,000,000


def _run():
    return SimpleNamespace(id=1, status="success", usd_krw_rate=USD_KRW, completed_at=None)


def _ticker(exchange, price, *, market_type="spot", currency="KRW", taker_fee_pct=0.25):
    return SimpleNamespace(
        exchange=exchange,
        market_type=market_type,
        currency=currency,
        price=price,
        taker_fee_pct=taker_fee_pct,
        usd_krw_rate=None,
    )


def _wd(exchange, coin, network_label, fee, *, enabled=True, fee_krw=None):
    return SimpleNamespace(
        exchange=exchange,
        coin=coin,
        network_label=network_label,
        fee=fee,
        fee_krw=fee_krw,
        enabled=enabled,
        source="api",
    )


def _swap(service_name, *, fee_pct=0.45, direction="ln_to_onchain", enabled=True,
          fee_fixed_sat=0, min_amount_sat=0, max_amount_sat=100_000_000):
    return SimpleNamespace(
        service_name=service_name,
        direction=direction,
        enabled=enabled,
        fee_pct=fee_pct,
        fee_fixed_sat=fee_fixed_sat,
        min_amount_sat=min_amount_sat,
        max_amount_sat=max_amount_sat,
    )


def _tickers():
    # 국내: bithumb (트래블룰 1M 한도), upbit (1M 한도) — 둘 다 KRW spot
    # 글로벌: binance spot (USD)
    return [
        _ticker("bithumb", KRW_PER_BTC),
        _ticker("upbit", KRW_PER_BTC),
        _ticker("binance", BTC_USD, currency="USD", taker_fee_pct=0.1),
    ]


def _withdrawals(*, global_exchange="binance", okx_btc_onchain=False):
    rows = [
        # 국내 BTC 출금
        _wd("bithumb", "BTC", "Bitcoin", 0.0002, fee_krw=28_000),
        _wd("upbit", "BTC", "Bitcoin", 0.0009, fee_krw=126_000),
        # 국내 USDT 출금 (TRC20)
        _wd("bithumb", "USDT", "Tron (TRC20)", 1.0, fee_krw=1_400),
        _wd("upbit", "USDT", "Tron (TRC20)", 1.0, fee_krw=1_400),
        # 글로벌 BTC 출금 (온체인 + 라이트닝)
        _wd(global_exchange, "BTC", "Bitcoin", 0.00002, fee_krw=2_800),
        _wd(global_exchange, "BTC", "Lightning Network", 0.000001, fee_krw=140),
        # 글로벌 USDT 입금 가능 네트워크 (TRC20)
        _wd(global_exchange, "USDT", "Tron (TRC20)", 1.0, fee_krw=1_400),
    ]
    return rows


def _calc(amount_krw, *, global_exchange="binance", swaps=None):
    return find_cheapest_path_from_snapshot_rows(
        amount_krw=amount_krw,
        global_exchange=global_exchange,
        latest_run=_run(),
        ticker_rows=_tickers(),
        withdrawal_rows=_withdrawals(global_exchange=global_exchange),
        network_rows=[],
        lightning_swap_rows=swaps if swaps is not None else [_swap("BitFreezer")],
    )


def _classify(p):
    if p.get("path_type") == "lightning_exit":
        return f"LN/{p['transfer_coin']}/{p.get('route_variant', '-')}"
    return f"ON/{p['transfer_coin']}/{p.get('route_variant', '-')}"


# ── 경로 종류 커버리지 ────────────────────────────────────────────────────────

def test_all_five_path_types_present():
    result = _calc(10_000_000)
    kinds = {_classify(p) for p in result["all_paths"]}
    assert "ON/BTC/btc_direct" in kinds
    assert "ON/BTC/btc_via_global" in kinds
    assert "LN/BTC/btc_via_global" in kinds
    assert "ON/USDT/-" in kinds
    assert "LN/USDT/-" in kinds


# ── 불변식: 모든 경로 ────────────────────────────────────────────────────────

@pytest.mark.parametrize("amount", [1_000_000, 1_000_001, 5_000_000, 10_000_000, 50_000_000])
def test_invariants_hold_for_all_paths(amount):
    result = _calc(amount)
    assert result["all_paths"], "최소 1개 경로는 생성되어야 한다"
    for p in result["all_paths"]:
        tag = f"{p['korean_exchange']}/{_classify(p)}"
        comp_sum = sum(c["amount_krw"] for c in p["breakdown"]["components"])
        assert comp_sum == p["total_fee_krw"], f"{tag}: 구성요소 합 != total_fee_krw"
        assert p["btc_received"] > 0, f"{tag}: btc_received<=0"
        assert abs(round(p["total_fee_krw"] / amount * 100, 4) - p["fee_pct"]) <= 0.0002, f"{tag}: fee_pct 불일치"
        if p.get("path_type") == "lightning_exit":
            assert p.get("lightning_exit_provider"), f"{tag}: LN provider 누락"


def test_paths_sorted_by_total_fee():
    result = _calc(10_000_000)
    fees = [p["total_fee_krw"] for p in result["all_paths"]]
    assert fees == sorted(fees), "경로는 total_fee_krw 오름차순 정렬되어야 한다"


# ── 트래블룰 분할 경계 (개인지갑 직접출금만 분할) ───────────────────────────────

@pytest.mark.parametrize("amount,expected_txs", [
    (1_000_000, 1),       # 한도와 동일 → 1회
    (1_000_001, 2),       # 1원 초과 → 2회
    (2_000_000, 2),       # 정확히 2배 → 2회
    (10_000_000, 10),     # 10배 → 10회
])
def test_btc_direct_travel_rule_split(amount, expected_txs):
    result = _calc(amount)
    direct = next(
        p for p in result["all_paths"]
        if p["korean_exchange"] == "bithumb"
        and p["transfer_coin"] == "BTC" and p.get("route_variant") == "btc_direct"
    )
    assert direct["num_withdrawal_txs"] == expected_txs


@pytest.mark.parametrize("amount", [1_000_001, 10_000_000])
def test_btc_via_global_not_split_by_travel_rule(amount):
    """VASP(글로벌 거래소)行 출금은 트래블룰 분할 대상이 아님 → 항상 1회."""
    result = _calc(amount)
    via = next(
        p for p in result["all_paths"]
        if p["korean_exchange"] == "bithumb"
        and p.get("route_variant") == "btc_via_global" and p.get("path_type") != "lightning_exit"
    )
    assert via["num_withdrawal_txs"] == 1


def test_travel_rule_split_makes_direct_costlier_at_scale():
    """동일 금액에서 분할(10회) 직접출금의 국내 출금비가 경유(1회)보다 크다."""
    result = _calc(10_000_000)
    def dom_wd(p):
        return next(c["amount_krw"] for c in p["breakdown"]["components"] if "출금" in c["label"] and "해외" not in c["label"] and "라이트닝" not in c["label"])
    direct = next(p for p in result["all_paths"] if p["korean_exchange"] == "bithumb" and p.get("route_variant") == "btc_direct")
    via = next(p for p in result["all_paths"] if p["korean_exchange"] == "bithumb" and p.get("route_variant") == "btc_via_global" and p.get("path_type") != "lightning_exit")
    assert dom_wd(direct) == dom_wd(via) * 10


# ── 라이트닝 / 데이터 갭 ─────────────────────────────────────────────────────

def test_lightning_disabled_when_global_has_no_lightning_fee():
    """글로벌 LN 출금 수수료가 None(okx식 데이터 갭)이면 LN 경로 미생성."""
    rows = _withdrawals()
    # 라이트닝 행 fee 를 None 으로 (enabled 이지만 미수집)
    for r in rows:
        if r.network_label == "Lightning Network":
            r.fee = None
    result = find_cheapest_path_from_snapshot_rows(
        amount_krw=10_000_000, global_exchange="binance", latest_run=_run(),
        ticker_rows=_tickers(), withdrawal_rows=rows, network_rows=[],
        lightning_swap_rows=[_swap("BitFreezer")],
    )
    ln = [p for p in result["all_paths"] if p.get("path_type") == "lightning_exit"]
    assert ln == [], "LN 출금 수수료 미수집 시 라이트닝 경로는 생성되지 않아야 한다"
    # 온체인 경로는 여전히 존재
    assert any(p.get("path_type") != "lightning_exit" for p in result["all_paths"])


def test_okx_has_no_btc_via_global_onchain():
    """okx/coinbase 는 변동 수수료라 온체인 경유 수수료가 None → btc_via_global 온체인 미생성."""
    result = find_cheapest_path_from_snapshot_rows(
        amount_krw=10_000_000, global_exchange="okx", latest_run=_run(),
        ticker_rows=[_ticker("bithumb", KRW_PER_BTC), _ticker("okx", BTC_USD, currency="USD", taker_fee_pct=0.1)],
        withdrawal_rows=_withdrawals(global_exchange="okx"),
        network_rows=[], lightning_swap_rows=[_swap("BitFreezer")],
    )
    via_onchain = [
        p for p in result["all_paths"]
        if p.get("route_variant") == "btc_via_global" and p.get("path_type") != "lightning_exit"
    ]
    assert via_onchain == []


def test_lightning_swap_services_listed():
    result = _calc(10_000_000, swaps=[_swap("BitFreezer"), _swap("Coinos", fee_pct=0.4)])
    assert set(result["lightning_swap_services"]) == {"BitFreezer", "Coinos"}


def test_available_filters_include_lightning_exit():
    result = _calc(10_000_000)
    opts = result["available_filters"]["global_exit_options"]
    modes = {o["mode"] for o in opts}
    assert "lightning" in modes
    assert "onchain" in modes
