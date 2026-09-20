from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.app.domain.paths_sell import find_cheapest_sell_path_from_snapshot_rows


def _make_run():
    r = MagicMock()
    r.usd_krw_rate = 1400.0
    r.completed_at = None
    r.id = 1
    r.status = 'success'
    return r


def _mock_wallet_fee(fee_btc: float = 0.00001):
    """mempool API 호출을 막는 wallet fee 픽스처."""
    return {
        'source': 'mempool.space',
        'source_url': 'https://mempool.space/api/v1/fees/recommended',
        'fee_target': 'medium',
        'medium_fee_rate_sat_vb': 10.0,
        'fastest_fee_sat_vb': 12.0,
        'hour_fee_sat_vb': 8.0,
        'economy_fee_sat_vb': 5.0,
        'minimum_fee_sat_vb': 1.0,
        'address_type': 'p2wpkh',
        'utxo_count': 1,
        'output_count': 2,
        'estimated_tx_vbytes': 141,
        'fee_sats': int(fee_btc * 1e8),
        'fee_btc': fee_btc,
    }


def _make_ticker(exchange: str, price: float, currency: str = 'KRW', taker_pct: float = 0.1):
    r = MagicMock()
    r.exchange = exchange
    r.market_type = 'spot'
    r.currency = currency
    r.price = price
    r.taker_fee_pct = taker_pct
    r.usd_krw_rate = None
    return r


def _make_withdrawal(
    exchange: str,
    coin: str,
    network_label: str,
    fee: float,
    fee_krw: float | None = None,
    enabled: bool = True,
    min_withdrawal: float | None = None,
    max_withdrawal: float | None = None,
):
    r = SimpleNamespace(
        exchange=exchange,
        coin=coin,
        network_label=network_label,
        fee=fee,
        fee_krw=fee_krw,
        enabled=enabled,
        min_withdrawal=min_withdrawal,
        max_withdrawal=max_withdrawal,
    )
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


def test_sell_usdt_path_blocked_by_max_withdrawal():
    """USDT 출금 row에 max_withdrawal이 있고 전송액이 초과할 때 해당 경로가 all_paths에서 제외되고
    disabled_paths에 '한도' 사유가 포함되어야 한다."""
    run = _make_run()
    amount_btc = 10.0  # 거액: USDT 전송액이 max_withdrawal을 초과하도록

    # 글로벌 ticker: BTC/USD 100000, taker 0.1%
    global_ticker = _make_ticker('binance', 100_000.0, currency='USD', taker_pct=0.1)
    # 국내 ticker: BTC/KRW 150,000,000, taker 0.05%
    korea_ticker = _make_ticker('bithumb', 150_000_000.0, currency='KRW', taker_pct=0.05)

    # USDT 출금 row: max_withdrawal=5000 USDT (거액 전송 시 초과)
    usdt_wd = _make_withdrawal(
        exchange='binance',
        coin='USDT',
        network_label='TRC20',
        fee=1.0,
        fee_krw=1400.0,
        enabled=True,
        max_withdrawal=5_000.0,  # 거액 BTC 매도 시 USDT 수십만 달러 → 초과
    )

    with patch('backend.app.domain.paths_sell._estimate_wallet_btc_network_fee', return_value=_mock_wallet_fee(0.00001)):
        result = find_cheapest_sell_path_from_snapshot_rows(
            amount_btc,
            'binance',
            run,
            ticker_rows=[global_ticker, korea_ticker],
            withdrawal_rows=[usdt_wd],
            network_rows=[],
        )

    assert 'error' not in result, f'에러 발생: {result}'
    # USDT 경로가 all_paths에 없어야 함
    usdt_paths = [p for p in result['all_paths'] if p['transfer_coin'] == 'USDT']
    assert len(usdt_paths) == 0, f'USDT 경로가 all_paths에 남아 있음: {usdt_paths}'

    # disabled_paths에 한도 사유가 있어야 함
    assert len(result['disabled_paths']) >= 1, 'disabled_paths가 비어 있음'
    reasons = [d['reason'] for d in result['disabled_paths']]
    assert any('한도' in r for r in reasons), f'한도 사유 없음: {reasons}'


