from __future__ import annotations

import logging
import time
from threading import Lock
from typing import Literal

import requests

KycStatus = Literal['kyc', 'non_kyc', 'mixed']

PLAYGROUND_SERVICE_NODES_URL = 'https://playground.onebitebitcoin.com/api/service-nodes/admin?username=guest'
_CACHE_TTL_SECONDS = 1800
_NEGATIVE_CACHE_TTL_SECONDS = 120
_REQUEST_TIMEOUT_SECONDS = 2

_logger = logging.getLogger(__name__)
_cache_lock = Lock()
_cache: dict[str, object] = {
    'expires_at': 0.0,
    'registry': {},
}

_SERVICE_ALIASES = {
    'bitfreezer': 'bitfreeze',
    'boltz': 'boltz',
    'boltzsubmarine': 'boltz',
    'boltzmutual': 'boltz',
    'walletofsatoshi': 'walletofsatoshi',
    'walletofsats': 'walletofsatoshi',
    'personalwallet': 'personalwallet',
    '개인지갑': 'personalwallet',
}

# playground registry에 등록되지 않은 서비스의 KYC 상태 정적 fallback
_STATIC_KYC: dict[str, KycStatus] = {
    'oksusu': 'non_kyc',
    'boltz': 'non_kyc',
    'boltzsubmarine': 'non_kyc',
    'boltzmutual': 'non_kyc',
    'bitfreeze': 'non_kyc',
    'coinos': 'non_kyc',
    'strike': 'kyc',
    'walletofsatoshi': 'kyc',
}


def _normalize(value: str | None) -> str:
    if not value:
        return ''
    return ''.join(char.lower() for char in str(value) if char.isalnum())


def _normalize_service(value: str | None) -> str:
    normalized = _normalize(value)
    return _SERVICE_ALIASES.get(normalized, normalized)


def _normalize_asset(value: str | None) -> str:
    normalized = _normalize(value)
    if normalized in {'btc', 'bitcoin', 'lightning', 'lightningnetwork', 'onchain'}:
        return 'btc'
    if normalized == 'usdt':
        return 'usdt'
    return normalized


def _status_from_bool(value: bool) -> KycStatus:
    return 'kyc' if value else 'non_kyc'


def get_kyc_registry(force_refresh: bool = False) -> dict[str, dict]:
    now = time.time()
    # (a) 락 안에서: TTL이 유효하면 즉시 반환 (registry가 비어있어도 negative cache 적용)
    with _cache_lock:
        if not force_refresh and now < float(_cache['expires_at']):
            if _cache['registry']:
                return dict(_cache['registry'])
            # negative cache 기간 — 빈 레지스트리 반환.
            # 정적 fallback(_STATIC_KYC)은 resolve_* 단계에서 적용되므로 여기선 빈 dict.
            # (_STATIC_KYC는 {service: status} 타입이라 registry({key: {is_kyc}}) 자리에 넣으면 안 됨)
            return {}

    # (b) 락 밖에서: 네트워크 호출 수행 (두 스레드가 동시에 여기 도달해도 각자 호출하되 직렬화는 없음)
    fetch_exc: Exception | None = None
    registry: dict[str, dict] = {}
    try:
        response = requests.get(
            PLAYGROUND_SERVICE_NODES_URL,
            headers={'Accept': 'application/json'},
            timeout=_REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        payload = response.json()
        for node in payload.get('nodes', []):
            service_key = _normalize_service(node.get('service') or node.get('display_name'))
            if not service_key:
                continue
            registry[service_key] = {
                'display_name': node.get('display_name'),
                'is_kyc': bool(node.get('is_kyc')),
                'is_custodial': bool(node.get('is_custodial')),
            }
    except Exception as exc:
        fetch_exc = exc

    # (c) 락 안에서: 결과 저장
    with _cache_lock:
        if fetch_exc is not None:
            _logger.warning('Failed to load playground KYC registry: %s', fetch_exc)
            # 이전 캐시가 있으면 그대로 쓰되 TTL을 negative로 짧게 갱신
            existing = dict(_cache['registry']) if _cache['registry'] else None
            _cache['expires_at'] = time.time() + _NEGATIVE_CACHE_TTL_SECONDS
            if existing:
                return existing
            # 캐시도 없음 → 빈 레지스트리 반환(short TTL). 정적 fallback은 resolve_* 단계에서 적용.
            return {}
        _cache['registry'] = dict(registry)
        _cache['expires_at'] = time.time() + _CACHE_TTL_SECONDS
        return dict(_cache['registry'])



def infer_kyc_status_from_note(note: str | None) -> KycStatus | None:
    normalized = (note or '').strip().lower()
    if not normalized:
        return None

    negative_markers = ['non-kyc', 'non kyc', 'no kyc', '미인증', '무인증', '인증 불필요', 'kyc 불필요']
    positive_markers = ['kyc required', 'kyc 필요', '인증 필요']

    if any(marker in normalized for marker in negative_markers):
        return 'non_kyc'
    if any(marker in normalized for marker in positive_markers):
        return 'kyc'
    return None



def resolve_service_kyc_status(service_name: str | None, registry: dict[str, dict] | None = None) -> KycStatus | None:
    if not service_name:
        return None
    normalized = _normalize_service(service_name)
    resolved_registry = registry if registry is not None else get_kyc_registry()
    entry = resolved_registry.get(normalized)
    if entry:
        return _status_from_bool(bool(entry.get('is_kyc')))
    return _STATIC_KYC.get(normalized)



def resolve_exchange_asset_kyc_status(
    exchange: str | None,
    asset: str | None,
    note: str | None = None,
    registry: dict[str, dict] | None = None,
) -> KycStatus | None:
    resolved_registry = registry if registry is not None else get_kyc_registry()
    service_key = _normalize_service(exchange)
    asset_key = _normalize_asset(asset)
    if service_key and asset_key:
        entry = resolved_registry.get(f'{service_key}_{asset_key}') or resolved_registry.get(f'{service_key}{asset_key}')
        if entry:
            return _status_from_bool(bool(entry.get('is_kyc')))
    return infer_kyc_status_from_note(note)



def aggregate_kyc_status(statuses: list[KycStatus | None]) -> KycStatus | None:
    unique = {status for status in statuses if status}
    if not unique:
        return None
    if len(unique) == 1:
        return next(iter(unique))
    return 'mixed'
