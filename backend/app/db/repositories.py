from __future__ import annotations

import datetime as dt
from collections import defaultdict
from collections.abc import Iterable
from zoneinfo import ZoneInfo

from sqlalchemy import and_, desc, func as sqlfunc, or_, select
from sqlalchemy.orm import Session

from backend.app.db.models import CrawlRun, NetworkStatusSnapshot, TickerSnapshot, WithdrawalFeeSnapshot
from backend.app.db.models import CrawlError, LightningSwapFeeSnapshot, AccessLog, ExchangeNotice, ExchangeCapabilitySnapshot
from backend.app.db.models import CarfExchangeInfo, ExchangeVolumeSnapshot, KoreaWithdrawalLimitSnapshot
from backend.app.db.models import DepositStatusSnapshot
from backend.app.db.models import ExchangeCautionInfo
from backend.app.domain.notice_match import (
    BTC_KEYWORDS,
    FEE_KEYWORDS,
    MAJOR_KEYWORDS,
    is_relevant_title,
    is_suspension_notice,
    keyword_in_title,
    network_keywords,
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


def list_deposit_status_for_run(db: Session, run_id: int) -> list[DepositStatusSnapshot]:
    """국내 거래소 입금 가능 여부 스냅샷. 수집원이 있는 거래소만 행이 있다."""
    stmt = select(DepositStatusSnapshot).where(
        DepositStatusSnapshot.crawl_run_id == run_id
    ).order_by(DepositStatusSnapshot.exchange, DepositStatusSnapshot.coin)
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


_CRAWL_SUCCESS_STATUSES = ('success', 'partial_success')


def _unix_ts_utc(value: dt.datetime | None) -> int | None:
    """datetime → unix timestamp(초). tzinfo 가 없는 값은 UTC 로 간주한다.

    DB 에는 항상 UTC 로 기록하지만, 드라이버가 tzinfo 를 복원하는지가 백엔드마다 다르다.
    PostgreSQL(프로덕션)은 timezone-aware 로 돌려주고 SQLite(개발/테스트)는 naive 로
    돌려주므로, naive 를 로컬 시간으로 해석하면 개발 환경에서만 9시간 어긋난다.
    """
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=dt.timezone.utc)
    return int(value.timestamp())


def get_withdrawal_disabled_since(
    db: Session,
    keys: Iterable[tuple[str, str, str]],
) -> dict[tuple[str, str, str], dict]:
    """출금이 중단된 (exchange, coin, network_label) 별로 중단이 시작된 시각을 계산한다.

    `get_recent_network_changes` 는 최근 N시간(최대 72시간) 창만 비교하기 때문에,
    중단이 그보다 오래 이어지면 "언제부터"를 알려주지 못한다. 이 함수는 창 제한 없이
    보존된 전체 스냅샷 이력을 거슬러 올라가 마지막 중단 구간의 시작점을 찾는다.

    판정 순서:
      1. 키별로 `enabled=True` 가 마지막으로 관측된 크롤 실행 id 를 구한다.
      2. 그 실행 이후에 `enabled=False` 가 처음 관측된 크롤의 완료 시각을 중단 시작으로 본다.
         이 값은 활성에서 비활성으로 넘어간 전환을 실제로 관측한 시점이므로 `exact=True` 다.
      3. 활성 관측이 한 번도 없으면 보존된 가장 오래된 비활성 관측 시각을 반환하되,
         그 이전 상태는 알 수 없으므로 `exact=False` 로 표시한다(하한값).

    반환값: `{(exchange, coin, network_label): {'disabled_since': int|None, 'exact': bool}}`
    `disabled_since` 는 unix timestamp(초)이며, 비활성 관측이 아예 없으면 None 이다.
    실패한 크롤 실행(status 가 success/partial_success 가 아닌 경우)은 근거에서 제외한다.
    """
    key_list = list(dict.fromkeys(keys))
    if not key_list:
        return {}

    key_filter = or_(*[
        and_(
            WithdrawalFeeSnapshot.exchange == exchange,
            WithdrawalFeeSnapshot.coin == coin,
            WithdrawalFeeSnapshot.network_label == network_label,
        )
        for exchange, coin, network_label in key_list
    ])
    base_conditions = (
        CrawlRun.status.in_(_CRAWL_SUCCESS_STATUSES),
        CrawlRun.completed_at.is_not(None),
    )

    # 1) 키별 '마지막 활성 관측' 크롤 실행 id — 한 번의 집계 쿼리로 모두 구한다.
    last_enabled_rows = db.execute(
        select(
            WithdrawalFeeSnapshot.exchange,
            WithdrawalFeeSnapshot.coin,
            WithdrawalFeeSnapshot.network_label,
            sqlfunc.max(WithdrawalFeeSnapshot.crawl_run_id),
        )
        .join(CrawlRun, CrawlRun.id == WithdrawalFeeSnapshot.crawl_run_id)
        .where(*base_conditions, WithdrawalFeeSnapshot.enabled.is_(True), key_filter)
        .group_by(
            WithdrawalFeeSnapshot.exchange,
            WithdrawalFeeSnapshot.coin,
            WithdrawalFeeSnapshot.network_label,
        )
    ).all()
    last_enabled_run_id = {(r[0], r[1], r[2]): r[3] for r in last_enabled_rows}

    result: dict[tuple[str, str, str], dict] = {}
    for key in key_list:
        exchange, coin, network_label = key
        boundary_run_id = last_enabled_run_id.get(key)
        stmt = (
            select(sqlfunc.min(CrawlRun.completed_at))
            .select_from(WithdrawalFeeSnapshot)
            .join(CrawlRun, CrawlRun.id == WithdrawalFeeSnapshot.crawl_run_id)
            .where(
                *base_conditions,
                WithdrawalFeeSnapshot.enabled.is_(False),
                WithdrawalFeeSnapshot.exchange == exchange,
                WithdrawalFeeSnapshot.coin == coin,
                WithdrawalFeeSnapshot.network_label == network_label,
            )
        )
        if boundary_run_id is not None:
            stmt = stmt.where(WithdrawalFeeSnapshot.crawl_run_id > boundary_run_id)
        started_at = db.scalar(stmt)
        result[key] = {
            'disabled_since': _unix_ts_utc(started_at),
            'exact': started_at is not None and boundary_run_id is not None,
        }
    return result


