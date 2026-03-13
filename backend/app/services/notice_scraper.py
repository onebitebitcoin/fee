"""
거래소 공지사항 스크래퍼

각 함수 반환 형식:
  list[dict] where each dict has:
    - exchange: str
    - title: str
    - url: str | None
    - published_at: datetime | None
"""
from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

import requests

logger = logging.getLogger(__name__)

_TIMEOUT = 12
_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
}
_MAX_NOTICES = 5


def _parse_iso(s: str | None) -> datetime | None:
    """ISO 8601 문자열을 UTC datetime으로 파싱"""
    if not s:
        return None
    try:
        return datetime.fromisoformat(s).astimezone(timezone.utc).replace(tzinfo=None)
    except Exception:
        return None


def _parse_epoch(ts: int | None) -> datetime | None:
    """Unix 타임스탬프(초)를 UTC datetime으로 파싱"""
    if not ts:
        return None
    try:
        return datetime.fromtimestamp(ts, tz=timezone.utc).replace(tzinfo=None)
    except Exception:
        return None


def _parse_date_str(s: str | None) -> datetime | None:
    """YYYY.MM.DD 형식 날짜 문자열 파싱"""
    if not s:
        return None
    try:
        return datetime.strptime(s.strip(), '%Y.%m.%d')
    except Exception:
        return None


def fetch_upbit_notices() -> list[dict]:
    """Upbit 공지사항 API 스크래핑 (api-manager.upbit.com)"""
    exchange = 'upbit'
    url = f'https://api-manager.upbit.com/api/v1/announcements?os=web&page=1&per_page={_MAX_NOTICES}&category=all'
    headers = {**_HEADERS, 'Referer': 'https://upbit.com/'}
    try:
        resp = requests.get(url, headers=headers, timeout=_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
        if not data.get('success'):
            return []
        notices = data.get('data', {}).get('notices', [])
        results = []
        for item in notices[:_MAX_NOTICES]:
            title = item.get('title', '').strip()
            notice_id = item.get('id')
            if not title or not notice_id:
                continue
            results.append({
                'exchange': exchange,
                'title': title,
                'url': f'https://upbit.com/service_center/notice/{notice_id}',
                'published_at': _parse_iso(item.get('listed_at')),
            })
        return results
    except Exception as e:
        logger.warning('Upbit notice scrape failed: %s', e)
        return []


def fetch_bithumb_notices() -> list[dict]:
    """Bithumb 공지사항 스크래핑 (feed.bithumb.com - SSR 페이지, Scrapling Fetcher 사용)"""
    exchange = 'bithumb'
    try:
        from scrapling.fetchers import Fetcher
        f = Fetcher()
        page = f.get('https://feed.bithumb.com/notice')
        results = []
        for a in page.css('a[href*="/notice/"]')[:_MAX_NOTICES]:
            href = a.attrib.get('href', '')
            # 제목: link-title 클래스 스팬
            title_spans = a.css('span[class*="link-title"]')
            title = title_spans[0].text.strip() if title_spans else ''
            # 날짜: link-date 클래스 스팬
            date_spans = a.css('span[class*="link-date"]')
            date_str = date_spans[0].text.strip() if date_spans else None

            if not title or len(title) < 3:
                continue
            full_url = f'https://feed.bithumb.com{href}' if href.startswith('/') else href
            results.append({
                'exchange': exchange,
                'title': title,
                'url': full_url,
                'published_at': _parse_date_str(date_str),
            })
        return results
    except ImportError:
        logger.debug('Scrapling not installed, skipping Bithumb notices')
        return []
    except Exception as e:
        logger.warning('Bithumb notice scrape failed: %s', e)
        return []


def fetch_coinone_notices() -> list[dict]:
    """Coinone 공지사항 API 스크래핑 (api-gateway.coinone.co.kr)"""
    exchange = 'coinone'
    url = f'https://api-gateway.coinone.co.kr/notice/v1/announcements/posts?includePin=false&page=0&pageSize={_MAX_NOTICES}'
    headers = {**_HEADERS, 'Referer': 'https://coinone.co.kr/'}
    try:
        resp = requests.get(url, headers=headers, timeout=_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
        body = data.get('body', {})
        notices = body.get('notices', [])
        results = []
        for item in notices[:_MAX_NOTICES]:
            title = item.get('title', '').strip()
            notice_id = item.get('id')
            if not title or not notice_id:
                continue
            results.append({
                'exchange': exchange,
                'title': title,
                'url': f'https://coinone.co.kr/info/notice/{notice_id}',
                'published_at': _parse_epoch(item.get('createdAt')),
            })
        return results
    except Exception as e:
        logger.warning('Coinone notice scrape failed: %s', e)
        return []


def fetch_korbit_notices() -> list[dict]:
    """Korbit 공지사항 스크래핑 (현재 모든 접근 방법이 홈으로 리다이렉트됨)"""
    # Korbit의 /announce 페이지는 headless browser 접근 시 홈으로 리다이렉트되어
    # 현재 스크래핑이 불가능합니다.
    logger.debug('Korbit notice scraping skipped (page redirects to homepage)')
    return []


def get_all_notices() -> list[dict]:
    """모든 거래소 공지사항을 병렬로 스크래핑"""
    scrapers = [
        fetch_upbit_notices,
        fetch_bithumb_notices,
        fetch_coinone_notices,
        fetch_korbit_notices,
    ]

    all_notices: list[dict] = []
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {executor.submit(fn): fn.__name__ for fn in scrapers}
        for future in as_completed(futures):
            try:
                results = future.result()
                all_notices.extend(results)
            except Exception as e:
                logger.warning('Notice scraper %s failed: %s', futures[future], e)

    return all_notices
