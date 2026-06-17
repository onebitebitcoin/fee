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
from backend.app.db.carf_seed import seed_carf_exchanges

logger = logging.getLogger(__name__)


def _warm_withdrawal_cache() -> None:
    try:
        from backend.app.domain.market_core import refresh_withdrawal_cache
        refresh_withdrawal_cache()
        logger.info('Withdrawal cache warmed up successfully')
    except Exception as exc:
        logger.warning('Withdrawal cache warmup failed: %s', exc)


async def _auto_crawl_loop() -> None:
    """서버 시작 직후 즉시 크롤링 후, 설정된 주기(crawl_interval_minutes)마다 반복한다."""
    from backend.app.db.session import SessionLocal
    from backend.app.services.crawl_service import CrawlService

    settings = get_settings()
    interval_seconds = settings.crawl_interval_minutes * 60

    while True:
        try:
            with SessionLocal() as db:
                result = CrawlService(db).run_full_crawl(trigger='scheduled')
                logger.info('Scheduled crawl completed: id=%s status=%s', result.id, result.status)
        except Exception as exc:
            logger.warning('Scheduled crawl failed: %s', exc)
        await asyncio.sleep(interval_seconds)


@asynccontextmanager
async def lifespan(app: FastAPI):
    from backend.app.api.routes.market import kimp_poll_loop
    init_db()
    seed_carf_exchanges()
    loop = asyncio.get_event_loop()
    executor = ThreadPoolExecutor(max_workers=1)
    loop.run_in_executor(executor, _warm_withdrawal_cache)
    crawl_task = asyncio.create_task(_auto_crawl_loop())
    kimp_task = asyncio.create_task(kimp_poll_loop(interval=10))
    yield
    crawl_task.cancel()
    kimp_task.cancel()
    executor.shutdown(wait=False)


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