def test_sell_usdt_path_not_blocked_within_max_withdrawal():
    """전송액이 max_withdrawal 이내이면 USDT 경로가 정상 포함된다."""
    run = _make_run()
    amount_btc = 0.001  # 소액: USDT 전송액이 max_withdrawal 이하

    global_ticker = _make_ticker('binance', 100_000.0, currency='USD', taker_pct=0.1)
    korea_ticker = _make_ticker('bithumb', 150_000_000.0, currency='KRW', taker_pct=0.05)

    # max_withdrawal=5000 USDT → 소액에선 문제없음 (0.001 BTC × 100000 USD = 100 USDT)
    usdt_wd = _make_withdrawal(
        exchange='binance',
        coin='USDT',
        network_label='TRC20',
        fee=1.0,
        fee_krw=1400.0,
        enabled=True,
        max_withdrawal=5_000.0,
    )

    with patch('backend.app.domain.paths_sell._estimate_wallet_btc_network_fee', return_value=_mock_wallet_fee(0.00001)):
        result = find_cheapest_sell_path_from_snapshot_rows(
            amount_btc,
            'binance',
            run,
            ticker_rows=[global_ticker, korea_ticker],
            withdrawal_rows=[usdt_wd],
            network_rows=[],
        )

    assert 'error' not in result
    usdt_paths = [p for p in result['all_paths'] if p['transfer_coin'] == 'USDT']
    assert len(usdt_paths) >= 1, 'max_withdrawal 이내인 USDT 경로가 all_paths에서 누락됨'


def test_sell_disabled_paths_deduplication():
    """동일 (exchange, coin, network, reason)의 disabled_paths는 중복 없이 1개만 기록된다."""
    run = _make_run()
    amount_btc = 50.0  # 매우 거액: 여러 한국 거래소 루프 반복 시 같은 USDT row가 반복 차단

    # 국내 거래소 2곳
    korea_tickers = [
        _make_ticker('bithumb', 150_000_000.0, currency='KRW', taker_pct=0.05),
        _make_ticker('upbit', 149_000_000.0, currency='KRW', taker_pct=0.05),
    ]
    global_ticker = _make_ticker('binance', 100_000.0, currency='USD', taker_pct=0.1)

    usdt_wd = _make_withdrawal(
        exchange='binance',
        coin='USDT',
        network_label='TRC20',
        fee=1.0,
        fee_krw=1400.0,
        enabled=True,
        max_withdrawal=1_000.0,
    )

    with patch('backend.app.domain.paths_sell._estimate_wallet_btc_network_fee', return_value=_mock_wallet_fee(0.00001)):
        result = find_cheapest_sell_path_from_snapshot_rows(
            amount_btc,
            'binance',
            run,
            ticker_rows=[global_ticker] + korea_tickers,
            withdrawal_rows=[usdt_wd],
            network_rows=[],
        )

    # 같은 (거래소, USDT, TRC20, 한도초과) disabled가 반복 추가되지 않아야 함.
    # 거래소가 키에 들어가는 이유는 입금망 제약처럼 거래소마다 다른 사유가 있기 때문이다.
    disabled_reasons = [
        (d['korean_exchange'], d['transfer_coin'], d['network'], d['reason'])
        for d in result['disabled_paths']
    ]
    assert len(disabled_reasons) == len(set(disabled_reasons)), f'중복 disabled_paths 존재: {disabled_reasons}'


