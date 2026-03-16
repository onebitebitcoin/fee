from __future__ import annotations

import logging
import time
from threading import Lock
from typing import Literal

import requests

KycStatus = Literal['kyc', 'non_kyc', 'mixed']

PLAYGROUND_SERVICE_NODES_URL = 'https://playground.onebitebitcoin.com/api/service-nodes/admin?username=guest'
_CACHE_TTL_SECONDS = 1800
_REQUEST_TIMEOUT_SECONDS = 5

_logger = logging.getLogger(__name__)
_cache_lock = Lock()
_cache: dict[str, object] = {
    'expires_at': 0.0,
    'registry': {},
}

_SERVICE_ALIASES = {
    'bitflower': 'bitfreeze',
    'walletofsatoshi': 'walletofsatoshi',
    'walletofsats': 'walletofsatoshi',
    'personalwallet': 'personalwallet',
    '개인지갑': 'personalwallet',
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
    with _cache_lock:
        if not force_refresh and _cache['registry'] and now < float(_cache['expires_at']):
            return dict(_cache['registry'])
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
        except Exception as exc:  # pragma: no cover - defensive network fallback
            _logger.warning('Failed to load playground KYC registry: %s', exc)
            if _cache['registry']:
                return dict(_cache['registry'])
            raise
        _cache['registry'] = dict(registry)
        _cache['expires_at'] = now + _CACHE_TTL_SECONDS
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
    resolved_registry = registry if registry is not None else get_kyc_registry()
    entry = resolved_registry.get(_normalize_service(service_name))
    if not entry:
        return None
    return _status_from_bool(bool(entry.get('is_kyc')))



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
