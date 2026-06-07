"""_fetch_kimp_data 내부 계산 로직 단위 테스트.
실제 네트워크 호출 없이 mock 가격으로 USDT 기준 / 포렉스 기준 두 값을 검증한다.
"""
from unittest.mock import patch


def _compute_kimp(btc_krw: float, btc_usd: float, usdt_krw: float) -> float:
    return round((btc_krw / (btc_usd * usdt_krw) - 1) * 100, 4)


def _compute_kimp_forex(btc_krw: float, btc_usd: float, usd_krw: float) -> float:
    return round((btc_krw / (btc_usd * usd_krw) - 1) * 100, 4)


def test_kimp_usdt_positive_when_domestic_above_usdt_converted():
    # 국내가 100,000,000원, 글로벌 60,000USD, USDT/KRW 1,530원
    # 글로벌 BTC KRW(USDT 기준) = 60,000 * 1,530 = 91,800,000
    # kimp = (100,000,000 / 91,800,000 - 1) * 100 ≈ 8.93%
    result = _compute_kimp(100_000_000, 60_000, 1_530)
    assert result > 0
    assert abs(result - 8.93) < 0.1


def test_kimp_forex_negative_when_forex_rate_higher():
    # 국내가 100,000,000원, 글로벌 60,000USD, 포렉스 환율 1,700원 (과장된 값)
    # 글로벌 BTC KRW(포렉스) = 60,000 * 1,700 = 102,000,000
    # kimp = (100,000,000 / 102,000,000 - 1) * 100 ≈ -1.96%
    result = _compute_kimp_forex(100_000_000, 60_000, 1_700)
    assert result < 0


def test_kimp_usdt_and_forex_differ_due_to_reverse_tether_premium():
    # 역테더 프리미엄 시나리오: USDT/KRW(1,520) < 포렉스(1,545)
    # 동일한 국내 BTC 가격에서 USDT 기준 김프 > 포렉스 기준 김프
    btc_krw = 100_000_000
    btc_usd = 65_000
    usdt_krw = 1_520
    forex_krw = 1_545

    kimp_usdt = _compute_kimp(btc_krw, btc_usd, usdt_krw)
    kimp_forex = _compute_kimp_forex(btc_krw, btc_usd, forex_krw)

    assert kimp_usdt > kimp_forex
    diff = kimp_usdt - kimp_forex
    # 역테더 프리미엄 ~1.6%p 수준
    assert 1.0 < diff < 3.0


def test_fetch_kimp_data_returns_both_fields():
    from backend.app.api.routes.market import _fetch_kimp_data

    fake_btc = {'price': '100000000'}
    fake_usdt = {'price': '1520'}
    fake_btc_usd = {'price': '65000'}

    def mock_korea_fetcher(symbol='BTC'):
        return fake_btc if symbol == 'BTC' else fake_usdt

    with (
        patch('backend.app.api.routes.market.KOREA_FETCHERS', {'upbit': mock_korea_fetcher}),
        patch('backend.app.api.routes.market.fetch_binance_spot', return_value=fake_btc_usd),
        patch('backend.app.api.routes.market._fetch_usd_krw_realtime', return_value=1545.0),
    ):
        result = _fetch_kimp_data()

    assert result is not None
    assert 'kimp' in result
    assert 'kimp_forex' in result
    assert 'usdt_krw_prices' in result
    assert 'upbit' in result['kimp']
    assert 'upbit' in result['kimp_forex']

    # kimp(주표시) = 포렉스 기준 (Yahoo Finance USD/KRW)
    expected_forex = round((100_000_000 / (65_000 * 1_545.0) - 1) * 100, 4)
    assert abs(result['kimp']['upbit'] - expected_forex) < 0.001

    # kimp_forex(보조표시) = USDT/KRW 실거래가 기준 (역테더 프리미엄 제거값)
    expected_usdt = round((100_000_000 / (65_000 * 1_520) - 1) * 100, 4)
    assert abs(result['kimp_forex']['upbit'] - expected_usdt) < 0.001

    # USDT 기준(보조)이 포렉스 기준(주)보다 높아야 함 (USDT < 달러이므로 역테더 프리미엄 효과)
    assert result['kimp_forex']['upbit'] > result['kimp']['upbit']
