"""
거래소 공지사항 스크래퍼

각 함수 반환 형식:
  list[dict] where each dict has:
    - exchange: str
    - title: str
    - url: str | None
    - published_at: datetime | None

다국어 지원 설계:
  글로벌 거래소(Binance 등)는 _BINANCE_NOTICE_LOCALE 상수로 기본 언어를 제어한다.
  향후 한국어 공지 추가 시 상수를 'ko'로 변경하거나, get_all_notices()에서
  locale='ko' 호출을 병행 추가하면 된다.
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
_MAX_NOTICES = 5   # 반환할 최대 건수
_MAX_FETCH = 30    # 필터링 전 최대 수집 건수 (국내 거래소용)
_BINANCE_MAX_FETCH = 20  # Binance API pageSize 최대 허용값 (25 이상 400 에러)

# --- Binance 다국어 설정 ---
# 'en' → 영어 공지, 'ko' → 한국어 공지
# 한국어 지원 시: 이 값을 'ko'로 변경하거나 get_all_notices()에서 병행 호출
_BINANCE_NOTICE_LOCALE: str = 'en'

_BINANCE_LOCALE_HEADERS: dict[str, dict] = {
    'en': {'Accept-Language': 'en-US,en;q=0.9'},
    'ko': {'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'},
}
_BINANCE_LOCALE_URL_PREFIX: dict[str, str] = {
    'en': 'https://www.binance.com/en/support/announcement',
    'ko': 'https://www.binance.com/ko/support/announcement',
}

# Binance 수수료 특화 키워드 (공통 _BTC_KEYWORDS 외에 추가)
_BINANCE_FEE_KEYWORDS: list[str] = [
    'zero fee', 'zero-fee', '0% fee', '0% maker', '0% taker',
    'fee promotion', 'fee update', 'trading fee',
    'fee structure', 'fee change', 'fee rate', 'fee waiver',
    'FDUSD',
]

# BTC/USDT/Lightning 관련 공지 필터 키워드
_BTC_KEYWORDS = [
    'BTC', 'Bitcoin', '비트코인',
    'USDT', 'Tether', '테더',
    'Lightning', '라이트닝',
    'SegWit', '세그윗',
    'halving', '반감기',
]
# 거래소 전체에 영향을 미치는 주요 공지 (알트코인 특정 공지 제외)
_MAJOR_KEYWORDS = [
    '전체 점검', '전체점검',
    '서비스 점검', '서비스점검',
    '시스템 점검', '시스템점검',
    '거래소 점검', '거래소점검',
    '긴급 점검', '긴급점검',
]


def _is_relevant(title: str) -> bool:
    """BTC/USDT/Lightning 관련 공지이거나 거래소 전체 주요 공지인지 판단"""
    lower = title.lower()
    for kw in _BTC_KEYWORDS:
        if kw.lower() in lower:
            return True
    for kw in _MAJOR_KEYWORDS:
        if kw in title:
            return True
    return False


def _is_relevant_for_binance(title: str) -> bool:
    """Binance 공지 관련성 판단: 공통 키워드 + 수수료 특화 키워드"""
    if _is_relevant(title):
        return True
    lower = title.lower()
    return any(kw.lower() in lower for kw in _BINANCE_FEE_KEYWORDS)


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
    url = f'https://api-manager.upbit.com/api/v1/announcements?os=web&page=1&per_page={_MAX_FETCH}&category=all'
    headers = {**_HEADERS, 'Referer': 'https://upbit.com/'}
    try:
        resp = requests.get(url, headers=headers, timeout=_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
        if not data.get('success'):
            return []
        notices = data.get('data', {}).get('notices', [])
        results = []
        for item in notices:
            title = item.get('title', '').strip()
            notice_id = item.get('id')
            if not title or not notice_id:
                continue
            if not _is_relevant(title):
                continue
            results.append({
                'exchange': exchange,
                'title': title,
                'url': f'https://upbit.com/service_center/notice/{notice_id}',
                'published_at': _parse_iso(item.get('listed_at')),
            })
            if len(results) >= _MAX_NOTICES:
                break
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
        for a in page.css('a[href*="/notice/"]')[:_MAX_FETCH]:
            href = a.attrib.get('href', '')
            # 제목: link-title 클래스 스팬
            title_spans = a.css('span[class*="link-title"]')
            title = title_spans[0].text.strip() if title_spans else ''
            # 날짜: link-date 클래스 스팬
            date_spans = a.css('span[class*="link-date"]')
            date_str = date_spans[0].text.strip() if date_spans else None

            if not title or len(title) < 3:
                continue
            if not _is_relevant(title):
                continue
            full_url = f'https://feed.bithumb.com{href}' if href.startswith('/') else href
            results.append({
                'exchange': exchange,
                'title': title,
                'url': full_url,
                'published_at': _parse_date_str(date_str),
            })
            if len(results) >= _MAX_NOTICES:
                break
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
    url = f'https://api-gateway.coinone.co.kr/notice/v1/announcements/posts?includePin=false&page=0&pageSize={_MAX_FETCH}'
    headers = {**_HEADERS, 'Referer': 'https://coinone.co.kr/'}
    try:
        resp = requests.get(url, headers=headers, timeout=_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
        body = data.get('body', {})
        notices = body.get('notices', [])
        results = []
        for item in notices:
            title = item.get('title', '').strip()
            notice_id = item.get('id')
            if not title or not notice_id:
                continue
            if not _is_relevant(title):
                continue
            results.append({
                'exchange': exchange,
                'title': title,
                'url': f'https://coinone.co.kr/info/notice/{notice_id}',
                'published_at': _parse_epoch(item.get('createdAt')),
            })
            if len(results) >= _MAX_NOTICES:
                break
        return results
    except Exception as e:
        logger.warning('Coinone notice scrape failed: %s', e)
        return []


def fetch_binance_notices(locale: str = _BINANCE_NOTICE_LOCALE) -> list[dict]:
    """Binance 공지사항 API 스크래핑 (비공개 CMS API 사용)

    Args:
        locale: 'en' (기본값) 또는 'ko'. 한국어 공지 추가 시 'ko' 전달.

    Binance API 응답 구조:
      data.catalogs[].articles[] 또는 data.articles[]
      releaseDate는 밀리초 단위 Unix 타임스탬프
    """
    exchange = 'binance'
    api_url = 'https://www.binance.com/bapi/composite/v1/public/cms/article/list/query'
    url_prefix = _BINANCE_LOCALE_URL_PREFIX.get(locale, _BINANCE_LOCALE_URL_PREFIX['en'])

    headers = {
        **_HEADERS,
        **_BINANCE_LOCALE_HEADERS.get(locale, _BINANCE_LOCALE_HEADERS['en']),
        'Referer': 'https://www.binance.com/',
        'Origin': 'https://www.binance.com',
    }
    params: dict[str, str] = {
        'type': '1',
        'pageNo': '1',
        'pageSize': str(_BINANCE_MAX_FETCH),
    }

    try:
        resp = requests.get(api_url, headers=headers, params=params, timeout=_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()

        if data.get('code') != '000000':
            logger.warning('Binance notice API non-success code: %s', data.get('code'))
            return []

        # catalogs 배열이 있으면 각 catalog의 articles를 합산, 없으면 최상위 articles 사용
        data_body: dict = data.get('data') or {}
        catalogs: list[dict] = data_body.get('catalogs') or []
        articles: list[dict] = []
        if catalogs:
            for catalog in catalogs:
                articles.extend(catalog.get('articles') or [])
        else:
            articles = data_body.get('articles') or []

        results: list[dict] = []
        for item in articles:
            title = (item.get('title') or '').strip()
            article_code = item.get('code') or str(item.get('id') or '')
            if not title or not article_code:
                continue
            if not _is_relevant_for_binance(title):
                continue

            release_ms: int | None = item.get('releaseDate')
            published_at: datetime | None = None
            if release_ms:
                try:
                    published_at = datetime.fromtimestamp(release_ms / 1000, tz=timezone.utc).replace(tzinfo=None)
                except (OSError, OverflowError, ValueError):
                    published_at = None

            results.append({
                'exchange': exchange,
                'title': title,
                'url': f'{url_prefix}/{article_code}',
                'published_at': published_at,
            })
            if len(results) >= _MAX_NOTICES:
                break

        return results
    except Exception as e:
        logger.warning('Binance notice scrape failed: %s', e)
        return []


def fetch_korbit_notices() -> list[dict]:
    """Korbit 공지사항 스크래핑 (현재 모든 접근 방법이 홈으로 리다이렉트됨)"""
    # Korbit의 /announce 페이지는 headless browser 접근 시 홈으로 리다이렉트되어
    # 현재 스크래핑이 불가능합니다.
    logger.debug('Korbit notice scraping skipped (page redirects to homepage)')
    return []


def get_all_notices() -> list[dict]:
    """모든 거래소 공지사항을 병렬로 스크래핑

    한국어 Binance 공지 추가 시:
      scrapers에 lambda: fetch_binance_notices(locale='ko') 를 병행 추가
    """
    scrapers = [
        fetch_upbit_notices,
        fetch_bithumb_notices,
        fetch_coinone_notices,
        fetch_korbit_notices,
        fetch_binance_notices,  # 글로벌: 기본 locale(_BINANCE_NOTICE_LOCALE) 사용
    ]

    all_notices: list[dict] = []
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {executor.submit(fn): getattr(fn, '__name__', repr(fn)) for fn in scrapers}
        for future in as_completed(futures):
            try:
                results = future.result()
                all_notices.extend(results)
            except Exception as e:
                logger.warning('Notice scraper %s failed: %s', futures[future], e)

    return all_notices
