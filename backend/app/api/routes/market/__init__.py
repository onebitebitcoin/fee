"""market 라우터 패키지 — 도메인별 서브라우터 통합 + 외부 호환 심볼 re-export.

기존 단일 `market.py`를 도메인별로 분할했다. router.py는 `market.router`를,
main.py/crawl_service/테스트는 아래 re-export 심볼을 기존 import 경로 그대로 사용한다.
"""
from fastapi import APIRouter

# kyc_registry 모듈을 패키지 네임스페이스에 노출 (테스트가 market.kyc_registry.* 를 monkeypatch).
from backend.app.services import kyc_registry  # noqa: F401

from backend.app.api.routes.market import kimp, path_finder, status, tickers
from backend.app.api.routes.market._shared import (  # noqa: F401
    _cheapest_path_cache,
    _status_cache,
    invalidate_status_cache,
)
from backend.app.api.routes.market.kimp import (  # noqa: F401
    _fetch_kimp_data,
    kimp_poll_loop,
)
from backend.app.api.routes.market.path_finder import (  # noqa: F401
    WARM_AMOUNT_PRESETS_KRW,
    warm_cheapest_path_cache,
)

router = APIRouter()
router.include_router(tickers.router)
router.include_router(path_finder.router)
router.include_router(status.router)
router.include_router(kimp.router)

__all__ = [
    'router',
    'invalidate_status_cache',
    'warm_cheapest_path_cache',
    'WARM_AMOUNT_PRESETS_KRW',
    'kimp_poll_loop',
    'kyc_registry',
    '_cheapest_path_cache',
    '_status_cache',
    '_fetch_kimp_data',
]
