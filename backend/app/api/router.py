from fastapi import APIRouter

from backend.app.api.routes import crawl_runs, exchanges, health, market

api_router = APIRouter()
api_router.include_router(health.router, tags=['health'])
api_router.include_router(exchanges.router, prefix='/exchanges', tags=['exchanges'])
api_router.include_router(market.router, prefix='/market', tags=['market'])
api_router.include_router(crawl_runs.router, prefix='/crawl-runs', tags=['crawl-runs'])
