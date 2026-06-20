"""kyc_registry DB 기반 동작 테스트."""
from __future__ import annotations

import time
from unittest.mock import MagicMock, patch

import backend.app.services.kyc_registry as kyc_mod


def _reset_cache():
    kyc_mod._cache['registry'] = {}
    kyc_mod._cache['expires_at'] = 0.0


# ── DB 조회 성공 ─────────────────────────────────────────────────────────────

def test_get_kyc_registry_reads_from_db(monkeypatch):
    """DB에서 KYC 설정을 정상적으로 읽어 반환한다."""
    _reset_cache()
    mock_row_strike = MagicMock()
    mock_row_strike.key = 'strike'
    mock_row_strike.is_kyc = True
    mock_row_boltz = MagicMock()
    mock_row_boltz.key = 'boltz'
    mock_row_boltz.is_kyc = False

    mock_db = MagicMock()
    mock_db.query.return_value.all.return_value = [mock_row_strike, mock_row_boltz]
    mock_db.__enter__ = MagicMock(return_value=mock_db)
    mock_db.__exit__ = MagicMock(return_value=False)

    with patch('backend.app.services.kyc_registry.SessionLocal', return_value=mock_db):
        result = kyc_mod.get_kyc_registry()

    assert result == {'strike': {'is_kyc': True}, 'boltz': {'is_kyc': False}}


def test_get_kyc_registry_returns_empty_on_db_failure(monkeypatch):
    """DB 조회 실패 시 빈 레지스트리 반환. 정적 fallback은 resolve_* 단계에서 적용."""
    _reset_cache()
    with patch('backend.app.services.kyc_registry.SessionLocal', side_effect=Exception('DB error')):
        result = kyc_mod.get_kyc_registry(force_refresh=True)
    assert result == {}


def test_static_fallback_applies_on_db_failure():
    """DB 실패 시에도 resolve_service_kyc_status가 _STATIC_KYC fallback을 반환한다."""
    _reset_cache()
    with patch('backend.app.services.kyc_registry.SessionLocal', side_effect=Exception('DB error')):
        assert kyc_mod.resolve_service_kyc_status('oksusu') == 'non_kyc'
        assert kyc_mod.resolve_service_kyc_status('strike') == 'kyc'


# ── 캐시 동작 ────────────────────────────────────────────────────────────────

def test_get_kyc_registry_uses_cache(monkeypatch):
    """TTL 내 두 번째 호출은 DB를 재조회하지 않는다."""
    _reset_cache()
    kyc_mod._cache['registry'] = {'boltz': {'is_kyc': False}}
    kyc_mod._cache['expires_at'] = time.time() + 1000

    mock_session = MagicMock()
    with patch('backend.app.services.kyc_registry.SessionLocal', mock_session):  # noqa: SIM117
        result = kyc_mod.get_kyc_registry()

    mock_session.assert_not_called()
    assert result == {'boltz': {'is_kyc': False}}


def test_invalidate_kyc_cache():
    """invalidate_kyc_cache 호출 시 캐시가 즉시 만료된다."""
    kyc_mod._cache['registry'] = {'strike': {'is_kyc': True}}
    kyc_mod._cache['expires_at'] = time.time() + 1000

    kyc_mod.invalidate_kyc_cache()

    assert kyc_mod._cache['registry'] == {}
    assert float(kyc_mod._cache['expires_at']) == 0.0
