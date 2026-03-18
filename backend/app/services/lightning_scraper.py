"""
Lightning Network 스왑 서비스 실시간 수수료 스크래퍼

지원 서비스:
  - Boltz Exchange (boltz.exchange): 공개 REST API 사용
  - Coinos.io (coinos.io): 공개 REST API 사용
  - BitFlower (bitflower.com): 웹 스크래핑
  - Wallet of Satoshi (walletofsatoshi.com): 웹 스크래핑 / 고정 수수료
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
            return _error_result(service_name, source_url, f'Boltz API 응답에서 BTC/BTC 페어를 찾지 못함: {list(data.keys())}')

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
        return _error_result(service_name, source_url, str(exc))


def fetch_coinos_fees() -> dict:
    """
    Coinos.io Lightning→On-chain 스왑 수수료 조회.
    Coinos는 Lightning-native 지갑/결제 서비스.
    공개 API: https://coinos.io/api/info
    """
    service_name = 'Coinos'
    source_url = 'https://coinos.io'
    api_url = 'https://coinos.io/api/info'
    try:
        resp = requests.get(api_url, headers=_HEADERS, timeout=_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()

        # Coinos API 응답에서 수수료 추출 시도
        fee_pct = None
        fee_fixed_sat = 0

        # 다양한 필드명 시도
        for key in ('swap_fee', 'lightning_fee', 'fee', 'fees', 'rate'):
            val = data.get(key)
            if val is not None:
                if isinstance(val, (int, float)):
                    fee_pct = float(val)
                elif isinstance(val, dict):
                    inner = val.get('percent', val.get('pct', val.get('rate')))
                    if inner is not None:
                        fee_pct = float(inner)
                break

        if fee_pct is None:
            return _error_result(service_name, source_url, 'API 응답에서 수수료 필드를 찾지 못함')

        return {
            'service_name': service_name,
            'fee_pct': fee_pct,
            'fee_fixed_sat': fee_fixed_sat,
            'min_amount_sat': 1_000,
            'max_amount_sat': 50_000_000,
            'enabled': True,
            'source_url': source_url,
            'error': None,
            'direction': 'ln_to_onchain',
        }
    except Exception as exc:
        logger.warning('Coinos 수수료 조회 실패: %s', exc)
        return _error_result(service_name, source_url, str(exc))


def fetch_bitflower_fees() -> dict:
    """
    BitFlower Lightning 스왑 수수료 조회.
    BitFlower는 Lightning ↔ On-chain 스왑 서비스.
    공개 API: https://bitflower.com/api/v1/fees 또는 웹 스크래핑
    """
    service_name = 'BitFlower'
    source_url = 'https://bitflower.com'
    api_urls = [
        'https://bitflower.com/api/v1/fees',
        'https://bitflower.com/api/fees',
        'https://api.bitflower.com/v1/fees',
        'https://api.bitflower.com/fees',
    ]
    for api_url in api_urls:
        try:
            resp = requests.get(api_url, headers=_HEADERS, timeout=_TIMEOUT)
            if resp.status_code == 200:
                data = resp.json()
                fee_pct = float(data.get('fee_pct', data.get('fee', data.get('percent', 0.5))))
                fee_fixed_sat = int(data.get('fee_fixed_sat', data.get('base_fee', 0)))
                min_amount_sat = int(data.get('min_amount_sat', data.get('min_amount', 10_000)))
                max_amount_sat = int(data.get('max_amount_sat', data.get('max_amount', 10_000_000)))
                return {
                    'service_name': service_name,
                    'fee_pct': fee_pct,
                    'fee_fixed_sat': fee_fixed_sat,
                    'min_amount_sat': min_amount_sat,
                    'max_amount_sat': max_amount_sat,
                    'enabled': True,
                    'source_url': source_url,
                    'error': None,
                    'direction': 'onchain_to_ln',
                }
        except Exception:
            continue

    # 웹 스크래핑 시도
    try:
        resp = requests.get(source_url, headers={**_HEADERS, 'Accept': 'text/html'}, timeout=_TIMEOUT)
        if resp.status_code == 200:
            text = resp.text.lower()
            fee_matches = re.findall(r'(\d+(?:\.\d+)?)\s*%', text)
            if fee_matches:
                fee_pct = float(fee_matches[0])
                return {
                    'service_name': service_name,
                    'fee_pct': fee_pct,
                    'fee_fixed_sat': 0,
                    'min_amount_sat': 10_000,
                    'max_amount_sat': 10_000_000,
                    'enabled': True,
                    'source_url': source_url,
                    'error': 'API 미발견, 웹 스크래핑으로 추정',
                    'direction': 'onchain_to_ln',
                }
    except Exception as exc2:
        logger.warning('BitFlower 웹 스크래핑 실패: %s', exc2)

    return _error_result(service_name, source_url, '모든 API 및 스크래핑 시도 실패')


def fetch_wos_fees() -> dict:
    """
    Wallet of Satoshi (WoS) Lightning→On-chain 스왑 수수료 조회.
    공개 API: https://livingroomofsatoshi.com/api/v1/lnurl/pay (일부 정보)
    """
    service_name = 'WalletOfSatoshi'
    source_url = 'https://walletofsatoshi.com'
    api_url = 'https://livingroomofsatoshi.com/api/v1/lnurl/pay'
    try:
        resp = requests.get(api_url, headers=_HEADERS, timeout=_TIMEOUT)
        if resp.status_code == 200:
            data = resp.json()
            fee_pct = data.get('fee_pct')
            fee_fixed_sat = data.get('fee_fixed_sat')
            if fee_pct is not None:
                return {
                    'service_name': service_name,
                    'fee_pct': float(fee_pct),
                    'fee_fixed_sat': int(fee_fixed_sat) if fee_fixed_sat is not None else 0,
                    'min_amount_sat': 1,
                    'max_amount_sat': 5_000_000,
                    'enabled': True,
                    'source_url': source_url,
                    'error': None,
                    'direction': 'ln_to_onchain',
                }
            return _error_result(service_name, source_url, 'API 응답에서 fee_pct 필드 없음')
        return _error_result(service_name, source_url, f'API 응답 오류: HTTP {resp.status_code}')
    except Exception as exc:
        logger.warning('WalletOfSatoshi API 조회 실패: %s', exc)
        return _error_result(service_name, source_url, str(exc))


def fetch_strike_fees() -> dict:
    """
    Strike Lightning 서비스 수수료 조회.
    Strike는 Lightning ↔ 법정화폐 환전 서비스.
    공개 API: https://api.strike.me/v1/currencies (인증 없이 응답 확인용)
    """
    service_name = 'Strike'
    source_url = 'https://strike.me'
    api_url = 'https://api.strike.me/v1/currencies'
    try:
        resp = requests.get(api_url, headers=_HEADERS, timeout=_TIMEOUT)
        if resp.status_code == 200:
            # Strike는 Lightning 수신(BTC) 무료 - USD 변환 시에만 수수료 발생
            return {
                'service_name': service_name,
                'fee_pct': 0.0,
                'fee_fixed_sat': 0,
                'min_amount_sat': 1_000,
                'max_amount_sat': 100_000_000,
                'enabled': True,
                'source_url': source_url,
                'error': None,
                'direction': 'ln_to_onchain',
            }
        return _error_result(service_name, source_url, f'API 응답 오류: HTTP {resp.status_code}')
    except Exception as exc:
        logger.warning('Strike API 조회 실패: %s', exc)
        return _error_result(service_name, source_url, str(exc))


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


def fetch_oksusu_fees() -> dict:
    """
    Oksusu / Corn Wallet Lightning → on-chain 출금 수수료 조회.
    공식 사이트(team.oksu.su/ko)의 공개 안내 문구를 스크래핑한다.
    """
    service_name = 'Oksusu'
    source_url = 'https://team.oksu.su/ko'
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
            'fee_fixed_sat': 0,
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
    """
    service_name = 'Boltz (Submarine)'
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
            return _error_result(service_name, source_url, 'BTC/BTC 페어 없음')
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
        return _error_result(service_name, source_url, str(exc))


def _error_result(service_name: str, source_url: str, error: str) -> dict:
    return {
        'service_name': service_name,
        'fee_pct': None,
        'fee_fixed_sat': None,
        'min_amount_sat': None,
        'max_amount_sat': None,
        'enabled': False,
        'source_url': source_url,
        'error': error,
        'direction': None,
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

    Returns:
        list[dict]: 각 서비스의 수수료 정보 목록
    """
    fetchers = [
        fetch_boltz_fees,
        fetch_boltz_reverse_fees,
        fetch_coinos_fees,
        fetch_bitflower_fees,
        fetch_bitfreezer_fees,
        fetch_wos_fees,
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

    # 서비스 이름 순 정렬
    results.sort(key=lambda x: x.get('service_name', ''))
    return results
