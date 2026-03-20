from unittest.mock import MagicMock
from backend.app.domain.paths_buy import find_cheapest_path_from_snapshot_rows


def _make_run():
    r = MagicMock()
    r.usd_krw_rate = 1400.0
    r.completed_at = None
    r.id = 1
    r.status = 'success'
    return r


def test_find_cheapest_path_returns_error_without_latest_run():
    result = find_cheapest_path_from_snapshot_rows(1_000_000, 'binance', None, [], [], [])
    assert 'error' in result


def test_find_cheapest_path_returns_error_for_invalid_exchange():
    result = find_cheapest_path_from_snapshot_rows(1_000_000, 'unknown_exchange', None, [], [], [])
    assert 'error' in result


def test_find_cheapest_path_returns_dict_with_all_paths_key():
    run = _make_run()
    # 글로벌 거래소 spot 티커
    global_ticker = MagicMock()
    global_ticker.exchange = 'binance'
    global_ticker.market_type = 'spot'
    global_ticker.currency = 'USD'
    global_ticker.price = 90000.0
    global_ticker.taker_fee_pct = 0.1
    global_ticker.usd_krw_rate = None

    result = find_cheapest_path_from_snapshot_rows(1_000_000, 'binance', run, [global_ticker], [], [])
    assert 'all_paths' in result
    assert 'mode' in result
    assert result['mode'] == 'buy'
