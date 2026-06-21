"""게시판 비밀번호 해시 유틸 (의존성 추가 없이 stdlib만 사용)."""
from __future__ import annotations

import hashlib
import hmac
import secrets

_ALGO = 'sha256'
_ITERATIONS = 120_000


def hash_password(password: str) -> tuple[str, str]:
    """비밀번호를 (hash, salt) 튜플로 반환한다. salt는 레코드별 랜덤."""
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        _ALGO, password.encode('utf-8'), salt.encode('utf-8'), _ITERATIONS
    ).hex()
    return digest, salt


def verify_password(password: str, password_hash: str | None, salt: str | None) -> bool:
    """평문 비밀번호가 저장된 해시와 일치하는지 상수시간 비교로 검증한다."""
    if not password_hash or not salt:
        return False
    digest = hashlib.pbkdf2_hmac(
        _ALGO, password.encode('utf-8'), salt.encode('utf-8'), _ITERATIONS
    ).hex()
    return hmac.compare_digest(digest, password_hash)