def _notice_within_window(notice: ExchangeNotice, started_ts: int | None) -> bool:
    """공지가 중단 시작 시각 근처에 게시됐는지 판단한다.

    `started_ts` 가 None 이면(중단 시작을 모르면) 조건을 걸 근거가 없으므로 통과시킨다.
    공지 시각은 게시일(published_at)을 우선 쓰고, 없으면 수집 시각(noticed_at)으로
    대신한다. 둘 다 없으면 판단할 수 없으므로 통과시킨다.
    """
    if started_ts is None:
        return True
    moment = notice.published_at or notice.noticed_at
    if moment is None:
        return True
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=dt.timezone.utc)
    started = dt.datetime.fromtimestamp(started_ts, dt.timezone.utc)
    return started - _NOTICE_WINDOW_BEFORE <= moment <= started + _NOTICE_WINDOW_AFTER


# 중단 시작 시각을 기준으로 공지를 인정할 시간 범위.
# 거래소는 중단을 며칠 앞두고 예고하기도 하고(이전), 중단 직후에 안내하기도 한다(이후).
# 이 범위를 벗어난 공지는 같은 네트워크의 '지난번' 중단을 다룬 것으로 본다.
_NOTICE_WINDOW_BEFORE = dt.timedelta(days=14)
_NOTICE_WINDOW_AFTER = dt.timedelta(days=2)


def get_notices_for_disabled_networks(
    db: Session,
    keys: Iterable[tuple[str, str, str]],
    disabled_since: dict[tuple[str, str, str], int | None] | None = None,
) -> dict[tuple[str, str, str], list[dict]]:
    """출금이 중단된 (exchange, coin, network_label) 별로 그 중단을 설명하는 공지를 찾는다.

    `get_recent_network_changes` 의 공지 첨부는 최근 N시간(최대 72시간) 창 안에서
    감지된 변경에만 붙는다. 중단이 그보다 오래 이어지면 사유를 설명하는 공지가 DB 에
    있어도 화면까지 닿지 못하므로, 이 함수는 창 제한 없이 현재 중단 중인 행을 기준으로
    검색한다.

    매칭은 coin AND network 를 모두 만족해야 한다. coin 만 겹치는 공지(예: 다른
    네트워크의 중단 안내, USDT 페어 이벤트)가 붙는 노이즈를 막기 위해서다. 네트워크
    키워드는 `network_keywords()` 가 별칭까지 넓혀 주므로, 라벨이 'TRC20' 인 행에
    "Tron 네트워크" 라고 적힌 공지도 이어진다.

    `disabled_since` 를 주면 중단 시작 시각 근처(이전 14일 ~ 이후 2일)에 게시된 공지만
    남긴다. 같은 네트워크가 과거에도 중단된 적이 있으면 제목이 똑같은 공지가 여러 건
    쌓이는데, 시간 조건이 없으면 몇 달 전 공지가 지금의 중단 사유로 붙어 사실과
    어긋난다. 시작 시각을 모르는 키(값이 None)는 조건을 걸 근거가 없으므로 그대로 둔다.

    Args:
        db: 세션.
        keys: 현재 출금이 중단된 (exchange, coin, network_label) 목록.
        disabled_since: 키별 중단 시작 unix timestamp. `get_withdrawal_disabled_since`
            결과에서 뽑아 넘긴다. None 이면 시간 조건 없이 매칭한다.

    반환값: `{(exchange, coin, network_label): [{'title', 'url', 'published_at'}, ...]}`
    키별 최신순 최대 3건이며, 관련 공지가 없으면 빈 리스트다.
    """
    key_list = list(dict.fromkeys(keys))
    if not key_list:
        return {}

    result: dict[tuple[str, str, str], list[dict]] = {}
    for key in key_list:
        exchange, coin, network_label = key
        net_kws = network_keywords(network_label, coin)
        if not net_kws:
            result[key] = []
            continue

        # SQL ILIKE 는 coarse 프리필터(네트워크 별칭 OR) — 정밀 필터는 후처리에서.
        conds = [ExchangeNotice.title.ilike(f'%{kw}%') for kw in net_kws]
        notice_rows = list(db.scalars(
            select(ExchangeNotice)
            .where(ExchangeNotice.exchange == exchange)
            .where(or_(*conds))
            .order_by(desc(ExchangeNotice.noticed_at))
            .limit(30)
        ))
        # coin AND network 에 더해 "중단/재개를 다루는 공지" 조건을 건다.
        # BTC 처럼 네트워크 키워드가 코인 심볼과 겹치는 경우 앞의 두 조건만으로는
        # 프로모션·상장 공지가 통과한다.
        started_ts = (disabled_since or {}).get(key)
        matched = [
            n for n in notice_rows
            if _notice_matches_change(n.title.lower(), coin, list(net_kws))
            and is_suspension_notice(n.title)
            and _notice_within_window(n, started_ts)
        ][:3]
        result[key] = [
            {
                'title': n.title,
                'url': n.url,
                'published_at': _unix_ts_utc(n.published_at),
            }
            for n in matched
        ]
    return result


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
