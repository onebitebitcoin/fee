from __future__ import annotations

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.app.api.router import api_router
from backend.app.core.config import get_settings
from backend.app.db.bootstrap import init_db

logger = logging.getLogger(__name__)


def _warm_withdrawal_cache() -> None:
    try:
        from fee_checker import refresh_withdrawal_cache
        refresh_withdrawal_cache()
        logger.info('Withdrawal cache warmed up successfully')
    except Exception as exc:
        logger.warning('Withdrawal cache warmup failed: %s', exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    loop = asyncio.get_event_loop()
    loop.run_in_executor(ThreadPoolExecutor(max_workers=1), _warm_withdrawal_cache)
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, lifespan=lifespan)
    app.router.redirect_slashes = False
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=False,
        allow_methods=['*'],
        allow_headers=['*'],
    )
    app.include_router(api_router, prefix=settings.api_v1_prefix)
    dist_dir = settings.frontend_dist_dir
    assets_dir = dist_dir / 'assets'
    if assets_dir.exists():
        app.mount('/assets', StaticFiles(directory=assets_dir), name='assets')

        @app.get('/')
        def serve_index() -> FileResponse:
            return FileResponse(dist_dir / 'index.html')

        @app.get('/{full_path:path}')
        def serve_frontend(full_path: str):
            if full_path.startswith('api/'):
                return {'detail': 'Not Found'}
            target = dist_dir / full_path
            if target.exists() and target.is_file():
                return FileResponse(target)
            return FileResponse(dist_dir / 'index.html')
    return app


app = create_app()
