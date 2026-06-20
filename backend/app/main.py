from __future__ import annotations

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from backend.app.api.router import api_router
from backend.app.core.config import get_settings
from backend.app.db.bootstrap import init_db
from backend.app.db.carf_seed import seed_carf_exchanges

logger = logging.getLogger(__name__)


# 과거 이 origin(fee.onebitebitcoin.com / 전신 nav)에 등록됐던 옛 서비스워커(Stack Health 등)를
# 확실히 제거하기 위한 kill-switch 워커. 옛 워커가 갱신 시점에 이 스크립트를 내려받으면,
# 자기 자신을 unregister 하고 모든 캐시를 비운 뒤 열려있는 탭을 새로고침해 현재 앱으로 복구시킨다.
# 현재 fee 앱은 서비스워커를 등록하지 않으므로 일반 사용자에게는 아무 영향이 없다.
_KILL_SWITCH_SW = """// kill-switch service worker — 옛 서비스워커 자동 제거용
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (e) {}
    try { await self.registration.unregister(); } catch (e) {}
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const client of clients) {
      try { client.navigate(client.url); } catch (e) {}
    }
  })());
});
"""

# 옛 워커가 등록됐을 만한 공통 경로들(vite-plugin-pwa, CRA, Angular, Firebase 기본값 등).
_KILL_SWITCH_SW_PATHS = (
    'sw.js',
    'service-worker.js',
    'serviceworker.js',
    'ngsw-worker.js',
    'firebase-messaging-sw.js',
)


def _serve_kill_switch_sw() -> Response:
    return Response(
        content=_KILL_SWITCH_SW,
        media_type='application/javascript',
        headers={'Cache-Control': 'no-store'},
    )


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
                # 크롤 성공 직후 인기 금액 cheapest-all 결과를 선제 캐싱(콜드스타트/만료 미스 제거)
                if result.status in ('success', 'partial_success'):
                    try:
                        from backend.app.api.routes.market import warm_cheapest_path_cache
                        warmed = warm_cheapest_path_cache(db)
                        logger.info('cheapest-all 캐시 워밍 완료: %s개 프리셋', warmed)
                    except Exception as exc:
                        logger.warning('cheapest-all 캐시 워밍 실패: %s', exc)
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
    # cheapest-all 등 대형 JSON 응답(수백 KB)을 gzip 압축 → 전송시간·대역폭 절감,
    # 동시 접속 시 커넥션이 더 빨리 반환된다. 1KB 미만 응답은 압축 생략.
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=False,
        allow_methods=['*'],
        allow_headers=['*'],
    )
    app.include_router(api_router, prefix=settings.api_v1_prefix)

    # 옛 서비스워커 제거용 kill-switch 라우트. 반드시 SPA catch-all 보다 먼저 등록해
    # /sw.js 등이 index.html(HTML) 대신 올바른 JS(application/javascript)로 응답하게 한다.
    for _sw_path in _KILL_SWITCH_SW_PATHS:
        app.add_api_route(f'/{_sw_path}', _serve_kill_switch_sw, methods=['GET'])

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
