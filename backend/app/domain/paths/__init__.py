"""buy 경로 빌더 패키지.

각 경로 타입은 독립 모듈로 분리되어 있고, registry가 빌더 실행 순서를 정의한다.
새 경로 타입 추가 = 모듈 1개 작성 + registry 등록 (오케스트레이터 수술 불필요).
"""
from backend.app.domain.paths.base import (
    BuilderContext,
    BuildResult,
)
from backend.app.domain.paths.registry import (
    AGGREGATE_BUILDERS,
    PER_EXCHANGE_BUILDERS,
)

__all__ = [
    'BuilderContext',
    'BuildResult',
    'PER_EXCHANGE_BUILDERS',
    'AGGREGATE_BUILDERS',
]
