"""market_core 단위 테스트 — 출금 수수료 출처(source) 라벨."""
from backend.app.domain.market_core import (
    STATIC_WITHDRAWAL_FEE_KEYS,
    withdrawal_source,
)


def test_coinbase_btc_source_is_static():
    # 코인베이스 BTC는 공개 API 미제공 → 정적 등록값
    assert ('coinbase', 'BTC') in STATIC_WITHDRAWAL_FEE_KEYS
    assert withdrawal_source('coinbase', 'BTC') == 'static'


def test_coinbase_btc_source_static_case_insensitive():
    assert withdrawal_source('coinbase', 'btc') == 'static'


def test_coinbase_usdt_not_static():
    # USDT는 정적 대상 아님 → coinbase는 스크래핑 묶음
    assert withdrawal_source('coinbase', 'USDT') == 'scraped_page'


def test_realtime_api_exchanges():
    assert withdrawal_source('binance', 'BTC') == 'realtime_api'
    assert withdrawal_source('okx', 'BTC') == 'realtime_api'
    assert withdrawal_source('bybit', 'BTC') == 'realtime_api'


def test_kraken_scraped():
    assert withdrawal_source('kraken', 'BTC') == 'scraped_page'