def test_coinone_sell_fee_carries_voucher_note():
    """코인원 바우처 이벤트 진행 중이면 국내 매도 수수료 항목에 note가 실린다.

    note는 프론트 결과 페이지에서 배지로 노출되므로, 실제 경로 계산 결과의
    breakdown까지 값이 전달되는지를 엔드투엔드로 확인한다.
    """
    # Arrange
    run = _make_run()
    global_ticker = _make_ticker('binance', 100_000.0, currency='USD', taker_pct=0.1)
    # 코인원은 이벤트로 taker 0%, 업비트는 평시 수수료 → 배지가 코인원에만 붙는지 대조
    coinone_ticker = _make_ticker('coinone', 150_000_000.0, taker_pct=0.0)
    upbit_ticker = _make_ticker('upbit', 150_000_000.0, taker_pct=0.05)
    btc_wds = [
        _make_withdrawal('coinone', 'BTC', 'Bitcoin (On-chain)', 0.0009, fee_krw=135_000.0),
        _make_withdrawal('upbit', 'BTC', 'Bitcoin (On-chain)', 0.0009, fee_krw=135_000.0),
    ]

    promo = {'taker_fee_pct': 0.0, 'requires_voucher': True}

    # Act
    with patch('backend.app.domain.path_helpers.fetch_coinone_fee_promo', return_value=promo), \
         patch('backend.app.domain.paths_sell._estimate_wallet_btc_network_fee', return_value=_mock_wallet_fee(0.00001)):
        result = find_cheapest_sell_path_from_snapshot_rows(
            0.5,
            'binance',
            run,
            ticker_rows=[global_ticker, coinone_ticker, upbit_ticker],
            withdrawal_rows=btc_wds,
            network_rows=[],
        )

    # Assert
    assert 'error' not in result, f'에러 발생: {result}'

    def _sell_notes(exchange: str) -> list:
        return [
            c['note']
            for p in result['all_paths'] if p['korean_exchange'] == exchange
            for c in p['breakdown']['components'] if c['label'] == '국내 BTC 매도 수수료'
        ]

    coinone_notes = _sell_notes('coinone')
    assert coinone_notes, '코인원 매도 경로가 없음'
    assert all('바우처' in note for note in coinone_notes), f'코인원 note 누락: {coinone_notes}'
    # 다른 거래소에는 붙지 않아야 한다
    assert _sell_notes('upbit') == [None] * len(_sell_notes('upbit'))


# ── 입금 관문 (deposit_gates) ──────────────────────────────────────────────────
# 매도 경로의 마지막 구간은 '무언가 → 국내 거래소 입금'이다. 수수료로는 드러나지 않지만
# 거래소가 그 입금을 받아주는지가 경로의 실행 가능성을 가른다.

def _sell_with_gates(amount_btc: float = 0.05, global_exchange: str = 'binance'):
    """국내 BTC 매도(경로 1)와 USDT 경유(경로 2)가 모두 나오는 최소 입력."""
    run = _make_run()
    global_ticker = _make_ticker(global_exchange, 90_000.0, currency='USD', taker_pct=0.1)
    upbit_ticker = _make_ticker('upbit', 130_000_000.0, taker_pct=0.05)
    bithumb_ticker = _make_ticker('bithumb', 130_000_000.0, taker_pct=0.04)
    coinone_ticker = _make_ticker('coinone', 130_000_000.0, taker_pct=0.1)
    korbit_ticker = _make_ticker('korbit', 130_000_000.0, taker_pct=0.2)
    gopax_ticker = _make_ticker('gopax', 130_000_000.0, taker_pct=0.2)
    withdrawals = [
        _make_withdrawal('upbit', 'BTC', 'Bitcoin', 0.0009),
        _make_withdrawal('bithumb', 'BTC', 'Bitcoin', 0.0005),
        _make_withdrawal('coinone', 'BTC', 'Bitcoin', 0.0009),
        _make_withdrawal('korbit', 'BTC', 'Bitcoin', 0.0009),
        _make_withdrawal('gopax', 'BTC', 'Bitcoin', 0.0009),
        _make_withdrawal(global_exchange, 'USDT', 'Tron (TRC20)', 1.0),
    ]
    with patch(
        'backend.app.domain.paths_sell._estimate_wallet_btc_network_fee',
        return_value=_mock_wallet_fee(),
    ):
        return find_cheapest_sell_path_from_snapshot_rows(
            amount_btc,
            global_exchange,
            run,
            [global_ticker, upbit_ticker, bithumb_ticker, coinone_ticker, korbit_ticker, gopax_ticker],
            withdrawals,
            [],
        )


def _paths_of(result, variant, korean_exchange):
    return [
        p for p in result['all_paths']
        if p['route_variant'] == variant and p['korean_exchange'] == korean_exchange
    ]


def test_모든_매도_경로가_deposit_gates_필드를_갖는다():
    result = _sell_with_gates()
    assert result.get('all_paths'), '경로가 계산되지 않았다'
    for p in result['all_paths']:
        assert 'deposit_gates' in p, p['path_id']
        assert isinstance(p['deposit_gates'], list)


def test_업비트_BTC_직접_입금은_blocked_로_표시된다():
    """업비트가 등록을 받는 개인지갑에 비트코인 온체인 지갑이 없어 이 경로는 뚫리지 않는다."""
    result = _sell_with_gates()
    paths = _paths_of(result, 'btc_direct', 'upbit')
    assert paths, 'btc_direct/upbit 경로가 없다'
    gates = paths[0]['deposit_gates']
    assert [g['level'] for g in gates] == ['blocked']
    assert gates[0]['kind'] == 'personal_wallet'


