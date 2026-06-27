from __future__ import annotations

import datetime as dt
from collections import defaultdict
from zoneinfo import ZoneInfo

from sqlalchemy import desc, func as sqlfunc, or_, select
from sqlalchemy.orm import Session

from backend.app.db.models import CrawlRun, NetworkStatusSnapshot, TickerSnapshot, WithdrawalFeeSnapshot
from backend.app.db.models import CrawlError, LightningSwapFeeSnapshot, AccessLog, ExchangeNotice, ExchangeCapabilitySnapshot
from backend.app.db.models import CarfExchangeInfo, ExchangeVolumeSnapshot, KoreaWithdrawalLimitSnapshot
from backend.app.db.models import ExchangeCautionInfo
from backend.app.domain.notice_match import (
    BTC_KEYWORDS,
    FEE_KEYWORDS,
    MAJOR_KEYWORDS,
    is_relevant_title,
    keyword_in_title,
)


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


def record_visit(db: Session, ip: str | None) -> None:
    """방문 횟수 카운트 (중복 허용)."""
    db.add(AccessLog(ip_address=ip or None, request_type='visit'))
    db.commit()


def record_route_request(db: Session) -> None:
    """경로 탐색 요청 카운트 (중복 허용)."""
    db.add(AccessLog(request_type='route'))
    db.commit()


