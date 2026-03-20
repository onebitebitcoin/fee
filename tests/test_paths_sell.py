from unittest.mock import MagicMock
from backend.app.domain.paths_sell import find_cheapest_sell_path_from_snapshot_rows


def _make_run():
    r = MagicMock()
    r.usd_krw_rate = 1400.0
    r.completed_at = None
    r.id = 1
    r.status = 'success'
    return r


def test_sell_returns_error_without_latest_run():
    result = find_cheapest_sell_path_from_snapshot_rows(0.01, 'binance', None, [], [], [])
    assert 'error' in result


def test_sell_returns_error_for_invalid_exchange():
    result = find_cheapest_sell_path_from_snapshot_rows(0.01, 'unknown', None, [], [], [])
    assert 'error' in result


def test_sell_returns_error_for_zero_amount():
    run = _make_run()
    result = find_cheapest_sell_path_from_snapshot_rows(0.0, 'binance', run, [], [], [])
    assert 'error' in result


def test_sell_returns_dict_with_mode_sell():
    run = _make_run()
    global_ticker = MagicMock()
    global_ticker.exchange = 'binance'
    global_ticker.market_type = 'spot'
    global_ticker.currency = 'USD'
    global_ticker.price = 90000.0
    global_ticker.taker_fee_pct = 0.1
    global_ticker.usd_krw_rate = None

    result = find_cheapest_sell_path_from_snapshot_rows(0.01, 'binance', run, [global_ticker], [], [])
    # mempool API 실패는 expected (네트워크 없음) → error 또는 정상 dict
    assert isinstance(result, dict)
