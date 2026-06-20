from __future__ import annotations

import logging
import time
from threading import Lock
from typing import Literal

from backend.app.db.models import KycConfig
from backend.app.db.session import SessionLocal

KycStatus = Literal['kyc', 'non_kyc', 'mixed']

_CACHE_TTL_SECONDS = 1800

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

# DB에 없는 서비스의 최종 fallback (코드 배포 없이 DB에서 관리 권장)
_STATIC_KYC: dict[str, KycStatus] = {
    'oksusu': 'non_kyc',
    'boltz': 'non_kyc',
    'boltzsubmarine': 'non_kyc',
    'boltzmutual': 'non_kyc',
    'bitfreeze': 'non_kyc',
    'coinos': 'non_kyc',
    'strike': 'kyc',
    'walletofsatoshi': 'non_kyc',
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
    """DB의 kyc_config 테이블에서 KYC 설정을 읽어 반환 (메모리 캐시 30분)."""
    now = time.time()
    with _cache_lock:
        if not force_refresh and now < float(_cache['expires_at']) and _cache['registry']:
            return dict(_cache['registry'])

    try:
        with SessionLocal() as db:
            rows = db.query(KycConfig).all()
        registry = {row.key: {'is_kyc': row.is_kyc} for row in rows}
    except Exception as exc:
        _logger.warning('KYC DB 조회 실패, 빈 레지스트리 반환: %s', exc)
        registry = {}

    with _cache_lock:
        _cache['registry'] = registry
        _cache['expires_at'] = time.time() + _CACHE_TTL_SECONDS
    return registry


def invalidate_kyc_cache() -> None:
    """KYC 캐시를 즉시 만료시킨다 (어드민 수정 후 호출)."""
    with _cache_lock:
        _cache['expires_at'] = 0.0
        _cache['registry'] = {}


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
