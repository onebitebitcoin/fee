from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.app.db import repositories
from backend.app.db.session import get_db

router = APIRouter()


@router.get('/access-count')
def get_access_count(db: Session = Depends(get_db)) -> dict:
    return repositories.get_access_count(db)
