"""라이트닝 스왑 수집기의 방향별 수수료 검증.

coinos 와 Wallet of Satoshi 는 온체인 입금을 받아 라이트닝으로 내보낼 수 있다(팔 때 경로의 스왑 구간).
두 서비스 모두 수수료 API 가 없어 공개 안내 문구에서 요율을 읽는다.
"""
import json
from unittest.mock import MagicMock

import requests

from backend.app.services import lightning_scraper as ls

COINOS_FAQ = (
    "Receiving payments is free. Sending to other Coinos accounts is free. Withdrawals to external "
    "wallets are free if you use the same network you received on, otherwise there's a 0.4% fee for "
    "Bitcoin or 0.1% for Lightning or Liquid."
)
WOS_ARTICLE = (
    '<html><body><p>There is a fee of 1.95% on BTC that is received to an on-chain WoS address.</p>'
    '</body></html>'
)


def _resp(text: str, status: int = 200) -> MagicMock:
    r = MagicMock()
    r.status_code = status
    r.text = text
    r.raise_for_status.return_value = None
    return r


def _coinos_locale(answer: str = COINOS_FAQ) -> str:
    return json.dumps({'faq': {'fees': {'question': 'What are the fees?', 'answer': answer}}})


# ── coinos ─────────────────────────────────────────────────────────────────────

def test_coinos_온체인_출금은_FAQ의_비트코인_요율을_쓴다(mocker):
    mocker.patch.object(requests, 'get', return_value=_resp(_coinos_locale()))
    result = ls.fetch_coinos_fees()
    assert result['direction'] == 'ln_to_onchain'
    assert result['fee_pct'] == 0.4
    assert result['enabled'] is True


def test_coinos_온체인_입금_후_라이트닝_송금은_라이트닝_요율을_쓴다(mocker):
    mocker.patch.object(requests, 'get', return_value=_resp(_coinos_locale()))
    result = ls.fetch_coinos_onchain_to_ln_fees()
    assert result['service_name'] == 'Coinos'
    assert result['direction'] == 'onchain_to_ln'
    assert result['fee_pct'] == 0.1
    assert result['fee_fixed_sat'] == 0
    assert result['enabled'] is True


def test_coinos_요율이_바뀌면_바뀐_값을_읽는다(mocker):
    answer = COINOS_FAQ.replace('0.4% fee for Bitcoin', '0.3% fee for Bitcoin').replace('0.1% for Lightning', '0.2% for Lightning')
    mocker.patch.object(requests, 'get', return_value=_resp(_coinos_locale(answer)))
    assert ls.fetch_coinos_fees()['fee_pct'] == 0.3
    assert ls.fetch_coinos_onchain_to_ln_fees()['fee_pct'] == 0.2


def test_coinos_문구를_못_읽으면_확인된_값으로_폴백한다(mocker):
    mocker.patch.object(requests, 'get', side_effect=requests.ConnectionError('down'))
    assert ls.fetch_coinos_fees()['fee_pct'] == 0.4
    assert ls.fetch_coinos_onchain_to_ln_fees()['fee_pct'] == 0.1


# ── Wallet of Satoshi ──────────────────────────────────────────────────────────

def test_wos_온체인_입금_수수료를_지원_문서에서_읽는다(mocker):
    mocker.patch.object(requests, 'get', return_value=_resp(WOS_ARTICLE.replace('1.95%', '2.5%')))
    result = ls.fetch_wos_onchain_to_ln_fees()
    assert result['service_name'] == 'WalletOfSatoshi'
    assert result['direction'] == 'onchain_to_ln'
    assert result['fee_pct'] == 2.5
    assert result['fee_fixed_sat'] == 0
    assert result['enabled'] is True


def test_wos_머리말의_옛_요율이_아니라_본문의_요율을_읽는다(mocker):
    """실제 문서는 meta description 에 'fee of 1%' 가 남아 있고 본문은 1.95% 다."""
    page = (
        '<html><head><meta name="description" content="There is a fee of 1% on BTC that is received '
        'to an on-chain WoS address."></head>'
        '<body><p>There is a fee of 1.95% on BTC that is received to an on-chain WoS address.</p></body></html>'
    )
    mocker.patch.object(requests, 'get', return_value=_resp(page))
    assert ls.fetch_wos_onchain_to_ln_fees()['fee_pct'] == 1.95


def test_wos_문서를_못_읽으면_확인된_값으로_폴백한다(mocker):
    mocker.patch.object(requests, 'get', side_effect=requests.ConnectionError('down'))
    assert ls.fetch_wos_onchain_to_ln_fees()['fee_pct'] == 1.95


# ── Boltz 실패 행의 방향 ───────────────────────────────────────────────────────

def test_boltz_submarine_조회가_실패해도_방향을_남긴다(mocker):
    mocker.patch.object(requests, 'get', side_effect=requests.ConnectionError('dns'))
    result = ls.fetch_boltz_fees()
    assert result['enabled'] is False
    assert result['direction'] == 'onchain_to_ln'


# ── 집계: 고정비 덮어쓰기 ──────────────────────────────────────────────────────
# 온체인→라이트닝 방향에서 사용자가 내는 채굴 수수료는 지갑 수수료로 따로 계산한다.
# coinos·WoS 는 이 방향에 별도 고정비를 받지 않으므로 채굴 수수료 추정치를 덮어쓰면 이중 계산이 된다.

def test_온체인_입금형_서비스에는_채굴_수수료를_덮어쓰지_않는다(mocker):
    def row(name, direction, fixed=0):
        return lambda: {
            'service_name': name, 'fee_pct': 0.1, 'fee_fixed_sat': fixed,
            'min_amount_sat': 1_000, 'max_amount_sat': 1_000_000, 'enabled': True,
            'source_url': None, 'error': None, 'direction': direction,
        }

    mocker.patch.object(ls, '_fetch_mempool_fastest_fee_sat', return_value=282)
    for fn, name, direction in [
        ('fetch_boltz_fees', 'Boltz', 'onchain_to_ln'),
        ('fetch_boltz_reverse_fees', 'Boltz', 'ln_to_onchain'),
        ('fetch_coinos_fees', 'Coinos', 'ln_to_onchain'),
        ('fetch_coinos_onchain_to_ln_fees', 'Coinos', 'onchain_to_ln'),
        ('fetch_bitfreezer_fees', 'BitFreezer', 'ln_to_onchain'),
        ('fetch_wos_fees', 'WalletOfSatoshi', 'ln_to_onchain'),
        ('fetch_wos_onchain_to_ln_fees', 'WalletOfSatoshi', 'onchain_to_ln'),
        ('fetch_strike_fees', 'Strike', 'ln_to_onchain'),
        ('fetch_strike_onchain_to_ln_fees', 'Strike', 'onchain_to_ln'),
        ('fetch_oksusu_fees', 'Oksusu', 'ln_to_onchain'),
    ]:
        mocker.patch.object(ls, fn, new=row(name, direction))

    fixed = {(r['service_name'], r['direction']): r['fee_fixed_sat'] for r in ls.get_all_lightning_swap_fees()}
    assert fixed[('Coinos', 'onchain_to_ln')] == 0
    assert fixed[('WalletOfSatoshi', 'onchain_to_ln')] == 0
    # Boltz submarine 은 Boltz 가 청구하는 claim 트랜잭션 비용이 있어 그대로 덮어쓴다.
    assert fixed[('Boltz', 'onchain_to_ln')] == 282
    # 라이트닝→온체인 방향은 서비스가 온체인 출력을 만들므로 기존처럼 덮어쓴다.
    assert fixed[('Coinos', 'ln_to_onchain')] == 282
