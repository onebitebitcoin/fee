from fastapi import APIRouter, Depends, HTTPException, Header, Query, status
from sqlalchemy.orm import Session

from backend.app.core.config import get_settings
from backend.app.db import repositories
from backend.app.db.session import get_db
from backend.app.services.crawl_service import CrawlService

router = APIRouter()


@router.get('')
def list_runs(limit: int = Query(20, ge=1, le=100), db: Session = Depends(get_db)) -> dict:
    runs = repositories.list_crawl_runs(db, limit=min(max(limit, 1), 100))
    return {
        'items': [
            {
                'id': row.id,
                'trigger': row.trigger,
                'status': row.status,
                'message': row.message,
                'usd_krw_rate': row.usd_krw_rate,
                'started_at': int(row.started_at.timestamp()) if row.started_at else None,
                'completed_at': int(row.completed_at.timestamp()) if row.completed_at else None,
            }
            for row in runs
        ]
    }


@router.post('', status_code=status.HTTP_201_CREATED)
def trigger_crawl(
    x_api_key: str = Header(..., alias='X-API-Key'),
    db: Session = Depends(get_db),
) -> dict:
    settings = get_settings()
    if not settings.manual_crawl_enabled:
        raise HTTPException(status_code=403, detail='Manual crawl is disabled')
    if x_api_key != settings.admin_api_key:
        raise HTTPException(status_code=401, detail='Unauthorized')
    result = CrawlService(db).run_full_crawl(trigger='manual')
    return {
        'id': result.id,
        'trigger': result.trigger,
        'status': result.status,
        'message': result.message,
        'usd_krw_rate': result.usd_krw_rate,
        'started_at': int(result.started_at.timestamp()) if result.started_at else None,
        'completed_at': int(result.completed_at.timestamp()) if result.completed_at else None,
    }
