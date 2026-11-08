"""비트코인 24시간 가격 추이 — 바이낸스 BTCUSDT 1시간봉 24개. 5분 TTL 캐시."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Callable

import requests

from backend.app.services.cache import _TtlCache

BINANCE_KLINES = 'https://api.binance.com/api/v3/klines'
_trend_cache = _TtlCache(ttl=300)

HttpGet = Callable[[str, dict], list]


def _default_get(url: str, params: dict) -> list:
    resp = requests.get(url, params=params, timeout=10)
    resp.raise_for_status()
    return resp.json()


def parse_klines(rows: list) -> dict:
    points = [{'t': datetime.fromtimestamp(r[0] / 1000, tz=timezone.utc).isoformat(), 'close': float(r[4])} for r in rows]
    if not points:
        raise ValueError('바이낸스가 1시간봉을 돌려주지 않았습니다')
    closes = [p['close'] for p in points]
    first, last = float(rows[0][1]), closes[-1]  # 변동률 기준은 첫 봉의 시가
    return {
        'source': 'binance',
        'points': points,
        'open': first,
        'last': last,
        'high': max(float(r[2]) for r in rows),
        'low': min(float(r[3]) for r in rows),
        'change_pct': (last - first) / first * 100,
    }


def get_btc_24h_trend(http_get: HttpGet = _default_get) -> dict:
    return _trend_cache.get_or_compute(
        'btc_24h', lambda: parse_klines(http_get(BINANCE_KLINES, {'symbol': 'BTCUSDT', 'interval': '1h', 'limit': 24})))
