"""_fetch_kimp_data 내부 계산 로직 단위 테스트.
실제 네트워크 호출 없이 mock 가격으로 포렉스(원달러) 기준 김치 프리미엄 값을 검증한다.
"""
from unittest.mock import patch


def _compute_kimp(btc_krw: float, btc_usd: float, usd_krw: float) -> float:
    return round((btc_krw / (btc_usd * usd_krw) - 1) * 100, 4)


def test_kimp_positive_when_domestic_above_global():
    # 국내가 100,000,000원, 글로벌 60,000USD, 환율 1,530원
    # 글로벌 BTC KRW = 60,000 * 1,530 = 91,800,000
    # kimp = (100,000,000 / 91,800,000 - 1) * 100 ≈ 8.93%
    result = _compute_kimp(100_000_000, 60_000, 1_530)
    assert result > 0
    assert abs(result - 8.93) < 0.1


def test_kimp_negative_when_domestic_below_global():
    # 국내가 100,000,000원, 글로벌 60,000USD, 환율 1,700원 (과장된 값)
    # 글로벌 BTC KRW = 60,000 * 1,700 = 102,000,000
    # kimp = (100,000,000 / 102,000,000 - 1) * 100 ≈ -1.96%
    result = _compute_kimp(100_000_000, 60_000, 1_700)
    assert result < 0


def test_fetch_kimp_data_returns_forex_based_kimp():
    from backend.app.api.routes.market import _fetch_kimp_data

    fake_btc = {'price': '100000000'}
    fake_btc_usd = {'price': '65000'}

    def mock_korea_fetcher(symbol='BTC'):
        return fake_btc

    with (
        patch('backend.app.api.routes.market.KOREA_FETCHERS', {'upbit': mock_korea_fetcher}),
        patch('backend.app.api.routes.market.fetch_binance_spot', return_value=fake_btc_usd),
        patch('backend.app.api.routes.market._fetch_usd_krw_realtime', return_value=1545.0),
    ):
        result = _fetch_kimp_data()

    assert result is not None
    assert 'kimp' in result
    assert 'kimp_forex' not in result
    assert 'usdt_krw_prices' not in result
    assert 'upbit' in result['kimp']

    # kimp = Yahoo Finance 실시간 USD/KRW 포렉스 기준 (kimpga 등 주요 사이트와 동일 방식)
    expected = round((100_000_000 / (65_000 * 1_545.0) - 1) * 100, 4)
    assert abs(result['kimp']['upbit'] - expected) < 0.001
