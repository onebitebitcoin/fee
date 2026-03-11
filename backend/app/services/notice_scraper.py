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

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

_TIMEOUT = 10
_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
}
_MAX_NOTICES = 5


def fetch_upbit_notices() -> list[dict]:
    """Upbit 공지사항 스크래핑"""
    exchange = 'upbit'
    url = 'https://upbit.com/service_center/notice'
    try:
        resp = requests.get(url, headers=_HEADERS, timeout=_TIMEOUT)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, 'html.parser')
        results = []
        items = soup.select('a[href*="/service_center/notice/"]')
        if not items:
            items = soup.select('.list_area li a, .notice_list li a, article li a')
        for item in items[:_MAX_NOTICES]:
            title = item.get_text(strip=True)
            href = item.get('href', '')
            if not title or len(title) < 3:
                continue
            full_url = f'https://upbit.com{href}' if href.startswith('/') else href
            results.append({'exchange': exchange, 'title': title, 'url': full_url, 'published_at': None})
        return results
    except Exception as e:
        logger.warning('Upbit notice scrape failed: %s', e)
        return []


def fetch_bithumb_notices() -> list[dict]:
    """Bithumb 공지사항 스크래핑"""
    exchange = 'bithumb'
    url = 'https://www.bithumb.com/react/notice/list'
    try:
        resp = requests.get(url, headers=_HEADERS, timeout=_TIMEOUT)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, 'html.parser')
        results = []
        items = soup.select('a[href*="/react/notice/"], a[href*="/notice/"]')
        if not items:
            items = soup.select('.board_list tr td.subject a, .list a, li a')
        for item in items[:_MAX_NOTICES]:
            title = item.get_text(strip=True)
            href = item.get('href', '')
            if not title or len(title) < 3:
                continue
            full_url = f'https://www.bithumb.com{href}' if href.startswith('/') else href
            results.append({'exchange': exchange, 'title': title, 'url': full_url, 'published_at': None})
        return results
    except Exception as e:
        logger.warning('Bithumb notice scrape failed: %s', e)
        return []


def fetch_coinone_notices() -> list[dict]:
    """Coinone 공지사항 스크래핑"""
    exchange = 'coinone'
    url = 'https://coinone.co.kr/notice'
    try:
        resp = requests.get(url, headers=_HEADERS, timeout=_TIMEOUT)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, 'html.parser')
        results = []
        items = soup.select('a[href*="/notice/"]')
        if not items:
            items = soup.select('.notice-list li a, .board-list li a, li a')
        for item in items[:_MAX_NOTICES]:
            title = item.get_text(strip=True)
            href = item.get('href', '')
            if not title or len(title) < 3:
                continue
            full_url = f'https://coinone.co.kr{href}' if href.startswith('/') else href
            results.append({'exchange': exchange, 'title': title, 'url': full_url, 'published_at': None})
        return results
    except Exception as e:
        logger.warning('Coinone notice scrape failed: %s', e)
        return []


def fetch_korbit_notices() -> list[dict]:
    """Korbit 공지사항 스크래핑"""
    exchange = 'korbit'
    url = 'https://www.korbit.co.kr/announce'
    try:
        resp = requests.get(url, headers=_HEADERS, timeout=_TIMEOUT)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, 'html.parser')
        results = []
        items = soup.select('a[href*="/announce"]')
        if not items:
            items = soup.select('.notice li a, .board li a, li a')
        for item in items[:_MAX_NOTICES]:
            title = item.get_text(strip=True)
            href = item.get('href', '')
            if not title or len(title) < 3 or href == '/announce':
                continue
            full_url = f'https://www.korbit.co.kr{href}' if href.startswith('/') else href
            results.append({'exchange': exchange, 'title': title, 'url': full_url, 'published_at': None})
        return results
    except Exception as e:
        logger.warning('Korbit notice scrape failed: %s', e)
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
