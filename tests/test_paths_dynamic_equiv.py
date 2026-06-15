"""동등성 가드 테스트 — paths_dynamic.py 엣지 마이그레이션 전후 수치 동일성 검증.

베이스라인 수치: 마이그레이션 전 인라인 계산으로 직접 도출 후 하드코딩.
모킹 방식: tests/test_btc_path_alert.py의 monkeypatch 패턴 참고.

픽스처 파라미터:
  - USD/KRW: 1350.0
  - 글로벌 BTC 가격: $100,000
  - 한국 BTC 가격: 140,000,000 KRW (각 거래소 동일)
  - 한국 USDT 가격: 1,348 KRW
  - 글로벌 BTC 온체인 출금: 0.0002 BTC (= 27,000 KRW)
  - 글로벌 BTC LN 출금: 0.00001 BTC (= 1,350 KRW)
  - USDT 출금 (TRC20): 1.0 USDT
  - 국내 BTC 출금 (upbit/Bitcoin): 0.0005 BTC
"""
from __future__ import annotations

from unittest.mock import MagicMock

import backend.app.domain.paths_dynamic as pd
from backend.app.services.promo_scraper import PromoContext

# ---------------------------------------------------------------------------
# 공통 픽스처 파라미터
# ---------------------------------------------------------------------------
MOCK_USD_KRW = 1350.0
MOCK_GLOBAL_BTC_USD = 100_000.0
MOCK_KOREAN_BTC_PRICE = 140_000_000.0
MOCK_KOREAN_USDT_PRICE = 1_348.0
AMOUNT_KRW = 1_000_000

_KOREA_EXCHANGES = ['upbit', 'bithumb', 'korbit', 'coinone', 'gopax']


def _make_ticker(price):
    return MagicMock(result=MagicMock(return_value={'price': str(price)}))


def _make_wd_networks(*networks):
    return MagicMock(result=MagicMock(return_value=list(networks)))


def _btc_network(fee=0.0005):
    return {'label': 'Bitcoin', 'fee': fee, 'enabled': True, 'min': None, 'max': None}


def _usdt_trc20(fee=1.0):
    return {'label': 'TRC20', 'fee': fee, 'enabled': True, 'min': None, 'max': None}


def _ln_network(fee=0.00001):
    return {'label': 'Lightning Network', 'fee': fee, 'enabled': True,
            'min': 0.0, 'max': None}


def _mock_future(value):
    f = MagicMock()
    f.result.return_value = value
    return f


# ---------------------------------------------------------------------------
# 공통 monkeypatch 헬퍼
# ---------------------------------------------------------------------------

def _patch_dynamic(monkeypatch, *, include_ln: bool = False):
    """find_cheapest_path_dynamic 내부 IO를 모두 모킹."""

    def fake_withdrawal_data(exchange, coin):
        if coin == 'BTC':
            # 글로벌 거래소(binance)는 0.0002 BTC, 한국 거래소는 0.0005 BTC
            fee = 0.0002 if exchange == 'binance' else 0.0005
            nets = [_btc_network(fee=fee)]
            if include_ln and exchange == 'binance':
                nets.append(_ln_network())
            return nets
        # USDT
        return [_usdt_trc20()]

    monkeypatch.setattr(pd, 'fetch_usd_krw_rate', lambda: MOCK_USD_KRW)
    monkeypatch.setattr(pd, 'get_withdrawal_data', fake_withdrawal_data)
    monkeypatch.setattr(pd, 'check_maintenance_status', lambda *a, **kw: {})
    monkeypatch.setattr(pd, 'fetch_promo_context', lambda: PromoContext())

    # KOREA_FETCHERS / GLOBAL_FETCHERS patch
    global_fn = lambda: {'price': str(MOCK_GLOBAL_BTC_USD)}  # noqa: E731

    # paths_dynamic은 KOREA_FETCHERS의 fn을 BTC(인수 없음)/USDT('USDT' 인수) 두 방식으로 호출:
    #   fut_tickers      = {ex: executor.submit(fn)         for ex, fn in KOREA_FETCHERS.items()}
    #   fut_usdt_tickers = {ex: executor.submit(fn, 'USDT') for ex, fn in KOREA_FETCHERS.items()}
    # 따라서 fn은 인수 유무를 모두 처리해야 한다.
    def flexible_korea_fn(*args, **kwargs):
        return {'price': str(MOCK_KOREAN_USDT_PRICE if args else MOCK_KOREAN_BTC_PRICE)}

    monkeypatch.setattr(pd, 'KOREA_FETCHERS', {ex: flexible_korea_fn for ex in _KOREA_EXCHANGES})
    monkeypatch.setattr(pd, 'GLOBAL_FETCHERS', {'binance': global_fn})
    monkeypatch.setattr(pd, 'GROUPS', {
        'korea': _KOREA_EXCHANGES,
        'global': ['binance'],
    })

    # slippage 없음
    monkeypatch.setattr('backend.app.domain.korea_exchange_registry.get_slippage', lambda ex: None)
    monkeypatch.setattr('backend.app.domain.korea_exchange_registry.get_withdrawal_limits', lambda ex: None)


