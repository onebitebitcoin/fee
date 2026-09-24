"""
Lightning Network 스왑 서비스 실시간 수수료 스크래퍼

지원 서비스:
  - Boltz Exchange (boltz.exchange): 공개 REST API 사용
  - Coinos.io (coinos.io): 공식 UI 저장소 FAQ 문구 파싱 (양방향)
  - Wallet of Satoshi (walletofsatoshi.com): 공식 문서 스크래핑 / 확인값 폴백 (양방향)
  - Strike (strike.me): 공개 API 사용
  - Oksusu / Corn Wallet (team.oksu.su): 공식 사이트 스크래핑 / 고정 수수료

각 함수 반환 형식:
  {
    'service_name': str,
    'fee_pct': float,        # 수수료율 % (예: 0.5 = 0.5%)
    'fee_fixed_sat': int,    # 고정 수수료 (사토시)
    'min_amount_sat': int,   # 최소 스왑 금액 (사토시)
    'max_amount_sat': int,   # 최대 스왑 금액 (사토시)
    'enabled': bool,
    'source_url': str,
    'error': str | None,     # 오류 메시지 (있을 경우)
  }
"""
from __future__ import annotations

import logging
import re
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

logger = logging.getLogger(__name__)

_TIMEOUT = 10  # HTTP 요청 타임아웃 (초)

_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (compatible; exchange-fee-checker/1.0)',
    'Accept': 'application/json',
}


