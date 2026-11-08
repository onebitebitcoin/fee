"""비트코인 주요 이슈 순위 — my-news 가 내보낸 파일을 그대로 전달한다."""
from fastapi import APIRouter, HTTPException

from backend.app.core.config import get_settings
from backend.app.services.news_keywords import KeywordsUnavailable, load_keywords

router = APIRouter()


@router.get('/keywords')
def get_news_keywords() -> dict:
    try:
        return load_keywords(get_settings().mynews_keywords_path)
    except KeywordsUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
