"""첫 화면 '가장 저렴한 경로 TOP 5' 선정 규칙."""
from backend.app.domain.popular_paths import select_popular_paths


def _buy(korean, variant, coin, network, fee, *, exit_mode='onchain', disabled=None, destination='personal'):
    return {
        'path_id': f'{korean}-{variant}-{network}-{exit_mode}',
        'route_variant': variant,
        'korean_exchange': korean,
        'transfer_coin': coin,
        'network': network,
        'global_exit_mode': exit_mode,
        'destination': destination,
        'total_fee_krw': fee,
        'btc_received': 0.01,
        'disabled': disabled,
        'breakdown': {'components': []},
    }


def test_buy_keeps_popular_simple_paths_sorted_by_fee():
    by_global = {
        'binance': {'all_paths': [
            _buy('bithumb', None, 'USDT', 'TRC20', 2986),
            _buy('upbit', None, 'USDT', 'TRC20', 3086),
            _buy('upbit', None, 'USDT', 'Kaia', 3220),         # 같은 조합의 더 비싼 망 → 빠짐
            _buy('bithumb', 'btc_direct', 'BTC', 'Bitcoin', 16328),
            _buy('upbit', 'btc_direct', 'BTC', 'Bitcoin', 16428),
            _buy('upbit', 'btc_via_global', 'BTC', 'Bitcoin', 18026),  # 간결하지 않음
            _buy('coinone', None, 'USDT', 'TRC20', 1000),      # 많이 쓰는 거래소 아님
        ]},
        'okx': {'all_paths': [
            _buy('bithumb', None, 'USDT', 'TRC20', 2583),
            _buy('bithumb', None, 'USDT', 'TRC20', 2583, exit_mode='lightning'),  # 라이트닝 스왑 경유 제외
            _buy('upbit', None, 'USDT', 'TRC20', 2683),
            _buy('bithumb', 'btc_direct', 'BTC', 'Bitcoin', 16328),  # 거래소마다 반복되는 직접 경로 → 한 번만
        ]},
        'bybit': {'all_paths': [_buy('upbit', None, 'USDT', 'TRC20', 100)]},  # 많이 쓰는 해외 거래소 아님
    }

    out = select_popular_paths(by_global, 'buy')

    assert [(p['korean_exchange'], p['global_exchange'], p['total_fee_krw']) for p in out] == [
        ('bithumb', 'okx', 2583),
        ('upbit', 'okx', 2683),
        ('bithumb', 'binance', 2986),
        ('upbit', 'binance', 3086),
        ('bithumb', None, 16328),
    ]
    assert all('breakdown' not in p for p in out)


def test_disabled_paths_are_excluded_and_next_network_takes_over():
    by_global = {'binance': {'all_paths': [
        _buy('bithumb', None, 'USDT', 'Aptos', 2000, disabled=True),  # 점검 중인 망
        _buy('bithumb', None, 'USDT', 'TRC20', 2986),
    ]}}

    out = select_popular_paths(by_global, 'buy')

    assert [(p['network'], p['total_fee_krw']) for p in out] == [('TRC20', 2986)]


def test_errored_global_payload_is_skipped():
    by_global = {
        'binance': {'error': '크롤 실패'},
        'okx': {'all_paths': [_buy('upbit', None, 'USDT', 'TRC20', 2683)]},
    }

    out = select_popular_paths(by_global, 'buy')

    assert [p['global_exchange'] for p in out] == ['okx']


def _sell(korean, variant, coin, network, fee, *, gates=(), exit_mode='onchain'):
    return {
        'path_id': f'{korean}-{variant}-{network}',
        'route_variant': variant,
        'korean_exchange': korean,
        'transfer_coin': coin,
        'network': network,
        'global_exit_mode': exit_mode,
        'total_fee_krw': fee,
        'krw_received': 800000,
        'deposit_gates': list(gates),
    }


def test_sell_excludes_blocked_deposit_but_keeps_conditional_ones():
    by_global = {'binance': {'all_paths': [
        _sell('upbit', 'btc_direct', 'BTC', 'Bitcoin', 517, gates=[{'level': 'blocked'}]),
        _sell('bithumb', 'btc_direct', 'BTC', 'Bitcoin', 437, gates=[{'level': 'required'}]),
        _sell('upbit', 'usdt_via_global', 'USDT', 'Kaia', 1351),
        _sell('upbit', 'lightning_via_global', 'USDT', 'Aptos', 1325, exit_mode='lightning'),
    ]}}

    out = select_popular_paths(by_global, 'sell')

    assert [(p['korean_exchange'], p['route_variant']) for p in out] == [
        ('bithumb', 'btc_direct'),
        ('upbit', 'usdt_via_global'),
    ]
    assert out[0]['global_exchange'] is None
    assert out[1]['global_exchange'] == 'binance'


def test_limit_caps_result():
    by_global = {'binance': {'all_paths': [
        _buy(k, None, 'USDT', 'TRC20', fee) for k, fee in [('upbit', 2), ('bithumb', 1)]
    ]}}

    assert len(select_popular_paths(by_global, 'buy', limit=1)) == 1


def test_popular_endpoint_reuses_cheapest_all_and_filters(mocker):
    from fastapi.testclient import TestClient

    from backend.app.api.routes.market import path_finder
    from backend.app.main import app

    compute = mocker.patch.object(path_finder, '_compute_cheapest_all', return_value={
        'by_global': {'binance': {'all_paths': [
            _buy('bithumb', None, 'USDT', 'TRC20', 2986),
            _buy('bithumb', None, 'USDT', 'Aptos', 1000, disabled=True),
        ]}},
        'latest_scraping_time': 123,
    })
    mocker.patch.object(path_finder.repositories, 'get_latest_successful_run', return_value=None)
    path_finder._cheapest_path_cache.clear()

    res = TestClient(app).get('/api/v1/market/path-finder/popular?mode=buy')

    assert res.status_code == 200
    body = res.json()
    assert body['amount_krw'] == 1_000_000 and body['latest_scraping_time'] == 123
    assert [(p['network'], p['global_exchange']) for p in body['paths']] == [('TRC20', 'binance')]
    assert compute.call_args.kwargs['amount_krw'] == 1_000_000


def test_popular_endpoint_returns_503_when_nothing_usable(mocker):
    from fastapi.testclient import TestClient

    from backend.app.api.routes.market import path_finder
    from backend.app.main import app

    mocker.patch.object(path_finder, '_compute_cheapest_all', return_value={'by_global': {'binance': {'error': 'x'}}})
    mocker.patch.object(path_finder.repositories, 'get_latest_successful_run', return_value=None)
    path_finder._cheapest_path_cache.clear()

    res = TestClient(app).get('/api/v1/market/path-finder/popular?mode=sell')

    assert res.status_code == 503
    assert TestClient(app).get('/api/v1/market/path-finder/popular?mode=swap').status_code == 422
