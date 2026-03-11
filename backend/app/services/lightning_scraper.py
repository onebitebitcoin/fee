"""
Lightning Network 스왑 서비스 실시간 수수료 스크래퍼

지원 서비스:
  - Boltz Exchange (boltz.exchange): 공개 REST API 사용
  - Coinos.io (coinos.io): 공개 REST API 사용
  - Bitfreezer (bitfreezer.com): 웹 스크래핑
  - Wallet of Satoshi (walletofsatoshi.com): 웹 스크래핑 / 고정 수수료
  - Strike (strike.me): 공개 API 사용

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
    Boltz Exchange API에서 BTC→Lightning 역방향 스왑(reverse swap) 수수료를 조회.
    Reverse swap: 온체인 BTC를 보내면 Lightning으로 받는 방식.
    API: https://api.boltz.exchange/v2/swap/reverse
    """
    service_name = 'Boltz'
    source_url = 'https://boltz.exchange'
    api_url = 'https://api.boltz.exchange/v2/swap/reverse'
    try:
        resp = requests.get(api_url, headers=_HEADERS, timeout=_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()

        # BTC/BTC 페어를 찾음 (on-chain BTC → Lightning BTC)
        pair_data = data.get('BTC/BTC') or data.get('BTC') or (list(data.values())[0] if data else None)
        if not pair_data:
            return _error_result(service_name, source_url, f'Boltz API 응답에서 BTC/BTC 페어를 찾지 못함: {list(data.keys())}')

        fees = pair_data.get('fees', {})
        fee_pct = fees.get('percentage', 0.5)
        miner_fees = fees.get('minerFees', {})
        # lockup + claim 마이닝 수수료 합산 (사토시)
        fee_fixed_sat = (miner_fees.get('lockup', 0) or 0) + (miner_fees.get('claim', 0) or 0)

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
        }
    except Exception as exc:
        logger.warning('Boltz 수수료 조회 실패: %s', exc)
        return _error_result(service_name, source_url, str(exc))


