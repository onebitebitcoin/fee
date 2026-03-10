from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.app.core.config import get_settings
from backend.app.db import repositories
from backend.app.db.session import get_db
from backend.app.services.crawl_service import CrawlService

router = APIRouter()


@router.get('')
def list_runs(limit: int = 20, db: Session = Depends(get_db)) -> dict:
    runs = repositories.list_crawl_runs(db, limit=min(max(limit, 1), 100))
    return {
        'items': [
            {
                'id': row.id,
                'trigger': row.trigger,
                'status': row.status,
                'message': row.message,
                'usd_krw_rate': row.usd_krw_rate,
                'started_at': row.started_at.isoformat() if row.started_at else None,
                'completed_at': row.completed_at.isoformat() if row.completed_at else None,
            }
            for row in runs
        ]
    }


@router.post('', status_code=status.HTTP_201_CREATED)
def trigger_crawl(db: Session = Depends(get_db)) -> dict:
    settings = get_settings()
    if not settings.manual_crawl_enabled:
        raise HTTPException(status_code=403, detail='Manual crawl is disabled')
    result = CrawlService(db).run_full_crawl(trigger='manual')
    return {
        'id': result.id,
        'trigger': result.trigger,
        'status': result.status,
        'message': result.message,
        'usd_krw_rate': result.usd_krw_rate,
        'started_at': result.started_at.isoformat() if result.started_at else None,
        'completed_at': result.completed_at.isoformat() if result.completed_at else None,
    }
