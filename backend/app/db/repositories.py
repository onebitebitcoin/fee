from __future__ import annotations

import datetime as dt
from collections import defaultdict
from zoneinfo import ZoneInfo

from sqlalchemy import desc, func as sqlfunc, select
from sqlalchemy.orm import Session

from backend.app.db.models import CrawlRun, NetworkStatusSnapshot, TickerSnapshot, WithdrawalFeeSnapshot
from backend.app.db.models import CrawlError, LightningSwapFeeSnapshot, AccessLog, ExchangeNotice, ExchangeCapabilitySnapshot
from backend.app.db.models import CarfExchangeInfo, ExchangeVolumeSnapshot, KoreaWithdrawalLimitSnapshot
from backend.app.db.models import ExchangeCautionInfo


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


def get_prev_run_network_status(db: Session, crawl_run_id: int) -> list[NetworkStatusSnapshot]:
    """현재 crawl_run_id 이전의 가장 최근 성공 크롤 실행의 NetworkStatusSnapshot 목록 반환.

    이전 크롤이 없으면 빈 리스트 반환.
    """
    prev_run = db.scalar(
        select(CrawlRun)
        .where(CrawlRun.id < crawl_run_id)
        .where(CrawlRun.status.in_(['success', 'partial_success']))
        .order_by(desc(CrawlRun.id))
        .limit(1)
    )
    if prev_run is None:
        return []
    return list_network_status_for_run(db, prev_run.id)


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
    binance_fee_keywords = ['zero fee', 'zero-fee', '0% fee', '0% maker', '0% taker', 'fee promotion', 'fee update', 'trading fee', 'fee structure', 'fee change', 'fee rate', 'fee waiver', 'FDUSD']
    conditions = [ExchangeNotice.title.ilike(f'%{kw}%') for kw in btc_keywords]
    conditions += [ExchangeNotice.title.contains(kw) for kw in major_keywords]
    conditions += [ExchangeNotice.title.ilike(f'%{kw}%') for kw in binance_fee_keywords]
    stmt = (
        select(ExchangeNotice)
        .where(or_(*conditions))
        .order_by(nullslast(desc(ExchangeNotice.published_at)), desc(ExchangeNotice.noticed_at))
        .limit(limit)
    )
    return list(db.scalars(stmt))


def get_all_notices_by_exchange(db: Session) -> list[ExchangeNotice]:
    """run 무관하게 전체 DB의 공지를 거래소별 최신순으로 반환한다."""
    stmt = select(ExchangeNotice).order_by(ExchangeNotice.exchange, desc(ExchangeNotice.noticed_at))
    return list(db.scalars(stmt))


def get_recent_network_changes(db: Session, hours: int = 24) -> list[dict]:
    """최근 N시간 내 연속 크롤 실행 쌍에서 네트워크 상태 변경 목록 반환.

    각 항목:
      exchange, coin, network, change_type ('suspended'|'resumed'),
      detected_at (unix timestamp), related_notices (list of {title, url, published_at})
    """
    cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=hours)

    # 최근 N시간 내 성공한 크롤 실행 목록 (오래된 순)
    runs = list(db.scalars(
        select(CrawlRun)
        .where(CrawlRun.status.in_(['success', 'partial_success']))
        .where(CrawlRun.completed_at >= cutoff)
        .order_by(CrawlRun.id)
    ))

    if len(runs) < 2:
        return []

    # 각 run의 network status를 미리 로드
    run_status: dict[int, list[NetworkStatusSnapshot]] = {
        r.id: list_network_status_for_run(db, r.id) for r in runs
    }

    # 연속 쌍(prev, curr)에서 변경 감지
    seen_keys: set[tuple] = set()
    changes: list[dict] = []

    for i in range(len(runs) - 1, 0, -1):  # 최신 쌍부터
        curr_run = runs[i]
        prev_run = runs[i - 1]
        prev_rows = run_status[prev_run.id]
        curr_rows = run_status[curr_run.id]

        def _suspended_set(rows: list) -> set[tuple]:
            return {
                (r.exchange, r.coin or '', r.network or '')
                for r in rows
                if r.status != 'ok'
            }

        prev_susp = _suspended_set(prev_rows)
        curr_susp = _suspended_set(curr_rows)

        detected_at = int(curr_run.completed_at.timestamp()) if curr_run.completed_at else None

        for key in curr_susp - prev_susp:
            if key not in seen_keys:
                seen_keys.add(key)
                changes.append({
                    'exchange': key[0], 'coin': key[1] or None, 'network': key[2] or None,
                    'change_type': 'suspended', 'detected_at': detected_at,
                })
        for key in prev_susp - curr_susp:
            if key not in seen_keys:
                seen_keys.add(key)
                changes.append({
                    'exchange': key[0], 'coin': key[1] or None, 'network': key[2] or None,
                    'change_type': 'resumed', 'detected_at': detected_at,
                })

    if not changes:
        return []

    # 각 변경에 관련 공지 첨부
    _STOPWORDS = {'network', 'chain', 'token', 'protocol', 'mainnet', 'testnet', 'the', 'and'}
    from sqlalchemy import or_  # noqa: PLC0415
    for change in changes:
        keywords: list[str] = []
        if change['coin']:
            keywords.append(change['coin'])
        if change['network']:
            for word in change['network'].split():
                if word.lower() not in _STOPWORDS and len(word) >= 3:
                    keywords.append(word)

        if not keywords:
            change['related_notices'] = []
            continue

        conds = [ExchangeNotice.title.ilike(f'%{kw}%') for kw in keywords]
        notice_rows = list(db.scalars(
            select(ExchangeNotice)
            .where(ExchangeNotice.exchange == change['exchange'])
            .where(or_(*conds))
            .order_by(desc(ExchangeNotice.noticed_at))
            .limit(3)
        ))
        change['related_notices'] = [
            {
                'title': n.title,
                'url': n.url,
                'published_at': int(n.published_at.timestamp()) if n.published_at else None,
            }
            for n in notice_rows
        ]

    return changes


