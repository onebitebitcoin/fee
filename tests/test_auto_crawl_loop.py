"""예약 크롤링이 이벤트 루프를 막지 않는지 검증한다.

run_full_crawl 은 약 80초 걸리는 동기 작업이다. 이벤트 루프 위에서 직접 돌리면
그동안 uvicorn 이 어떤 요청도 받지 못해 서비스 전체가 멈춘다.
"""

import asyncio
import threading
from contextlib import contextmanager
from types import SimpleNamespace

import backend.app.api.routes.market as market_routes
import backend.app.db.session as session_module
import backend.app.services.crawl_service as crawl_module
from backend.app import main


def _install_blocking_crawl(monkeypatch, release: threading.Event, state: dict) -> None:
    class _BlockingCrawlService:
        def __init__(self, db):
            pass

        def run_full_crawl(self, trigger: str = 'manual'):
            state['started'] = True
            release.wait(timeout=2)
            state['finished'] = True
            return SimpleNamespace(id=1, status='success')

    @contextmanager
    def _fake_session():
        yield object()

    monkeypatch.setattr(crawl_module, 'CrawlService', _BlockingCrawlService)
    monkeypatch.setattr(session_module, 'SessionLocal', _fake_session)
    monkeypatch.setattr(market_routes, 'warm_cheapest_path_cache', lambda db: 0)


def test_scheduled_crawl_does_not_block_event_loop(monkeypatch):
    # Arrange
    release = threading.Event()
    state = {'started': False, 'finished': False}
    _install_blocking_crawl(monkeypatch, release, state)

    async def scenario() -> bool:
        task = asyncio.create_task(main._auto_crawl_loop())
        try:
            # Act: 크롤링이 시작될 때까지 루프에 제어권을 넘긴다
            for _ in range(200):
                await asyncio.sleep(0.01)
                if state['started']:
                    break
            # 루프가 막혀 있었다면 여기 도달했을 때 이미 크롤링이 끝나 있다
            responsive_during_crawl = state['started'] and not state['finished']
            release.set()
            for _ in range(200):
                await asyncio.sleep(0.01)
                if state['finished']:
                    break
            return responsive_during_crawl
        finally:
            release.set()
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    # Assert
    assert asyncio.run(scenario()) is True
    assert state['finished'] is True
