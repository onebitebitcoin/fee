from __future__ import annotations

import os

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.app.db import repositories
from backend.app.db.session import get_db
from backend.app.domain.market_core import list_exchanges

router = APIRouter()


@router.get('')
def get_exchanges() -> dict:
    return list_exchanges()


@router.get('/caution')
def get_caution(db: Session = Depends(get_db)) -> dict:
    rows = repositories.get_all_caution_info(db)
    return {r.exchange_id: {'caution': r.caution, 'reason': r.caution_reason} for r in rows}


class CautionBody(BaseModel):
    group: str
    caution: bool
    reason: str | None = None


@router.patch('/caution/{exchange_id}')
def update_caution(
    exchange_id: str,
    body: CautionBody,
    db: Session = Depends(get_db),
    x_api_key: str | None = Header(None, alias='X-API-Key'),
) -> dict:
    admin_key = os.environ.get('ADMIN_API_KEY', 'dev-secret-key')
    if x_api_key != admin_key:
        raise HTTPException(status_code=403, detail='Forbidden')
    row = repositories.upsert_caution_info(db, exchange_id, body.group, body.caution, body.reason)
    return {'exchange_id': row.exchange_id, 'caution': row.caution, 'reason': row.caution_reason}