def list_carf_exchanges(db: Session) -> list[CarfExchangeInfo]:
    stmt = select(CarfExchangeInfo).order_by(CarfExchangeInfo.type, CarfExchangeInfo.id)
    return list(db.scalars(stmt))


# ── 거래소 거래량 스냅샷 ──────────────────────────────────────────────────────

def save_exchange_volume_snapshots(db: Session, crawl_run_id: int, records: list[dict]) -> None:
    for rec in records:
        db.add(ExchangeVolumeSnapshot(
            crawl_run_id=crawl_run_id,
            exchange=rec['exchange'],
            volume_24h_btc=rec.get('volume_24h_btc'),
            volume_24h_usd=rec.get('volume_24h_usd'),
            trust_score=rec.get('trust_score'),
            trust_rank=rec.get('trust_rank'),
        ))
    db.commit()


def get_latest_exchange_volumes(db: Session) -> list[ExchangeVolumeSnapshot]:
    """거래소별 가장 최근 거래량 스냅샷 1개씩 반환."""
    subq = (
        select(
            ExchangeVolumeSnapshot.exchange,
            sqlfunc.max(ExchangeVolumeSnapshot.recorded_at).label('max_ts'),
        )
        .group_by(ExchangeVolumeSnapshot.exchange)
        .subquery()
    )
    stmt = select(ExchangeVolumeSnapshot).join(
        subq,
        (ExchangeVolumeSnapshot.exchange == subq.c.exchange) &
        (ExchangeVolumeSnapshot.recorded_at == subq.c.max_ts),
    )
    return list(db.scalars(stmt))


def get_latest_korea_withdrawal_limits(db: Session) -> list[KoreaWithdrawalLimitSnapshot]:
    """거래소별 가장 최근 출금 한도 스냅샷 1개씩 반환."""
    subq = (
        select(
            KoreaWithdrawalLimitSnapshot.exchange,
            sqlfunc.max(KoreaWithdrawalLimitSnapshot.recorded_at).label('max_ts'),
        )
        .group_by(KoreaWithdrawalLimitSnapshot.exchange)
        .subquery()
    )
    stmt = select(KoreaWithdrawalLimitSnapshot).join(
        subq,
        (KoreaWithdrawalLimitSnapshot.exchange == subq.c.exchange) &
        (KoreaWithdrawalLimitSnapshot.recorded_at == subq.c.max_ts),
    )
    return list(db.scalars(stmt))


def get_all_caution_info(db: Session) -> list[ExchangeCautionInfo]:
    return list(db.scalars(select(ExchangeCautionInfo)))


def upsert_caution_info(
    db: Session,
    exchange_id: str,
    group: str,
    caution: bool,
    reason: str | None,
) -> ExchangeCautionInfo:
    from datetime import datetime, UTC
    row = db.get(ExchangeCautionInfo, exchange_id)
    if row is None:
        row = ExchangeCautionInfo(exchange_id=exchange_id, group=group, caution=caution, caution_reason=reason)
        db.add(row)
    else:
        row.caution = caution
        row.caution_reason = reason
        row.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(row)
    return row