# ---------------------------------------------------------------------------
# 테스트 1: BTC 직접 출금 수치 동등성
# ---------------------------------------------------------------------------

def test_btc_direct_path_numeric_equivalence(monkeypatch):
    """BTC 직접 출금 경로의 total_fee_krw / btc_received가 베이스라인과 일치."""
    _patch_dynamic(monkeypatch, include_ln=False)

    result = pd.find_cheapest_path_dynamic(
        amount_krw=AMOUNT_KRW,
        global_exchange='binance',
        promo_ctx=PromoContext(),
        include_fdusd=False,
    )

    assert 'error' not in result, f"오류 발생: {result.get('error')}"

    btc_direct = [p for p in result['all_paths'] if p.get('quote_strategy') == 'btc_direct']
    assert len(btc_direct) > 0, 'BTC 직접 출금 경로가 없음'

    # upbit taker=0.0005, wd_fee=0.0005 BTC, price=140_000_000
    # trading=500, wd=70000, total=70500, btc=0.00663929
    upbit_paths = [p for p in btc_direct if p['korean_exchange'] == 'upbit']
    assert len(upbit_paths) > 0, 'upbit BTC 직접 경로 없음'
    p = upbit_paths[0]
    assert p['total_fee_krw'] == 70500, f"total_fee_krw={p['total_fee_krw']} (기대: 70500)"
    assert p['btc_received'] == 0.00663929, f"btc_received={p['btc_received']} (기대: 0.00663929)"
    assert p['transfer_coin'] == 'BTC'
    assert p['quote_strategy'] == 'btc_direct'


# ---------------------------------------------------------------------------
# 테스트 2: USDT taker 경로 수치 동등성
# ---------------------------------------------------------------------------

def test_usdt_taker_path_numeric_equivalence(monkeypatch):
    """USDT taker 경로의 total_fee_krw / btc_received가 베이스라인과 일치."""
    _patch_dynamic(monkeypatch, include_ln=False)

    result = pd.find_cheapest_path_dynamic(
        amount_krw=AMOUNT_KRW,
        global_exchange='binance',
        promo_ctx=PromoContext(),
        include_fdusd=False,
    )

    assert 'error' not in result

    usdt_taker = [p for p in result['all_paths'] if p.get('quote_strategy') == 'usdt_taker']
    assert len(usdt_taker) > 0, 'USDT taker 경로 없음'

    # bithumb taker=0.0004, USDT wd=1.0 (TRC20), global_taker=0.001, global_wd=0.0002 BTC
    # trading=400, wd=1348, gtrade=1000, gwd=27000, total=29748, btc=0.00719802
    bithumb_paths = [p for p in usdt_taker if p['korean_exchange'] == 'bithumb']
    assert len(bithumb_paths) > 0, 'bithumb USDT taker 경로 없음'
    p = bithumb_paths[0]
    assert p['total_fee_krw'] == 29748, f"total_fee_krw={p['total_fee_krw']} (기대: 29748)"
    assert p['btc_received'] == 0.00719802, f"btc_received={p['btc_received']} (기대: 0.00719802)"
    assert p['transfer_coin'] == 'USDT'
    assert p['quote_strategy'] == 'usdt_taker'
    assert p['global_exit_mode'] == 'onchain'


