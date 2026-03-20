from dataclasses import fields
from backend.app.domain.paths_context import SnapshotContext, build_snapshot_context


def test_snapshot_context_has_required_fields():
    required = {
        'usd_krw_rate', 'global_btc_price_usd', 'global_taker',
        'ticker_by_exchange', 'withdrawals_by_key',
        'maintenance_status', 'maintenance_checked_at', 'last_run',
    }
    actual = {f.name for f in fields(SnapshotContext)}
    assert actual == required


def _make_ticker_row(exchange, market_type, currency, price, taker_fee_pct):
    class R:
        pass
    r = R()
    r.exchange = exchange; r.market_type = market_type; r.currency = currency
    r.price = price; r.taker_fee_pct = taker_fee_pct; r.usd_krw_rate = None
    return r


def _make_run(usd_krw_rate=1400.0, completed_at=None):
    class R:
        pass
    r = R()
    r.usd_krw_rate = usd_krw_rate; r.completed_at = completed_at
    r.id = 1; r.status = 'success'
    return r


def test_build_snapshot_context_returns_error_if_no_latest_run():
    result = build_snapshot_context('binance', None, [], [], [])
    assert 'error' in result


def test_build_snapshot_context_returns_error_if_no_global_row():
    run = _make_run()
    result = build_snapshot_context('binance', run, [], [], [])
    assert 'error' in result


def test_build_snapshot_context_returns_context_on_success():
    run = _make_run(usd_krw_rate=1400.0)
    ticker_rows = [_make_ticker_row('binance', 'spot', 'USD', 90000.0, 0.1)]
    result = build_snapshot_context('binance', run, ticker_rows, [], [])
    assert isinstance(result, SnapshotContext)
    assert result.global_btc_price_usd == 90000.0
    assert result.usd_krw_rate == 1400.0
