from __future__ import annotations

import datetime as dt
from collections import defaultdict
from zoneinfo import ZoneInfo

from sqlalchemy import desc, func as sqlfunc, select
from sqlalchemy.orm import Session

from backend.app.db.models import CrawlRun, NetworkStatusSnapshot, TickerSnapshot, WithdrawalFeeSnapshot
from backend.app.db.models import CrawlError, LightningSwapFeeSnapshot, AccessLog, ExchangeNotice, ExchangeCapabilitySnapshot
from backend.app.db.models import CarfExchangeInfo


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
    stmt = select(LightningSwapFeeSnapshot).where(
        LightningSwapFeeSnapshot.crawl_run_id == run_id
    ).order_by(LightningSwapFeeSnapshot.service_name)
    return list(db.scalars(stmt))


def list_exchange_capabilities_for_run(db: Session, run_id: int) -> list[ExchangeCapabilitySnapshot]:
    stmt = select(ExchangeCapabilitySnapshot).where(
        ExchangeCapabilitySnapshot.crawl_run_id == run_id
    ).order_by(ExchangeCapabilitySnapshot.exchange)
    return list(db.scalars(stmt))


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

    total = db.scalar(select(sqlfunc.count(AccessLog.id))) or 0
    today = db.scalar(select(sqlfunc.count(AccessLog.id)).where(AccessLog.accessed_at >= today_start)) or 0

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


def get_latest_relevant_notices(db: Session, limit: int = 5) -> list[ExchangeNotice]:
    """BTC/USDT/Lightning 관련 최신 공지 limit건 반환 (전체 DB 기준 최신순)

    알트코인 무관 공지를 제외하기 위해 BTC 특화 + 거래소 전체 주요 공지만 허용.
    """
    from sqlalchemy import nullslast, or_
    btc_keywords = ['BTC', 'Bitcoin', '비트코인', 'USDT', 'Tether', '테더', 'Lightning', '라이트닝', 'SegWit', '세그윗', 'halving', '반감기']
    major_keywords = ['전체 점검', '전체점검', '서비스 점검', '서비스점검', '시스템 점검', '시스템점검', '거래소 점검', '긴급 점검', '긴급점검']
    conditions = [ExchangeNotice.title.ilike(f'%{kw}%') for kw in btc_keywords]
    conditions += [ExchangeNotice.title.contains(kw) for kw in major_keywords]
    stmt = (
        select(ExchangeNotice)
        .where(or_(*conditions))
        .order_by(nullslast(desc(ExchangeNotice.published_at)), desc(ExchangeNotice.noticed_at))
        .limit(limit)
    )
    return list(db.scalars(stmt))


def list_carf_exchanges(db: Session) -> list[CarfExchangeInfo]:
    stmt = select(CarfExchangeInfo).order_by(CarfExchangeInfo.type, CarfExchangeInfo.id)
    return list(db.scalars(stmt))