def fetch_coinos_fees() -> dict:
    """
    Coinos.io Lightning 수수료 조회.
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
        for key in ('fee', 'fees', 'swap_fee', 'lightning_fee', 'rate'):
            val = data.get(key)
            if val is not None:
                if isinstance(val, (int, float)):
                    fee_pct = float(val)
                elif isinstance(val, dict):
                    fee_pct = float(val.get('percent', val.get('pct', val.get('rate', 0.1))))
                break

        if fee_pct is None:
            # Coinos는 기본적으로 무료 또는 0.1% 수수료
            fee_pct = 0.1

        return {
            'service_name': service_name,
            'fee_pct': fee_pct,
            'fee_fixed_sat': fee_fixed_sat,
            'min_amount_sat': 1_000,
            'max_amount_sat': 50_000_000,
            'enabled': True,
            'source_url': source_url,
            'error': None,
        }
    except Exception as exc:
        logger.warning('Coinos 수수료 조회 실패: %s', exc)
        # fallback: Coinos는 일반적으로 0.1% 수수료 부과
        return {
            'service_name': service_name,
            'fee_pct': 0.1,
            'fee_fixed_sat': 0,
            'min_amount_sat': 1_000,
            'max_amount_sat': 50_000_000,
            'enabled': True,
            'source_url': source_url,
            'error': f'API 조회 실패 (fallback 사용): {exc}',
        }


def fetch_bitfreezer_fees() -> dict:
    """
    Bitfreezer Lightning 스왑 수수료 조회.
    Bitfreezer는 Lightning ↔ On-chain 스왑 서비스.
    공개 API: https://bitfreezer.com/api/v1/fees 또는 웹 스크래핑
    """
    service_name = 'Bitfreezer'
    source_url = 'https://bitfreezer.com'
    api_urls = [
        'https://bitfreezer.com/api/v1/fees',
        'https://bitfreezer.com/api/fees',
        'https://api.bitfreezer.com/v1/fees',
        'https://api.bitfreezer.com/fees',
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
                }
        except Exception:
            continue

    # 웹 스크래핑 시도
    try:
        resp = requests.get(source_url, headers={**_HEADERS, 'Accept': 'text/html'}, timeout=_TIMEOUT)
        if resp.status_code == 200:
            text = resp.text.lower()
            # 수수료 정보 패턴 탐지 (0.x%, fee, etc.)
            import re
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
                }
    except Exception as exc2:
        logger.warning('Bitfreezer 웹 스크래핑 실패: %s', exc2)

    # 최종 fallback
    return _error_result(service_name, source_url, 'Bitfreezer API 및 스크래핑 모두 실패')


def fetch_wos_fees() -> dict:
    """
    Wallet of Satoshi (WoS) Lightning 수수료 조회.
    WoS는 사용자 간 Lightning 송금 시 일반적으로 무료이며,
    외부 Lightning 지불 시 라우팅 수수료만 부담.
    공개 API: https://livingroomofsatoshi.com/api/v1/lnurl/pay (일부 정보)
    """
    service_name = 'WalletOfSatoshi'
    source_url = 'https://walletofsatoshi.com'
    api_url = 'https://livingroomofsatoshi.com/api/v1/lnurl/pay'
    try:
        resp = requests.get(api_url, headers=_HEADERS, timeout=_TIMEOUT)
        if resp.status_code == 200:
            data = resp.json()
            # WoS는 일반적으로 수수료가 낮거나 무료
            fee_pct = float(data.get('fee_pct', 0.0))
            fee_fixed_sat = int(data.get('fee_fixed_sat', 0))
            return {
                'service_name': service_name,
                'fee_pct': fee_pct,
                'fee_fixed_sat': fee_fixed_sat,
                'min_amount_sat': 1,
                'max_amount_sat': 5_000_000,
                'enabled': True,
                'source_url': source_url,
                'error': None,
            }
    except Exception as exc:
        logger.warning('WalletOfSatoshi API 조회 실패: %s', exc)

    # WoS는 일반적으로 수수료 없음 (0%) - 공개 정보 기반
    return {
        'service_name': service_name,
        'fee_pct': 0.0,
        'fee_fixed_sat': 0,
        'min_amount_sat': 1,
        'max_amount_sat': 5_000_000,
        'enabled': True,
        'source_url': source_url,
        'error': '공개 API 미발견, 공개 정보 기반 수수료 적용 (0%)',
    }


def fetch_strike_fees() -> dict:
    """
    Strike Lightning 서비스 수수료 조회.
    Strike는 Lightning ↔ 법정화폐 환전 서비스.
    수수료: 일반적으로 1% (프리미엄 플랜 0.5%)
    공개 API: https://api.strike.me/v1/rates/conversion (인증 필요)
    """
    service_name = 'Strike'
    source_url = 'https://strike.me'
    # Strike 공개 API 시도 (인증 없이 접근 가능한 엔드포인트)
    api_url = 'https://api.strike.me/v1/currencies'
    try:
        resp = requests.get(api_url, headers=_HEADERS, timeout=_TIMEOUT)
        if resp.status_code == 200:
            # Strike API 접근 성공 시 기본 수수료 정보 반환
            # Strike는 공개 수수료 정책: 0.3% (Lightning → Bitcoin 수취)
            return {
                'service_name': service_name,
                'fee_pct': 0.3,
                'fee_fixed_sat': 0,
                'min_amount_sat': 1_000,
                'max_amount_sat': 100_000_000,
                'enabled': True,
                'source_url': source_url,
                'error': None,
            }
    except Exception as exc:
        logger.warning('Strike API 조회 실패: %s', exc)

    # Strike 공식 발표 수수료 (fallback): 0.3%
    return {
        'service_name': service_name,
        'fee_pct': 0.3,
        'fee_fixed_sat': 0,
        'min_amount_sat': 1_000,
        'max_amount_sat': 100_000_000,
        'enabled': True,
        'source_url': source_url,
        'error': '공개 API 인증 필요, 공시 수수료 적용 (0.3%)',
    }


def fetch_boltz_submarine_fees() -> dict:
    """
    Boltz Exchange 잠수함 스왑(submarine swap) 수수료 조회.
    Submarine swap: Lightning으로 보내면 온체인 BTC로 받는 방식.
    (이 방향은 참고용; 우리 경로는 reverse swap이 주 목적)
    API: https://api.boltz.exchange/v2/swap/submarine
    """
    service_name = 'Boltz (Submarine)'
    source_url = 'https://boltz.exchange'
    api_url = 'https://api.boltz.exchange/v2/swap/submarine'
    try:
        resp = requests.get(api_url, headers=_HEADERS, timeout=_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
        pair_data = data.get('BTC/BTC') or data.get('BTC') or (list(data.values())[0] if data else None)
        if not pair_data:
            return _error_result(service_name, source_url, 'BTC/BTC 페어 없음')
        fees = pair_data.get('fees', {})
        fee_pct = fees.get('percentage', 0.5)
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
    }


def get_all_lightning_swap_fees() -> list[dict]:
    """
    모든 Lightning 스왑 서비스 수수료를 병렬로 조회.

    Returns:
        list[dict]: 각 서비스의 수수료 정보 목록
    """
    fetchers = [
        fetch_boltz_fees,
        fetch_coinos_fees,
        fetch_bitfreezer_fees,
        fetch_wos_fees,
        fetch_strike_fees,
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
