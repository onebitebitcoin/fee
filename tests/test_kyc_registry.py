"""kyc_registry 동시성·negative cache 동작 테스트."""
from __future__ import annotations

import time
from unittest.mock import MagicMock

import backend.app.services.kyc_registry as kyc_mod


def _reset_cache():
    """테스트 격리: 캐시를 초기 상태로 리셋."""
    kyc_mod._cache['registry'] = {}
    kyc_mod._cache['expires_at'] = 0.0


# ── fetch 실패 시 static fallback 반환 ───────────────────────────────────────

def test_get_kyc_registry_returns_empty_registry_on_fetch_failure(monkeypatch):
    """외부 fetch 실패 + 캐시 없음 → 빈 레지스트리({}) 반환.

    registry 타입은 {key: {is_kyc: ...}} 이므로 실패 시 빈 dict여야 한다.
    정적 fallback(_STATIC_KYC)은 registry 자리에 넣지 않고 resolve_* 단계에서 적용한다.
    """
    _reset_cache()
    monkeypatch.setattr(
        'backend.app.services.kyc_registry.requests.get',
        MagicMock(side_effect=ConnectionError('unreachable')),
    )
    result = kyc_mod.get_kyc_registry()
    assert result == {}


def test_static_fallback_applies_without_error_during_fetch_failure(monkeypatch):
    """fetch 실패(빈 registry) 상태에서도 resolve_service_kyc_status가
    예외 없이 정적 fallback을 적용해야 한다 (oksusu → non_kyc)."""
    _reset_cache()
    monkeypatch.setattr(
        'backend.app.services.kyc_registry.requests.get',
        MagicMock(side_effect=ConnectionError('unreachable')),
    )
    # registry 자리에 status 문자열이 들어가면 entry.get('is_kyc')에서 AttributeError가 났었음.
    assert kyc_mod.resolve_service_kyc_status('oksusu') == 'non_kyc'


def test_get_kyc_registry_uses_stale_cache_on_fetch_failure(monkeypatch):
    """외부 fetch 실패 + 기존 캐시 있음 → 기존 캐시 반환."""
    _reset_cache()
    kyc_mod._cache['registry'] = {'someservice': {'is_kyc': False}}
    kyc_mod._cache['expires_at'] = time.time() - 1  # 만료됨

    monkeypatch.setattr(
        'backend.app.services.kyc_registry.requests.get',
        MagicMock(side_effect=ConnectionError('unreachable')),
    )
    result = kyc_mod.get_kyc_registry()
    assert result == {'someservice': {'is_kyc': False}}


# ── negative cache: 실패 후 두 번째 호출은 네트워크 재시도 안 함 ──────────────

def test_get_kyc_registry_negative_cache_prevents_immediate_retry(monkeypatch):
    """fetch 실패 후 negative TTL 내 두 번째 호출은 requests.get을 다시 호출하지 않는다."""
    _reset_cache()
    mock_get = MagicMock(side_effect=ConnectionError('unreachable'))
    monkeypatch.setattr('backend.app.services.kyc_registry.requests.get', mock_get)

    kyc_mod.get_kyc_registry()   # 첫 번째 호출 — 실패, negative TTL 설정
    kyc_mod.get_kyc_registry()   # 두 번째 호출 — TTL 내라서 캐시 사용

    # requests.get은 정확히 1번만 호출되어야 한다
    assert mock_get.call_count == 1


# ── 락이 네트워크 호출 중 유지되지 않음 ─────────────────────────────────────

def test_get_kyc_registry_does_not_hold_lock_during_fetch(monkeypatch):
    """requests.get 호출 도중 _cache_lock이 해제되어 있어야 한다."""
    _reset_cache()
    lock_held_during_fetch = []

    def mock_get(*args, **kwargs):
        # 이 시점에 락이 잠겨 있으면 acquire 시도 시 False를 반환
        acquired = kyc_mod._cache_lock.acquire(blocking=False)
        lock_held_during_fetch.append(not acquired)
        if acquired:
            kyc_mod._cache_lock.release()
        raise ConnectionError('unreachable')

    monkeypatch.setattr('backend.app.services.kyc_registry.requests.get', mock_get)

    kyc_mod.get_kyc_registry()

    # fetch 도중 락이 잠겨 있지 않았어야 함
    assert lock_held_during_fetch == [False]
