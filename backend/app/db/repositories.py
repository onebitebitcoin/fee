from __future__ import annotations

import datetime as dt
from collections import defaultdict
from zoneinfo import ZoneInfo

from sqlalchemy import desc, func as sqlfunc, select
from sqlalchemy.orm import Session

from backend.app.db.models import CrawlRun, NetworkStatusSnapshot, TickerSnapshot, WithdrawalFeeSnapshot
from backend.app.db.models import CrawlError, LightningSwapFeeSnapshot, AccessLog, ExchangeNotice


def get_latest_successful_run(db: Session) -> CrawlRun | None:
    stmt = (
        select(CrawlRun)
        .where(CrawlRun.status.in_(['success', 'partial_success']))
        .order_by(desc(CrawlRun.completed_at), desc(CrawlRun.id))
        .limit(1)
    )
    return db.scalar(stmt)


def list_crawl_runs(db: Session, limit: int = 20) -> list[CrawlRun]:
    stmt = select(CrawlRun).order_by(desc(CrawlRun.started_at), desc(CrawlRun.id)).limit(limit)
    return list(db.scalars(stmt))


def list_ticker_snapshots_for_run(db: Session, crawl_run_id: int) -> list[TickerSnapshot]:
    stmt = select(TickerSnapshot).where(TickerSnapshot.crawl_run_id == crawl_run_id).order_by(TickerSnapshot.exchange, TickerSnapshot.market_type)
    return list(db.scalars(stmt))


def list_withdrawal_snapshots_for_run(db: Session, crawl_run_id: int) -> list[WithdrawalFeeSnapshot]:
    stmt = select(WithdrawalFeeSnapshot).where(WithdrawalFeeSnapshot.crawl_run_id == crawl_run_id).order_by(WithdrawalFeeSnapshot.exchange, WithdrawalFeeSnapshot.coin, WithdrawalFeeSnapshot.network_label)
    return list(db.scalars(stmt))


def list_network_status_for_run(db: Session, crawl_run_id: int) -> list[NetworkStatusSnapshot]:
    stmt = select(NetworkStatusSnapshot).where(NetworkStatusSnapshot.crawl_run_id == crawl_run_id).order_by(NetworkStatusSnapshot.exchange, NetworkStatusSnapshot.status)
    return list(db.scalars(stmt))


def list_crawl_errors_for_run(db: Session, crawl_run_id: int, stage: str | None = None) -> list[CrawlError]:
    stmt = select(CrawlError).where(CrawlError.crawl_run_id == crawl_run_id)
    if stage:
        stmt = stmt.where(CrawlError.stage == stage)
    stmt = stmt.order_by(CrawlError.stage, CrawlError.exchange, CrawlError.coin, CrawlError.id)
    return list(db.scalars(stmt))


def list_lightning_swap_fees_for_run(db: Session, run_id: int) -> list[LightningSwapFeeSnapshot]:
    return db.query(LightningSwapFeeSnapshot).filter(LightningSwapFeeSnapshot.crawl_run_id == run_id).order_by(LightningSwapFeeSnapshot.service_name).all()


def group_network_status(rows: list[NetworkStatusSnapshot]) -> dict[str, dict]:
    grouped: dict[str, dict] = defaultdict(lambda: {'status': 'ok', 'suspended_networks': [], 'checked_at': None})
    for row in rows:
        item = grouped[row.exchange]
        item['checked_at'] = int(row.recorded_at.timestamp()) if row.recorded_at else None
        if row.status != 'ok':
            item['status'] = row.status
            item['suspended_networks'].append({
                'coin': row.coin,
                'network': row.network,
                'status': row.status,
                'reason': row.reason,
                'source_url': row.source_url,
                'detected_at': row.detected_at,
            })
    return dict(grouped)


def record_access(db: Session) -> None:
    log = AccessLog()
    db.add(log)
    db.commit()


def get_access_count(db: Session) -> dict:
    kst = ZoneInfo('Asia/Seoul')
    now_kst = dt.datetime.now(kst)
    today_start = dt.datetime(now_kst.year, now_kst.month, now_kst.day, tzinfo=kst)

    total = db.query(sqlfunc.count(AccessLog.id)).scalar() or 0
    today = db.query(sqlfunc.count(AccessLog.id)).filter(AccessLog.accessed_at >= today_start).scalar() or 0

    return {'total': total, 'today': today}


def list_notices_for_run(db: Session, crawl_run_id: int) -> list[ExchangeNotice]:
    stmt = select(ExchangeNotice).where(ExchangeNotice.crawl_run_id == crawl_run_id).order_by(ExchangeNotice.exchange, ExchangeNotice.noticed_at.desc())
    return list(db.scalars(stmt))


def get_latest_notices_per_exchange(db: Session, crawl_run_id: int) -> dict[str, list]:
    """exchange별 최신 공지 최대 5개 반환"""
    rows = list_notices_for_run(db, crawl_run_id)
    result: dict[str, list] = {}
    counts: dict[str, int] = {}
    for row in rows:
        ex = row.exchange
        if ex not in counts:
            counts[ex] = 0
        if counts[ex] < 5:
            if ex not in result:
                result[ex] = []
            result[ex].append({
                'title': row.title,
                'url': row.url,
                'published_at': int(row.published_at.timestamp()) if row.published_at else None,
            })
            counts[ex] += 1
    return result