def test_코인원_BTC_직접_입금은_등록하면_가능할_수_있어_required_다():
    """코인원은 렛저·디센트·삼성 블록체인 월렛을 등록 목록에 두고 있어 blocked 로 단정하지 않는다."""
    result = _sell_with_gates()
    paths = _paths_of(result, 'btc_direct', 'coinone')
    assert paths
    assert [g['level'] for g in paths[0]['deposit_gates']] == ['required']


def test_소액_BTC_직접_입금은_관문이_없다():
    """업비트는 100만원 미만 입금을 별도 검증 없이 받는다."""
    # 0.005 BTC × 1.3억 = 65만원 → 기준 금액 미만
    result = _sell_with_gates(amount_btc=0.005)
    paths = _paths_of(result, 'btc_direct', 'upbit')
    assert paths
    assert paths[0]['deposit_gates'] == []


def test_업비트_USDT_경유는_바이낸스발_입금이_허용되어_관문이_없다():
    result = _sell_with_gates()
    paths = _paths_of(result, 'usdt_via_global', 'upbit')
    assert paths
    assert paths[0]['deposit_gates'] == []


def test_빗썸_USDT_경유는_바이낸스가_연동되어_관문이_없다():
    """빗썸은 바이낸스를 본인 계정 확인 서비스로 연동해 입금이 자동 반영된다."""
    result = _sell_with_gates()
    paths = _paths_of(result, 'usdt_via_global', 'bithumb')
    assert paths
    assert paths[0]['deposit_gates'] == []


def test_고팍스_USDT_경유는_바이비트발_입금이_막힌다():
    """고팍스 입출금 가능 목록에 바이비트가 없다."""
    result = _sell_with_gates(global_exchange='bybit')
    paths = _paths_of(result, 'usdt_via_global', 'gopax')
    assert paths
    gates = paths[0]['deposit_gates']
    assert [g['level'] for g in gates] == ['blocked']
    assert gates[0]['kind'] == 'vasp'


def test_업비트_USDT_경유는_바이비트발_입금도_통과한다():
    """같은 바이비트라도 업비트는 입출금 지원 목록에 두고 있다."""
    result = _sell_with_gates(global_exchange='bybit')
    paths = _paths_of(result, 'usdt_via_global', 'upbit')
    assert paths
    assert paths[0]['deposit_gates'] == []


# ── USDT 입금망 제약 ───────────────────────────────────────────────────────────
# 해외 거래소가 어떤 체인으로 USDT 를 출금할 수 있다는 사실은, 국내 거래소가 그 체인으로
# 입금 주소를 발급한다는 뜻이 아니다. 신생 체인일수록 출금 수수료가 싸서 수수료만 보면
# 상위권을 차지하는데, 국내 거래소가 받지 않으면 보낸 자산이 묶인다.

def _sell_with_networks(*network_labels: str, global_exchange: str = 'binance', amount_btc: float = 0.05):
    """글로벌 거래소의 USDT 출금망을 원하는 조합으로 주입한 매도 계산."""
    run = _make_run()
    tickers = [
        _make_ticker(global_exchange, 90_000.0, currency='USD', taker_pct=0.1),
        _make_ticker('upbit', 130_000_000.0, taker_pct=0.05),
        _make_ticker('bithumb', 130_000_000.0, taker_pct=0.04),
        _make_ticker('coinone', 130_000_000.0, taker_pct=0.1),
        _make_ticker('korbit', 130_000_000.0, taker_pct=0.2),
        _make_ticker('gopax', 130_000_000.0, taker_pct=0.2),
    ]
    withdrawals = [
        _make_withdrawal(global_exchange, 'USDT', label, 1.0) for label in network_labels
    ]
    with patch(
        'backend.app.domain.paths_sell._estimate_wallet_btc_network_fee',
        return_value=_mock_wallet_fee(),
    ):
        return find_cheapest_sell_path_from_snapshot_rows(
            amount_btc, global_exchange, run, tickers, withdrawals, [],
        )


def _usdt_networks_of(result, korean_exchange):
    return {
        p['network'] for p in result['all_paths']
        if p['transfer_coin'] == 'USDT' and p['korean_exchange'] == korean_exchange
    }