def fetch_boltz_fees() -> dict:
    """
    Boltz Exchange API에서 BTC(온체인)→Lightning 스왑 수수료를 조회.
    Submarine swap: 온체인 BTC를 보내면 Lightning으로 받는 방식 (0.1%).
    API: https://api.boltz.exchange/v2/swap/submarine
    """
    service_name = 'Boltz'
    source_url = 'https://boltz.exchange'
    api_url = 'https://api.boltz.exchange/v2/swap/submarine'
    try:
        resp = requests.get(api_url, headers=_HEADERS, timeout=_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()

        # BTC/BTC 페어를 찾음 (on-chain BTC → Lightning BTC)
        # Boltz v2 API 응답 구조: {"BTC/BTC": {...}} 또는 {"BTC": {"BTC": {...}}} 중첩 형태
        btc_outer = data.get('BTC')
        pair_data = (
            data.get('BTC/BTC')
            or (btc_outer.get('BTC') if isinstance(btc_outer, dict) else None)
            or btc_outer
            or (list(data.values())[0] if data else None)
        )
        if not pair_data:
            return _error_result(
                service_name, source_url, f'Boltz API 응답에서 BTC/BTC 페어를 찾지 못함: {list(data.keys())}',
                direction='onchain_to_ln',
            )

        fees = pair_data.get('fees', {})
        # Boltz submarine (on-chain → Lightning) 기본 수수료: 0.1%
        fee_pct = fees.get('percentage', 0.1)
        miner_fees = fees.get('minerFees', {})
        # minerFees는 int(submarine) 또는 dict(reverse) 형태
        if isinstance(miner_fees, dict):
            fee_fixed_sat = (miner_fees.get('lockup', 0) or 0) + (miner_fees.get('claim', 0) or 0)
        else:
            fee_fixed_sat = int(miner_fees) if miner_fees else 0

        limits = pair_data.get('limits', {})
        min_amount_sat = limits.get('minimal', 10_000)
        max_amount_sat = limits.get('maximal', 25_000_000)

        return {
            'service_name': service_name,
            'fee_pct': float(fee_pct),
            'fee_fixed_sat': int(fee_fixed_sat),
            'min_amount_sat': int(min_amount_sat),
            'max_amount_sat': int(max_amount_sat),
            'enabled': True,
            'source_url': source_url,
            'error': None,
            'direction': 'onchain_to_ln',
        }
    except Exception as exc:
        logger.warning('Boltz 수수료 조회 실패: %s', exc)
        # 방향이 비면 경로 계산이 어느 쪽에도 쓰지 못해 실패 기록조차 찾을 수 없다.
        return _error_result(service_name, source_url, str(exc), direction='onchain_to_ln')


_COINOS_SOURCE_URL = 'https://coinos.io'
# coinos 공식 UI 저장소의 영문 문구 파일. FAQ 의 수수료 답변이 여기에 있다.
_COINOS_LOCALE_URL = 'https://raw.githubusercontent.com/coinos/coinos-ui/main/src/locales/en.json'
# 2026-09-24 확인한 FAQ 값. 문구를 읽지 못할 때만 쓴다.
_COINOS_BITCOIN_WITHDRAW_PCT = 0.4
_COINOS_LIGHTNING_WITHDRAW_PCT = 0.1


def _fetch_coinos_withdraw_rates() -> tuple[float, float]:
    """coinos FAQ 에서 (비트코인 출금 요율, 라이트닝 출금 요율) 을 읽는다.

    FAQ 원문: "Withdrawals to external wallets are free if you use the same network you received on,
    otherwise there's a 0.4% fee for Bitcoin or 0.1% for Lightning or Liquid."
    받은 망과 다른 망으로 내보낼 때만 붙는 요율이다. 라이트닝으로 받아 온체인으로 내보내면 비트코인 요율,
    온체인으로 받아 라이트닝으로 내보내면 라이트닝 요율이 적용된다(서버 코드 lib/payments.ts 와 일치).
    공개 수수료 API 가 없어 문구를 읽으며, 실패하면 확인된 값으로 폴백한다.
    """
    try:
        resp = requests.get(_COINOS_LOCALE_URL, headers=_HEADERS, timeout=_TIMEOUT)
        resp.raise_for_status()
        match = re.search(
            r'(\d+(?:\.\d+)?)\s*%\s*fee for Bitcoin or\s*(\d+(?:\.\d+)?)\s*%\s*for Lightning',
            resp.text,
            re.IGNORECASE,
        )
        if match:
            return float(match.group(1)), float(match.group(2))
        logger.info('coinos FAQ 에서 수수료 문구를 찾지 못해 확인된 값을 사용')
    except Exception as exc:
        logger.info('coinos FAQ 조회 실패, 확인된 값을 사용: %s', exc)
    return _COINOS_BITCOIN_WITHDRAW_PCT, _COINOS_LIGHTNING_WITHDRAW_PCT


def _coinos_result(fee_pct: float, direction: str) -> dict:
    return {
        'service_name': 'Coinos',
        'fee_pct': fee_pct,
        'fee_fixed_sat': 0,
        'min_amount_sat': 1_000,
        'max_amount_sat': 50_000_000,
        'enabled': True,
        'source_url': _COINOS_SOURCE_URL,
        'error': None,
        'direction': direction,
    }


def fetch_coinos_fees() -> dict:
    """coinos 라이트닝 → 온체인 출금 수수료 (라이트닝으로 받아 비트코인 망으로 내보냄)."""
    bitcoin_pct, _ = _fetch_coinos_withdraw_rates()
    return _coinos_result(bitcoin_pct, 'ln_to_onchain')


def fetch_coinos_onchain_to_ln_fees() -> dict:
    """coinos 온체인 → 라이트닝 수수료 (온체인 주소로 받아 라이트닝으로 내보냄, 팔 때 경로용).

    온체인 입금 자체는 무료이고 라이트닝 송금 시 플랫폼 수수료가 붙는다.
    라이트닝 라우팅 수수료는 송금마다 달라 반영하지 않는다.
    """
    _, lightning_pct = _fetch_coinos_withdraw_rates()
    return _coinos_result(lightning_pct, 'onchain_to_ln')


def fetch_wos_fees() -> dict:
    """
    Wallet of Satoshi (WoS) 온체인 출금 수수료 조회.
    공개 스왑 API 없음. 공식 약관 스크래핑 후 알려진 고정값(1.95%)으로 폴백.
    출처: https://walletofsatoshi.com/disclosure 섹션 6
    """
    service_name = 'WalletOfSatoshi'
    disclosure_url = 'https://walletofsatoshi.com/disclosure'

    def _build_result(fee_pct: float) -> dict:
        return {
            'service_name': service_name,
            'fee_pct': fee_pct,
            'fee_fixed_sat': 7_000,
            'min_amount_sat': 3_000,
            'max_amount_sat': 5_000_000,
            'enabled': True,
            'source_url': disclosure_url,
            'error': None,
            'direction': 'ln_to_onchain',
        }

    try:
        resp = requests.get(
            disclosure_url,
            headers={**_HEADERS, 'Accept': 'text/html,application/xhtml+xml'},
            timeout=_TIMEOUT,
        )
        if resp.status_code == 200:
            text = resp.text
            match = re.search(
                r'(?:on.?chain|withdraw|출금)[^\d]{0,80}(\d+(?:\.\d+)?)\s*%',
                text,
                re.IGNORECASE,
            ) or re.search(
                r'(\d+(?:\.\d+)?)\s*%[^\n<]{0,120}(?:on.?chain|withdraw|출금)',
                text,
                re.IGNORECASE,
            )
            if match:
                fee_pct = float(match.group(1))
                logger.info('WalletOfSatoshi 수수료 스크래핑 성공: %.2f%%', fee_pct)
                return _build_result(fee_pct)
    except Exception as exc:
        logger.debug('WalletOfSatoshi 스크래핑 실패: %s', exc)

    logger.info('WalletOfSatoshi 스크래핑 실패, 알려진 고정값 1.95%% 사용')
    return _build_result(1.95)


_WOS_ONCHAIN_RECEIVE_URL = (
    'https://support.walletofsatoshi.com/support/solutions/articles/'
    '36000484922-what-are-the-fees-for-receiving-btc-on-chain-'
)
_WOS_ONCHAIN_RECEIVE_PCT = 1.95  # 2026-09-24 지원 문서 확인값. 문서를 읽지 못할 때만 쓴다.


def fetch_wos_onchain_to_ln_fees() -> dict:
    """Wallet of Satoshi 온체인 입금 수수료 (온체인 주소로 받아 라이트닝 잔액으로 씀, 팔 때 경로용).

    지원 문서 원문: "There is a fee of 1.95% on BTC that is received to an on-chain WoS address."
    라이트닝 송금은 무료라서 이 입금 수수료가 온체인 → 라이트닝 전환 비용 전부다.
    """
    fee_pct = _WOS_ONCHAIN_RECEIVE_PCT
    try:
        resp = requests.get(
            _WOS_ONCHAIN_RECEIVE_URL,
            headers={**_HEADERS, 'Accept': 'text/html,application/xhtml+xml'},
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        # <head> 의 meta description 에 옛 요율('1%')이 남아 있어 본문(</head> 이후)에서만 읽는다.
        body = resp.text.split('</head>', 1)[-1]
        match = re.search(r'(\d+(?:\.\d+)?)\s*%\s*on BTC that is received', body, re.IGNORECASE)
        if match:
            fee_pct = float(match.group(1))
        else:
            logger.info('WoS 온체인 입금 수수료 문구를 찾지 못해 확인된 값을 사용')
    except Exception as exc:
        logger.info('WoS 온체인 입금 수수료 조회 실패, 확인된 값을 사용: %s', exc)
    return {
        'service_name': 'WalletOfSatoshi',
        'fee_pct': fee_pct,
        'fee_fixed_sat': 0,
        'min_amount_sat': None,
        'max_amount_sat': None,
        'enabled': True,
        'source_url': _WOS_ONCHAIN_RECEIVE_URL,
        'error': None,
        'direction': 'onchain_to_ln',
    }


def fetch_strike_fees() -> dict:
    """
    Strike Lightning 서비스 수수료 조회.
    공개 API 없음. 공식 FAQ 기준 Lightning BTC-to-BTC 전송 시 Strike 마진 0%.
    출처: https://strike.me/en/faq/what-fees-and-rates-apply-to-bitcoin-transactions-wr
    """
    return {
        'service_name': 'Strike',
        'fee_pct': 0.0,
        'fee_fixed_sat': 0,
        'min_amount_sat': 1_000,
        'max_amount_sat': 100_000_000,
        'enabled': True,
        'source_url': 'https://strike.me/en/faq/what-fees-and-rates-apply-to-bitcoin-transactions-wr',
        'error': None,
        'direction': 'ln_to_onchain',
    }


def fetch_strike_onchain_to_ln_fees() -> dict:
    """
    Strike 온체인 → Lightning 방향 수수료 조회.
    Strike는 온체인 BTC를 수신하여 Lightning으로 송금 가능 (SELL 경로용).
    BTC↔BTC 변환 수수료 0% (USD 환전 시에만 수수료 발생).
    """
    return {
        'service_name': 'Strike',
        'fee_pct': 0.0,
        'fee_fixed_sat': 0,
        'min_amount_sat': 1_000,
        'max_amount_sat': 100_000_000,
        'enabled': True,
        'source_url': 'https://strike.me',
        'error': None,
        'direction': 'onchain_to_ln',
    }


_MEMPOOL_FEES_URL = 'https://mempool.space/api/v1/fees/recommended'
_ONCHAIN_TX_VBYTES = 141  # P2WPKH 1-input 2-output 표준 트랜잭션 크기


def _fetch_mempool_fastest_fee_sat() -> int:
    """mempool.space에서 fastestFee(sat/vbyte)를 조회해 141 vbyte 기준 고정 수수료를 반환한다.
    실패 시 2_000 sats를 기본값으로 반환한다.
    """
    try:
        resp = requests.get(_MEMPOOL_FEES_URL, headers=_HEADERS, timeout=_TIMEOUT)
        resp.raise_for_status()
        fastest = resp.json().get('fastestFee', 0)
        return max(1, int(fastest) * _ONCHAIN_TX_VBYTES)
    except Exception as exc:
        logger.warning('mempool.space 수수료 조회 실패, 기본값 2000 sats 사용: %s', exc)
        return 2_000


def fetch_oksusu_fees() -> dict:
    """
    Oksusu / Corn Wallet Lightning → on-chain 출금 수수료 조회.
    공식 사이트(team.oksu.su/ko)의 공개 안내 문구를 스크래핑한다.
    fixed fee: mempool.space fastestFee × 141 vbytes (온체인 miner fee 추정).
    """
    service_name = 'Oksusu'
    source_url = 'https://team.oksu.su/ko'
    fee_fixed_sat = _fetch_mempool_fastest_fee_sat()
    try:
        resp = requests.get(source_url, headers={**_HEADERS, 'Accept': 'text/html'}, timeout=_TIMEOUT)
        resp.raise_for_status()
        text = resp.text
        match = re.search(r'온체인[^\d]{0,40}(\d+(?:\.\d+)?)\s*%', text)
        if not match:
            match = re.search(r'(\d+(?:\.\d+)?)\s*%[^\n<]{0,80}온체인', text)
        if not match:
            return _error_result(service_name, source_url, '페이지에서 수수료 정보를 찾지 못함')
        return {
            'service_name': service_name,
            'fee_pct': float(match.group(1)),
            'fee_fixed_sat': fee_fixed_sat,
            'min_amount_sat': 1_000,
            'max_amount_sat': 100_000_000,
            'enabled': True,
            'source_url': source_url,
            'error': None,
            'direction': 'ln_to_onchain',
        }
    except Exception as exc:
        logger.warning('Oksusu 수수료 조회 실패: %s', exc)
        return _error_result(service_name, source_url, str(exc))


def fetch_boltz_reverse_fees() -> dict:
    """
    Boltz Exchange Lightning→BTC(온체인) 스왑 수수료 조회.
    Reverse swap: Lightning을 보내면 온체인 BTC로 받는 방식 (0.5%).
    API: https://api.boltz.exchange/v2/swap/reverse
    방향(onchain_to_ln/ln_to_onchain)은 direction 필드로 구분하므로 표시명은 'Boltz'로 통일.
    """
    service_name = 'Boltz'
    source_url = 'https://boltz.exchange'
    api_url = 'https://api.boltz.exchange/v2/swap/reverse'
    try:
        resp = requests.get(api_url, headers=_HEADERS, timeout=_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
        btc_outer2 = data.get('BTC')
        pair_data = (
            data.get('BTC/BTC')
            or (btc_outer2.get('BTC') if isinstance(btc_outer2, dict) else None)
            or btc_outer2
            or (list(data.values())[0] if data else None)
        )
        if not pair_data:
            return _error_result(service_name, source_url, 'BTC/BTC 페어 없음', direction='ln_to_onchain')
        fees = pair_data.get('fees', {})
        fee_pct = fees.get('percentage', 0.1)
        miner_fees = fees.get('minerFees', {})
        fee_fixed_sat = int(miner_fees) if isinstance(miner_fees, (int, float)) else 0
        limits = pair_data.get('limits', {})
        return {
            'service_name': service_name,
            'fee_pct': float(fee_pct),
            'fee_fixed_sat': fee_fixed_sat,
            'min_amount_sat': int(limits.get('minimal', 10_000)),
            'max_amount_sat': int(limits.get('maximal', 25_000_000)),
            'enabled': True,
            'source_url': source_url,
            'error': None,
            'direction': 'ln_to_onchain',
        }
    except Exception as exc:
        return _error_result(service_name, source_url, str(exc), direction='ln_to_onchain')


def _error_result(service_name: str, source_url: str, error: str, direction: str | None = None) -> dict:
    return {
        'service_name': service_name,
        'fee_pct': None,
        'fee_fixed_sat': None,
        'min_amount_sat': None,
        'max_amount_sat': None,
        'enabled': False,
        'source_url': source_url,
        'error': error,
        'direction': direction,
    }


def fetch_bitfreezer_fees() -> dict:
    """
    BitFreezer Lightning→On-chain 스왑 수수료 조회.
    BitFreezer는 Lightning BTC를 온체인 BTC 주소로 스왑하는 서비스.
    공개 API: https://bitfreezer.vercel.app/api/status
    """
    service_name = 'BitFreezer'
    source_url = 'https://bitfreezer.vercel.app'
    api_url = 'https://bitfreezer.vercel.app/api/status'
    try:
        resp = requests.get(api_url, headers=_HEADERS, timeout=_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
        fee_pct_raw = data.get('serviceFee')
        if fee_pct_raw is None:
            return _error_result(service_name, source_url, 'API 응답에서 serviceFee 필드 없음')
        return {
            'service_name': service_name,
            'fee_pct': float(fee_pct_raw),
            'fee_fixed_sat': 0,
            'min_amount_sat': int(data.get('min', 10_000)),
            'max_amount_sat': int(data.get('max', 10_000_000)),
            'enabled': True,
            'source_url': source_url,
            'error': None,
            'direction': 'ln_to_onchain',
        }
    except Exception as exc:
        logger.warning('BitFreezer 수수료 조회 실패: %s', exc)
        return _error_result(service_name, source_url, str(exc))


def get_all_lightning_swap_fees() -> list[dict]:
    """
    모든 Lightning 스왑 서비스 수수료를 병렬로 조회.
    모든 서비스의 fee_fixed_sat은 mempool.space fastestFee 기반으로 통일한다.

    Returns:
        list[dict]: 각 서비스의 수수료 정보 목록
    """
    # mempool fee를 한 번만 가져와 모든 서비스에 공유
    miner_fee_sat = _fetch_mempool_fastest_fee_sat()

    fetchers = [
        fetch_boltz_fees,
        fetch_boltz_reverse_fees,
        fetch_coinos_fees,
        fetch_coinos_onchain_to_ln_fees,
        fetch_bitfreezer_fees,
        fetch_wos_fees,
        fetch_wos_onchain_to_ln_fees,
        fetch_strike_fees,
        fetch_strike_onchain_to_ln_fees,
        fetch_oksusu_fees,
    ]

    results = []
    with ThreadPoolExecutor(max_workers=len(fetchers)) as executor:
        futures = {executor.submit(fn): fn.__name__ for fn in fetchers}
        for future in as_completed(futures):
            try:
                result = future.result()
                results.append(result)
            except Exception as exc:
                fn_name = futures[future]
                logger.error('%s 실행 중 예외: %s', fn_name, exc)
                results.append({
                    'service_name': fn_name,
                    'fee_pct': None,
                    'fee_fixed_sat': None,
                    'min_amount_sat': None,
                    'max_amount_sat': None,
                    'enabled': False,
                    'source_url': None,
                    'error': str(exc),
                })

    # Strike는 자체 네트워크 수수료가 없으므로 제외하고, 나머지 활성 서비스에만 mempool 기반 네트워크 수수료 통일 적용
    _NO_NETWORK_FEE_SERVICES = {'Strike'}
    # 온체인 입금을 받아 라이트닝으로 내보내는 지갑형 서비스는 이 방향에 고정비가 없다. 사용자가 보내는
    # 온체인 트랜잭션의 채굴 수수료는 경로 계산이 지갑 수수료로 따로 넣으므로 여기서 더하면 이중 계산이다.
    # (Boltz submarine 은 Boltz 가 claim 트랜잭션 비용을 청구하므로 덮어쓰기 대상으로 남긴다.)
    _NO_NETWORK_FEE_KEYS = {('Coinos', 'onchain_to_ln'), ('WalletOfSatoshi', 'onchain_to_ln')}
    for r in results:
        if not r.get('enabled') or r.get('service_name') in _NO_NETWORK_FEE_SERVICES:
            continue
        if (r.get('service_name'), r.get('direction')) in _NO_NETWORK_FEE_KEYS:
            continue
        r['fee_fixed_sat'] = miner_fee_sat

    # 서비스 이름 순 정렬
    results.sort(key=lambda x: x.get('service_name', ''))
    return results