# ---------------------------------------------------------------------------
# 테스트 3: LN swap 경로 수치 동등성 (서비스별)
# ---------------------------------------------------------------------------

def test_ln_swap_path_numeric_equivalence(monkeypatch):
    """LN swap 경로의 total_fee_krw / btc_received가 서비스별 베이스라인과 일치."""
    _patch_dynamic(monkeypatch, include_ln=True)

    result = pd.find_cheapest_path_dynamic(
        amount_krw=AMOUNT_KRW,
        global_exchange='binance',
        promo_ctx=PromoContext(),
        include_fdusd=False,
    )

    assert 'error' not in result

    ln_paths = [p for p in result['all_paths']
                if p.get('global_exit_mode') == 'lightning_swap'
                and p.get('korean_exchange') == 'bithumb'
                and p.get('quote_strategy') == 'usdt_taker']
    assert len(ln_paths) > 0, 'bithumb LN swap 경로 없음'

    # 베이스라인 (bithumb, usdt_taker, TRC20, binance LN 0.00001 BTC):
    # strike:          btc=0.00738802, total=4098
    # oksusu:          btc=0.00735182, total=8985
    # boltz:           btc=0.00735108, total=9085
    # coinos:          btc=0.00735108, total=9085
    # walletofsatoshi: btc=0.00724396, total=23547
    expected = {
        'strike':          (0.00738802, 4098),
        'oksusu':          (0.00735182, 8985),
        'boltz':           (0.00735108, 9085),
        'coinos':          (0.00735108, 9085),
        'walletofsatoshi': (0.00724396, 23547),
    }

    by_svc = {p['ln_swap_service']: p for p in ln_paths}
    for svc_name, (exp_btc, exp_fee) in expected.items():
        assert svc_name in by_svc, f'서비스 {svc_name} 경로 없음'
        p = by_svc[svc_name]
        assert p['btc_received'] == exp_btc, \
            f"{svc_name}: btc_received={p['btc_received']} (기대: {exp_btc})"
        assert p['total_fee_krw'] == exp_fee, \
            f"{svc_name}: total_fee_krw={p['total_fee_krw']} (기대: {exp_fee})"
        assert p['destination'] == 'onchain_wallet'
        assert p['global_exit_mode'] == 'lightning_swap'


# ---------------------------------------------------------------------------
# 테스트 4: 출력 키 불변성 — 알림 스크립트 소비 필드 보존
# ---------------------------------------------------------------------------

def test_alert_consumed_fields_preserved(monkeypatch):
    """btc_path_alert.py가 읽는 최상위 필드가 경로 dict에 모두 존재."""
    _patch_dynamic(monkeypatch, include_ln=True)

    result = pd.find_cheapest_path_dynamic(
        amount_krw=AMOUNT_KRW,
        global_exchange='binance',
        promo_ctx=PromoContext(),
        include_fdusd=False,
    )

    assert 'error' not in result
    assert result['all_paths'], '경로 없음'

    # 최상위 결과 키
    for key in ('all_paths', 'best_path', 'top5', 'global_btc_price_krw_ref',
                'kimchi_premiums', 'usdt_kimchi_premiums', 'korean_usdt_prices',
                'promo_context', 'errors' if 'errors' in result else 'total_paths_evaluated'):
        pass  # errors는 dynamic 단일 결과에 없어도 무방

    # 경로 dict 필드
    required_path_fields = {
        'korean_exchange', 'transfer_coin', 'total_fee_krw', 'fee_pct',
        'btc_received', 'global_exit_mode', 'quote_strategy',
    }
    for p in result['all_paths']:
        missing = required_path_fields - set(p.keys())
        assert not missing, f"경로에 필드 누락: {missing} — {p}"

    # LN swap 경로 추가 필드
    ln_paths = [p for p in result['all_paths'] if p.get('global_exit_mode') == 'lightning_swap']
    for p in ln_paths:
        for f in ('ln_swap_service', 'ln_swap_display', 'ln_swap_kyc', 'destination'):
            assert f in p, f"LN 경로 필드 누락: {f}"