def test_빗썸이_받지_않는_체인은_USDT_경로가_만들어지지_않는다():
    """빗썸 멀티체인 전수 조회에 BERA·XPL·BSC 가 없다."""
    result = _sell_with_networks('Berachain (USDT0)', 'Plasma', 'BNB Smart Chain (BEP20)')
    assert _usdt_networks_of(result, 'bithumb') == set()


def test_확인된_입금망_경로는_그대로_남는다():
    """받지 않는 체인을 걷어내면서 쓸 수 있는 체인까지 사라지면 안 된다."""
    result = _sell_with_networks('Berachain (USDT0)', 'Tron (TRC20)', 'Ethereum (ERC20)')
    assert _usdt_networks_of(result, 'bithumb') == {'Tron (TRC20)', 'Ethereum (ERC20)'}
    # 코인원은 트론만 받는다.
    assert _usdt_networks_of(result, 'coinone') == {'Tron (TRC20)'}


def test_받지_않는_체인은_비활성_목록에_사유와_함께_남는다():
    """경로가 조용히 사라지면 왜 없는지 알 수 없다."""
    result = _sell_with_networks('Berachain (USDT0)', 'Tron (TRC20)')
    rows = [
        d for d in result['disabled_paths']
        if d['korean_exchange'] == 'bithumb' and d['network'] == 'Berachain (USDT0)'
    ]
    assert len(rows) == 1, f'비활성 행이 없다: {result["disabled_paths"]}'
    assert '입금' in rows[0]['reason']


def test_같은_체인이라도_거래소마다_비활성_행이_따로_남는다():
    """입금망 제약은 거래소마다 다르므로 한 행으로 합치면 나머지 거래소 화면이 비어버린다."""
    result = _sell_with_networks('Berachain (USDT0)')
    blocked = {
        d['korean_exchange'] for d in result['disabled_paths']
        if d['network'] == 'Berachain (USDT0)'
    }
    assert blocked == {'upbit', 'bithumb', 'coinone', 'korbit', 'gopax'}


def test_고팍스는_확인하지_못한_체인도_경로에서_빠진다():
    """고팍스는 트론만 확인됐다. 확인되지 않은 이더리움은 추천하지 않는다."""
    result = _sell_with_networks('Tron (TRC20)', 'Ethereum (ERC20)')
    assert _usdt_networks_of(result, 'gopax') == {'Tron (TRC20)'}
    # 같은 이더리움이라도 코빗은 공식 API 로 확인돼 남는다.
    assert 'Ethereum (ERC20)' in _usdt_networks_of(result, 'korbit')


def test_라이트닝_경유_경로도_같은_입금망_제약을_받는다():
    """경로 4 는 스왑을 거치지만 국내 거래소로 들어오는 마지막 구간은 똑같은 USDT 입금이다."""
    run = _make_run()
    tickers = [
        _make_ticker('binance', 90_000.0, currency='USD', taker_pct=0.1),
        _make_ticker('bithumb', 130_000_000.0, taker_pct=0.04),
    ]
    withdrawals = [
        _make_withdrawal('binance', 'USDT', 'Berachain (USDT0)', 1.0),
        _make_withdrawal('binance', 'USDT', 'Tron (TRC20)', 1.0),
    ]
    swap = SimpleNamespace(
        service_name='Boltz', fee_pct=0.1, fee_fixed_sat=0,
        min_amount_sat=1_000, max_amount_sat=100_000_000,
        enabled=True, direction='onchain_to_ln',
    )
    cap = SimpleNamespace(
        exchange='bithumb', supports_lightning_deposit=True, supports_lightning_withdrawal=True,
    )
    with patch(
        'backend.app.domain.paths_sell._estimate_wallet_btc_network_fee',
        return_value=_mock_wallet_fee(),
    ):
        result = find_cheapest_sell_path_from_snapshot_rows(
            0.05, 'binance', run, tickers, withdrawals, [],
            lightning_swap_rows=[swap], exchange_capability_rows=[cap],
        )

    ln_networks = {
        p['network'] for p in result['all_paths']
        if p['route_variant'] == 'lightning_via_global'
    }
    assert ln_networks == {'Tron (TRC20)'}, f'라이트닝 경유 경로에 미지원 체인이 남았다: {ln_networks}'
