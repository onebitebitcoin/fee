"""크롤 오류 판정(evaluate_crawl_gate) 단위 테스트.

국내 거래소 한 곳의 수집 실패가 전체 경로 계산을 막지 않고 해당 거래소만 제외하는지 검증한다.
"""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

from backend.app.domain.crawl_gate import evaluate_crawl_gate


def _err(exchange, stage='ticker', coin=None, message='오류'):
    return SimpleNamespace(
        exchange=exchange,
        coin=coin,
        stage=stage,
        error_message=message,
        created_at=datetime(2026, 11, 15, tzinfo=timezone.utc),
    )


def _wd(exchange, source='scraped_page', coin='BTC'):
    return SimpleNamespace(
        exchange=exchange,
        coin=coin,
        source=source,
        recorded_at=datetime(2026, 11, 15, tzinfo=timezone.utc),
    )


def test_no_errors_means_no_block_and_no_exclusion():
    gate = evaluate_crawl_gate([], [_wd('upbit')], 'binance')

    assert gate.blocking_errors == []
    assert gate.excluded_exchanges == {}


def test_korean_ticker_failure_excludes_only_that_exchange():
    gate = evaluate_crawl_gate([_err('gopax', message='Gopax 오류: 404')], [], 'binance')

    assert gate.blocking_errors == []
    assert list(gate.excluded_exchanges) == ['gopax']
    assert gate.excluded_exchanges['gopax'][0]['error_message'] == 'Gopax 오류: 404'


def test_korean_withdrawal_failure_excludes_that_exchange():
    gate = evaluate_crawl_gate([_err('upbit', stage='withdrawal', coin='USDT')], [], 'okx')

    assert gate.blocking_errors == []
    assert 'upbit' in gate.excluded_exchanges


def test_korean_static_fallback_rows_exclude_that_exchange():
    gate = evaluate_crawl_gate([], [_wd('korbit', source='official_docs')], 'binance')

    assert gate.blocking_errors == []
    assert 'korbit' in gate.excluded_exchanges


def test_non_blocking_stage_is_ignored():
    gate = evaluate_crawl_gate([_err('gopax', stage='notice')], [], 'binance')

    assert gate.blocking_errors == []
    assert gate.excluded_exchanges == {}


def test_global_exchange_own_failure_still_blocks():
    gate = evaluate_crawl_gate([_err('binance')], [], 'binance')

    assert [e['exchange'] for e in gate.blocking_errors] == ['binance']


def test_other_global_exchange_failure_does_not_block():
    gate = evaluate_crawl_gate([_err('okx')], [], 'binance')

    assert gate.blocking_errors == []
    assert gate.excluded_exchanges == {}


def test_error_without_exchange_still_blocks():
    gate = evaluate_crawl_gate([_err(None, stage='ticker')], [], 'binance')

    assert len(gate.blocking_errors) == 1


def test_all_korean_exchanges_failing_blocks():
    errors = [_err(ex) for ex in ['upbit', 'bithumb', 'korbit', 'coinone', 'gopax']]

    gate = evaluate_crawl_gate(errors, [], 'binance')

    assert len(gate.blocking_errors) == 5