def get_access_count(db: Session) -> dict:
    kst = ZoneInfo('Asia/Seoul')
    now_kst = dt.datetime.now(kst)
    today_start = dt.datetime(now_kst.year, now_kst.month, now_kst.day, tzinfo=kst)

    v_total = db.scalar(select(sqlfunc.count(AccessLog.id)).where(AccessLog.request_type == 'visit')) or 0
    v_today = db.scalar(select(sqlfunc.count(AccessLog.id)).where(AccessLog.request_type == 'visit').where(AccessLog.accessed_at >= today_start)) or 0
    r_total = db.scalar(select(sqlfunc.count(AccessLog.id)).where(AccessLog.request_type == 'route')) or 0
    r_today = db.scalar(select(sqlfunc.count(AccessLog.id)).where(AccessLog.request_type == 'route').where(AccessLog.accessed_at >= today_start)) or 0

    return {
        'visitors_total': v_total,
        'visitors_today': v_today,
        'routes_total': r_total,
        'routes_today': r_today,
    }


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
    SQL ILIKE 는 coarse 프리필터일 뿐 — 'USDT'가 'HUSDT' 선물 공지에 substring으로
    오탐되므로, is_relevant_title()(티커 라틴 경계 매칭)로 후처리하여 정확히 거른다.
    키워드 목록은 notice_match SSoT를 공유한다.
    """
    from sqlalchemy import nullslast  # noqa: PLC0415
    conditions = [ExchangeNotice.title.ilike(f'%{kw}%') for kw in BTC_KEYWORDS]
    conditions += [ExchangeNotice.title.contains(kw) for kw in MAJOR_KEYWORDS]
    conditions += [ExchangeNotice.title.ilike(f'%{kw}%') for kw in FEE_KEYWORDS]
    stmt = (
        select(ExchangeNotice)
        .where(or_(*conditions))
        .order_by(nullslast(desc(ExchangeNotice.published_at)), desc(ExchangeNotice.noticed_at))
    )
    relevant = [n for n in db.scalars(stmt) if is_relevant_title(n.title, include_fee=True)]
    return relevant[:limit]


def get_all_notices_by_exchange(db: Session) -> list[ExchangeNotice]:
    """run 무관하게 전체 DB의 공지를 거래소별 최신순으로 반환한다."""
    stmt = select(ExchangeNotice).order_by(ExchangeNotice.exchange, desc(ExchangeNotice.noticed_at))
    return list(db.scalars(stmt))


_NOTICE_STOPWORDS = {'network', 'chain', 'token', 'protocol', 'mainnet', 'testnet', 'the', 'and'}


def _notice_matches_change(title_lower: str, coin: str | None, network_words: list[str]) -> bool:
    """공지가 네트워크 변경(coin+network)과 관련 있는지 판단.

    coin과 network 둘 다(AND) 매칭돼야 관련 공지로 인정한다 — coin(예: USDT)만 든
    무관 공지(KGST/USDT 캠페인, USDT/KZT 페어 등)가 특정 네트워크 출금중단에 붙는
    노이즈를 차단. network는 여러 토큰으로 쪼개질 수 있어 그 중 하나라도(any) 매칭되면
    네트워크 조건을 충족한 것으로 본다. (예: USDT 변경 + Kaia 네트워크 → 제목에
    USDT '그리고' Kaia 가 함께 있어야 관련)
    """
    if coin and not keyword_in_title(title_lower, coin):
        return False
    if network_words and not any(keyword_in_title(title_lower, w) for w in network_words):
        return False
    return True


def _wd_disabled_set(rows: list[WithdrawalFeeSnapshot]) -> set[tuple[str, str, str]]:
    """출금 스냅샷에서 비활성(enabled=False) 행의 (exchange, coin, network_label) 집합 반환."""
    return {(r.exchange, r.coin, r.network_label) for r in rows if not r.enabled}


def _wd_all_keys(rows: list[WithdrawalFeeSnapshot]) -> set[tuple[str, str, str]]:
    """출금 스냅샷의 모든 (exchange, coin, network_label) 집합 반환."""
    return {(r.exchange, r.coin, r.network_label) for r in rows}


def get_recent_network_changes(db: Session, hours: int = 24) -> list[dict]:
    """최근 N시간 내 연속 크롤 실행 쌍에서 출금 활성화 상태 변경 목록 반환.

    WithdrawalFeeSnapshot.enabled 필드를 기준으로 비교한다.
    반환 항목 필드: exchange, coin, network, change_type ('suspended'|'resumed'),
    detected_at (unix timestamp), related_notices (list of {title, url, published_at})
    """
    cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=hours)
    runs = list(db.scalars(
        select(CrawlRun)
        .where(CrawlRun.status.in_(['success', 'partial_success']))
        .where(CrawlRun.completed_at >= cutoff)
        .order_by(CrawlRun.id)
    ))
    if len(runs) < 2:
        return []

    run_wd: dict[int, list[WithdrawalFeeSnapshot]] = {
        r.id: list_withdrawal_snapshots_for_run(db, r.id) for r in runs
    }

    seen_keys: set[tuple] = set()
    changes: list[dict] = []

    for i in range(len(runs) - 1, 0, -1):  # 최신 쌍부터
        curr_run = runs[i]
        prev_rows = run_wd[runs[i - 1].id]
        curr_rows = run_wd[curr_run.id]

        prev_disabled = _wd_disabled_set(prev_rows)
        curr_disabled = _wd_disabled_set(curr_rows)
        prev_keys = _wd_all_keys(prev_rows)
        curr_keys = _wd_all_keys(curr_rows)

        detected_at = int(curr_run.completed_at.timestamp()) if curr_run.completed_at else None

        # 이전에 있던 코인/네트워크가 비활성으로 바뀐 경우 (suspended)
        newly_suspended = (curr_disabled - prev_disabled) & prev_keys
        # 이전에 비활성이었던 코인/네트워크가 활성으로 바뀐 경우 (resumed)
        newly_resumed = (prev_disabled - curr_disabled) & curr_keys

        for key, change_type in [*[(k, 'suspended') for k in newly_suspended],
                                  *[(k, 'resumed') for k in newly_resumed]]:
            if key not in seen_keys:
                seen_keys.add(key)
                changes.append({
                    'exchange': key[0], 'coin': key[1] or None, 'network': key[2] or None,
                    'change_type': change_type, 'detected_at': detected_at,
                })

    if not changes:
        return []

    for change in changes:
        coin_kw: str | None = change['coin']
        network_words = [
            w for w in (change['network'] or '').split()
            if w.lower() not in _NOTICE_STOPWORDS and len(w) >= 3
        ]
        all_keywords = ([coin_kw] if coin_kw else []) + network_words
        if not all_keywords:
            change['related_notices'] = []
            continue

        # SQL ILIKE 는 coarse 프리필터(OR로 넓게 수집) — 정밀 필터는 후처리에서.
        conds = [ExchangeNotice.title.ilike(f'%{kw}%') for kw in all_keywords]
        notice_rows = list(db.scalars(
            select(ExchangeNotice)
            .where(ExchangeNotice.exchange == change['exchange'])
            .where(or_(*conds))
            .order_by(desc(ExchangeNotice.noticed_at))
            .limit(20)
        ))
        # coin AND network 매칭 + 티커 라틴 경계('USDT'≠'HUSDT')로 정밀 필터, 상위 3건.
        matched = [
            n for n in notice_rows
            if _notice_matches_change(n.title.lower(), coin_kw, network_words)
        ][:3]
        change['related_notices'] = [
            {
                'title': n.title,
                'url': n.url,
                'published_at': int(n.published_at.timestamp()) if n.published_at else None,
            }
            for n in matched
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
