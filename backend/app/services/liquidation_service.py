"""BTC 선물 강제청산 수집·집계.

OKX 공개 API(`/api/v5/public/liquidation-orders`)는 BTC-USDT 무기한 청산을 최근 것부터
100건씩만 돌려주고 오래된 기록은 금방 사라진다. 그래서 백그라운드 루프가 1분마다 새 기록을
받아 `LiquidationEvent` 로 쌓고, 첫 화면은 DB 에서 지난 24시간을 시간별로 합산해 보여 준다.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Callable

import requests
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from backend.app.db.models import LiquidationEvent

logger = logging.getLogger(__name__)

OKX_URL = 'https://www.okx.com/api/v5/public/liquidation-orders'
OKX_CONTRACT_BTC = 0.01  # BTC-USDT-SWAP 계약 1개 = 0.01 BTC
EXCHANGE = 'okx'
MAX_PAGES = 20
RETENTION_HOURS = 48
HOUR = timedelta(hours=1)

HttpGet = Callable[[str, dict], dict]


def _default_get(url: str, params: dict) -> dict:
    resp = requests.get(url, params=params, timeout=10)
    resp.raise_for_status()
    return resp.json()


def parse_okx_details(details: list[dict]) -> list[dict]:
    """OKX 청산 상세 행 → 저장용 dict. 방향(posSide)이 long/short 가 아닌 행은 버린다."""
    events = []
    for d in details:
        side = d.get('posSide')
        if side not in ('long', 'short'):
            continue
        ts = int(d['ts'])
        sz, px = float(d['sz']), float(d['bkPx'])
        events.append({
            'event_key': f"{EXCHANGE}:{ts}:{side}:{d['sz']}:{d['bkPx']}",
            'exchange': EXCHANGE,
            'side': side,
            'usd': sz * OKX_CONTRACT_BTC * px,
            'occurred_at': datetime.fromtimestamp(ts / 1000, tz=timezone.utc),
        })
    return events


def fetch_okx_liquidations(since: datetime, http_get: HttpGet = _default_get) -> list[dict]:
    """`since` 이후 청산을 최신부터 거꾸로 페이지 단위로 받는다. 최대 MAX_PAGES 페이지."""
    since_ms = int(since.timestamp() * 1000)
    params = {'instType': 'SWAP', 'uly': 'BTC-USDT', 'state': 'filled', 'limit': 100}
    out: list[dict] = []
    for _ in range(MAX_PAGES):
        body = http_get(OKX_URL, params)
        data = body.get('data') or []
        details = data[0].get('details', []) if data else []
        if not details:
            break
        out.extend(e for e in parse_okx_details(details) if e['occurred_at'].timestamp() * 1000 >= since_ms)
        oldest = min(int(d['ts']) for d in details)
        if oldest < since_ms:
            break
        params = {**params, 'after': oldest}
    return out


def store_events(db: Session, events: list[dict]) -> int:
    """아직 없는 청산만 저장하고 새로 넣은 건수를 돌려준다."""
    if not events:
        return 0
    keys = {e['event_key'] for e in events}
    existing = set(db.scalars(select(LiquidationEvent.event_key).where(LiquidationEvent.event_key.in_(keys))))
    fresh = {e['event_key']: e for e in events if e['event_key'] not in existing}
    db.add_all(LiquidationEvent(**e) for e in fresh.values())
    db.commit()
    return len(fresh)


def prune(db: Session, now: datetime) -> None:
    db.execute(delete(LiquidationEvent).where(LiquidationEvent.occurred_at < now - timedelta(hours=RETENTION_HOURS)))
    db.commit()


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def hourly_summary(db: Session, now: datetime, hours: int = 24) -> dict:
    """지난 `hours` 시간의 시간별 롱/숏 청산 합계(USD).

    `covered_from` 은 저장된 가장 오래된 청산 시각이다. 수집을 시작한 지 하루가 안 됐으면
    그 이전 시간은 '기록 없음'(null)이고, 0 달러와 구분해서 보여 줘야 한다.
    """
    end = now.replace(minute=0, second=0, microsecond=0) + HOUR
    start = end - hours * HOUR
    rows = db.execute(
        select(LiquidationEvent.side, LiquidationEvent.usd, LiquidationEvent.occurred_at)
        .where(LiquidationEvent.occurred_at >= start)
    ).all()
    first = db.scalar(select(LiquidationEvent.occurred_at).order_by(LiquidationEvent.occurred_at).limit(1))
    covered_from = _aware(first) if first else None
    buckets = []
    for i in range(hours):
        b_start = start + i * HOUR
        has_data = covered_from is not None and b_start + HOUR > covered_from
        buckets.append({'t': b_start.isoformat(), 'long': 0.0 if has_data else None, 'short': 0.0 if has_data else None})
    for side, usd, at in rows:
        idx = int((_aware(at) - start) / HOUR)
        if 0 <= idx < hours and buckets[idx][side] is not None:
            buckets[idx][side] += usd
    total_long = sum(b['long'] or 0 for b in buckets)
    total_short = sum(b['short'] or 0 for b in buckets)
    return {
        'exchange': EXCHANGE,
        'hours': [{**b, 'long': None if b['long'] is None else round(b['long']),
                   'short': None if b['short'] is None else round(b['short'])} for b in buckets],
        'total_long_usd': round(total_long),
        'total_short_usd': round(total_short),
        'covered_from': covered_from.isoformat() if covered_from else None,
    }


def collect_once(session_factory, now: datetime | None = None, http_get: HttpGet = _default_get) -> int:
    now = now or datetime.now(timezone.utc)
    with session_factory() as db:
        latest = db.scalar(select(LiquidationEvent.occurred_at).order_by(LiquidationEvent.occurred_at.desc()).limit(1))
        since = max(_aware(latest) - timedelta(minutes=5), now - timedelta(hours=24)) if latest else now - timedelta(hours=24)
        added = store_events(db, fetch_okx_liquidations(since, http_get))
        prune(db, now)
        return added


async def liquidation_poll_loop(session_factory, interval: int = 60) -> None:
    """백그라운드에서 `interval` 초마다 청산 기록을 받아 쌓는다."""
    while True:
        try:
            added = await asyncio.to_thread(collect_once, session_factory)
            if added:
                logger.info('liquidations: %d new', added)
        except Exception as exc:
            logger.warning('liquidation poll failed: %s', exc)
        await asyncio.sleep(interval)
