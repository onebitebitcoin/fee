"""비트코인 선물 시장 신호 — 펀딩비와 미결제약정 24시간 변화. 바이낸스 USDⓈ-M BTCUSDT 무기한, 5분 TTL 캐시.

청산 규모는 이미 터진 결과라서, 그 전에 포지션이 어느 쪽으로 쌓이는지 보여 주려고 두 값을 함께 낸다.
- 펀딩비: 롱과 숏 중 어느 쪽이 많은지(8시간마다 많은 쪽이 적은 쪽에 낸다)
- 미결제약정 변화: 열린 포지션이 늘었는지 줄었는지. 가격 방향과 묶어 읽는 일은 화면이 한다.
미결제약정은 달러 금액 대신 BTC 수량으로 비교한다. 달러 금액은 가격만 올라도 커지기 때문이다.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable

import requests

from backend.app.services.cache import _TtlCache

BINANCE_PREMIUM = 'https://fapi.binance.com/fapi/v1/premiumIndex'
BINANCE_OI_HIST = 'https://fapi.binance.com/futures/data/openInterestHist'
SYMBOL = 'BTCUSDT'
_cache = _TtlCache(ttl=300)

HttpGet = Callable[[str, dict], Any]


def _default_get(url: str, params: dict) -> Any:
    resp = requests.get(url, params=params, timeout=10)
    resp.raise_for_status()
    return resp.json()


def parse_funding(body: dict) -> dict:
    """premiumIndex 응답 → 직전에 확정된 펀딩비(%)와 다음 정산 시각."""
    return {
        'funding_rate_pct': float(body['lastFundingRate']) * 100,
        'next_funding_time': datetime.fromtimestamp(int(body['nextFundingTime']) / 1000, tz=timezone.utc).isoformat(),
    }


def parse_open_interest(rows: list[dict]) -> dict:
    """1시간 간격 미결제약정 기록 → 마지막 값과 첫 기록 대비 변화율(%)."""
    if len(rows) < 2:
        raise ValueError('바이낸스가 미결제약정 기록을 충분히 돌려주지 않았습니다')
    ordered = sorted(rows, key=lambda r: r['timestamp'])
    first, last = float(ordered[0]['sumOpenInterest']), float(ordered[-1]['sumOpenInterest'])
    return {
        'oi_btc': last,
        'oi_usd': float(ordered[-1]['sumOpenInterestValue']),
        'oi_change_pct': (last - first) / first * 100,
    }


def _compute(http_get: HttpGet) -> dict:
    funding = parse_funding(http_get(BINANCE_PREMIUM, {'symbol': SYMBOL}))
    # 25개 = 지금 기록 + 24시간 전 기록까지
    oi = parse_open_interest(http_get(BINANCE_OI_HIST, {'symbol': SYMBOL, 'period': '1h', 'limit': 25}))
    return {'source': 'binance', **funding, **oi}


def get_derivatives_summary(http_get: HttpGet = _default_get) -> dict:
    return _cache.get_or_compute('btc_derivatives', lambda: _compute(http_get))
