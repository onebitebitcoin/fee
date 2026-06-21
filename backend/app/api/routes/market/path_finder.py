"""최저 수수료 경로 라우터 — cheapest / cheapest-all / inspect + 계산·캐시 워밍."""
from __future__ import annotations

import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from backend.app.db import repositories
from backend.app.db.session import get_db
from backend.app.domain.market_core import GROUPS
from backend.app.domain.paths_buy import find_cheapest_path_from_snapshot_rows
from backend.app.domain.paths_sell import find_cheapest_sell_path_from_snapshot_rows
from backend.app.domain.route_inspect import inspect_all as _inspect_all
from backend.app.api.routes.market._shared import (
    _build_notice_lookup,
    _cheapest_path_cache,
    _enrich_disabled_paths_with_notices,
    _enrich_path_payload_with_kyc,
    _serialize_run,
)
from backend.app.api.routes.market.kimp import _current_usdt_krw_rate

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get('/path-finder/cheapest')
def get_cheapest_path(
    request: Request,
    background_tasks: BackgroundTasks,
    amount_krw: int = Query(1000000, ge=10000),
    amount_btc: float | None = Query(None, gt=0),
    wallet_utxo_count: int = Query(1, ge=1, le=200),
    mode: str = Query('buy'),
    global_exchange: str = Query('binance'),
    db: Session = Depends(get_db),
) -> dict:
    _ip = request.headers.get('x-forwarded-for', request.client.host if request.client else None)
    if _ip:
        _ip = _ip.split(',')[0].strip()
    background_tasks.add_task(repositories.record_route_request, db)
    background_tasks.add_task(repositories.record_visit, db, _ip)
    latest_run = repositories.get_latest_successful_run(db)
    _run_id = latest_run.id if latest_run else None
    _cache_key = f"{mode}:{amount_krw}:{amount_btc}:{wallet_utxo_count}:{global_exchange}:{_run_id}"

    def _compute() -> dict:
        # single-flight 하에 1회만 실행된다. HTTPException(422/503)은 예외로 전파되어
        # 캐시되지 않고, blocking_errors/정상 결과만 캐시(run_id 키 → 다음 크롤 시 무효화)된다.
        ticker_rows = repositories.list_ticker_snapshots_for_run(db, latest_run.id) if latest_run else []
        withdrawal_rows = repositories.list_withdrawal_snapshots_for_run(db, latest_run.id) if latest_run else []
        network_rows = repositories.list_network_status_for_run(db, latest_run.id) if latest_run else []
        lightning_swap_rows = repositories.list_lightning_swap_fees_for_run(db, latest_run.id) if latest_run else []
        crawl_errors = repositories.list_crawl_errors_for_run(db, latest_run.id) if latest_run else []
        blocking_errors = []
        if latest_run:
            blocking_errors = [
                {
                    'exchange': row.exchange,
                    'coin': row.coin,
                    'stage': row.stage,
                    'error_message': row.error_message,
                    'created_at': int(row.created_at.timestamp()) if row.created_at else None,
                }
                for row in crawl_errors
                if row.stage in {'withdrawal', 'ticker'} and (
                    row.exchange in {'upbit', 'bithumb', 'korbit', 'coinone', 'gopax', global_exchange.lower()} or row.exchange is None
                )
            ]
            legacy_rows = [row for row in withdrawal_rows if row.exchange in {'upbit', 'bithumb', 'korbit', 'coinone', 'gopax'} and row.source == 'official_docs']
            if legacy_rows:
                blocking_errors.extend([
                    {
                        'exchange': row.exchange,
                        'coin': row.coin,
                        'stage': 'withdrawal',
                        'error_message': '정적 fallback 기반 과거 스냅샷입니다. 최신 스크래핑을 다시 실행하세요.',
                        'created_at': int(row.recorded_at.timestamp()) if row.recorded_at else None,
                    }
                    for row in legacy_rows
                ])
        if blocking_errors:
            return {
                'error': '최신 스크래핑에 실패했거나 정적 fallback 기반 데이터가 포함되어 있어 최적 경로를 계산할 수 없습니다. 수동 크롤링을 다시 실행하세요.',
                'errors': blocking_errors,
                'last_run': {'id': latest_run.id, 'status': latest_run.status, 'completed_at': int(latest_run.completed_at.timestamp()) if latest_run and latest_run.completed_at else None} if latest_run else None,
                'latest_scraping_time': int(latest_run.completed_at.timestamp()) if latest_run and latest_run.completed_at else None,
            }
        if mode == 'sell':
            if amount_btc is None:
                raise HTTPException(status_code=422, detail='sell 모드에는 amount_btc가 필요합니다.')
            exchange_capability_rows = repositories.list_exchange_capabilities_for_run(db, latest_run.id) if latest_run else []
            payload = find_cheapest_sell_path_from_snapshot_rows(
                amount_btc=amount_btc,
                wallet_utxo_count=wallet_utxo_count,
                global_exchange=global_exchange,
                latest_run=latest_run,
                ticker_rows=ticker_rows,
                withdrawal_rows=withdrawal_rows,
                network_rows=network_rows,
                lightning_swap_rows=lightning_swap_rows,
                exchange_capability_rows=exchange_capability_rows,
            )
        else:
            payload = find_cheapest_path_from_snapshot_rows(
                amount_krw=amount_krw,
                global_exchange=global_exchange,
                latest_run=latest_run,
                ticker_rows=ticker_rows,
                withdrawal_rows=withdrawal_rows,
                network_rows=network_rows,
                lightning_swap_rows=lightning_swap_rows,
                usdt_krw_rate=_current_usdt_krw_rate(),
            )
        if payload.get('error'):
            raise HTTPException(status_code=503, detail=payload['error'])
        return _enrich_path_payload_with_kyc(payload, global_exchange)

    return _cheapest_path_cache.get_or_compute(_cache_key, _compute)


def _compute_cheapest_all(
    db: Session,
    *,
    mode: str,
    amount_krw: int,
    amount_btc: float | None,
    wallet_utxo_count: int,
) -> dict:
    """모든 글로벌 거래소 최적 경로를 계산한다(순수 계산부, 캐시/접속로그 제외).

    라우트(get_cheapest_path_all)와 크롤 후 캐시 워밍(warm_cheapest_path_cache)이
    동일 로직을 공유하도록 분리했다. DB 스냅샷 조회는 한 번만 수행한다.
    """
    latest_run = repositories.get_latest_successful_run(db)

    # DB 읽기 1회
    ticker_rows = repositories.list_ticker_snapshots_for_run(db, latest_run.id) if latest_run else []
    withdrawal_rows = repositories.list_withdrawal_snapshots_for_run(db, latest_run.id) if latest_run else []
    network_rows = repositories.list_network_status_for_run(db, latest_run.id) if latest_run else []
    lightning_swap_rows = repositories.list_lightning_swap_fees_for_run(db, latest_run.id) if latest_run else []
    crawl_errors = repositories.list_crawl_errors_for_run(db, latest_run.id) if latest_run else []
    exchange_capability_rows = repositories.list_exchange_capabilities_for_run(db, latest_run.id) if latest_run else []
    notice_rows = repositories.get_all_notices_by_exchange(db)
    exchange_notices = _build_notice_lookup(notice_rows)

    legacy_rows = [
        row for row in withdrawal_rows
        if row.exchange in {'upbit', 'bithumb', 'korbit', 'coinone', 'gopax'} and row.source == 'official_docs'
    ]

    global_exchanges = list(GROUPS['global'])
    # USDT 매수 leg를 김프 평가와 동일한 한국 USDT/KRW 환율로 계산 (환율 차이 아티팩트 제거)
    usdt_krw_rate = _current_usdt_krw_rate()

    by_global: dict[str, object] = {}
    for gex in global_exchanges:
        # 이 거래소에 해당하는 blocking errors 계산
        blocking_errors: list[dict] = []
        if latest_run:
            blocking_errors = [
                {
                    'exchange': row.exchange,
                    'coin': row.coin,
                    'stage': row.stage,
                    'error_message': row.error_message,
                    'created_at': int(row.created_at.timestamp()) if row.created_at else None,
                }
                for row in crawl_errors
                if row.stage in {'withdrawal', 'ticker'} and (
                    row.exchange in {'upbit', 'bithumb', 'korbit', 'coinone', 'gopax', gex.lower()}
                    or row.exchange is None
                )
            ]
            if legacy_rows:
                blocking_errors.extend([
                    {
                        'exchange': row.exchange,
                        'coin': row.coin,
                        'stage': 'withdrawal',
                        'error_message': '정적 fallback 기반 과거 스냅샷입니다. 최신 스크래핑을 다시 실행하세요.',
                        'created_at': int(row.recorded_at.timestamp()) if row.recorded_at else None,
                    }
                    for row in legacy_rows
                ])

        if blocking_errors:
            by_global[gex] = {
                'error': '최신 스크래핑에 실패했거나 정적 fallback 기반 데이터가 포함되어 있어 최적 경로를 계산할 수 없습니다. 수동 크롤링을 다시 실행하세요.',
                'errors': blocking_errors,
                'last_run': _serialize_run(latest_run),
                'latest_scraping_time': int(latest_run.completed_at.timestamp()) if latest_run and latest_run.completed_at else None,
            }
            continue

        try:
            if mode == 'sell':
                if amount_btc is None:
                    by_global[gex] = {'error': 'sell 모드에는 amount_btc가 필요합니다.'}
                    continue
                payload = find_cheapest_sell_path_from_snapshot_rows(
                    amount_btc=amount_btc,
                    wallet_utxo_count=wallet_utxo_count,
                    global_exchange=gex,
                    latest_run=latest_run,
                    ticker_rows=ticker_rows,
                    withdrawal_rows=withdrawal_rows,
                    network_rows=network_rows,
                    lightning_swap_rows=lightning_swap_rows,
                    exchange_capability_rows=exchange_capability_rows,
                )
            else:
                payload = find_cheapest_path_from_snapshot_rows(
                    amount_krw=amount_krw,
                    global_exchange=gex,
                    latest_run=latest_run,
                    ticker_rows=ticker_rows,
                    withdrawal_rows=withdrawal_rows,
                    network_rows=network_rows,
                    lightning_swap_rows=lightning_swap_rows,
                    usdt_krw_rate=usdt_krw_rate,
                )
            if payload.get('error'):
                by_global[gex] = payload
            else:
                enriched = _enrich_path_payload_with_kyc(payload, gex)
                by_global[gex] = _enrich_disabled_paths_with_notices(enriched, exchange_notices)
        except Exception as exc:
            logger.warning('cheapest-all: error for %s: %s', gex, exc)
            by_global[gex] = {'error': str(exc)}

    return {
        'by_global': by_global,
        'last_run': _serialize_run(latest_run),
        'latest_scraping_time': int(latest_run.completed_at.timestamp()) if latest_run and latest_run.completed_at else None,
    }


# 캐시 워밍에 사용할 대표 금액 프리셋(원). 사용자가 자주 입력하는 단위 금액.
WARM_AMOUNT_PRESETS_KRW = (100_000, 500_000, 1_000_000, 5_000_000, 10_000_000)


def warm_cheapest_path_cache(db: Session) -> int:
    """대표 금액 프리셋에 대해 cheapest-all 결과를 미리 계산해 캐시에 채운다.

    크롤 성공 직후 호출하면 인기 금액의 콜드스타트/만료 미스를 선제 제거한다.
    캐시 키 형식은 라우트(get_cheapest_path_all)와 동일하게 맞춘다.
    반환: 워밍에 성공한 프리셋 개수.
    """
    latest_run = repositories.get_latest_successful_run(db)
    run_id = latest_run.id if latest_run else None
    warmed = 0
    for amount_krw in WARM_AMOUNT_PRESETS_KRW:
        cache_key = f"all:buy:{amount_krw}:None:1:{run_id}"
        try:
            result = _compute_cheapest_all(
                db,
                mode='buy',
                amount_krw=amount_krw,
                amount_btc=None,
                wallet_utxo_count=1,
            )
            _cheapest_path_cache.set(cache_key, result)
            warmed += 1
        except Exception as exc:
            logger.warning('cheapest-all 캐시 워밍 실패 (amount_krw=%s): %s', amount_krw, exc)
    return warmed


@router.get('/path-finder/cheapest-all')
def get_cheapest_path_all(
    request: Request,
    background_tasks: BackgroundTasks,
    amount_krw: int = Query(1000000, ge=10000),
    amount_btc: float | None = Query(None, gt=0),
    wallet_utxo_count: int = Query(1, ge=1, le=200),
    mode: str = Query('buy'),
    db: Session = Depends(get_db),
) -> dict:
    """모든 글로벌 거래소에 대해 최적 경로를 한 번에 계산해 반환한다.

    캐시 히트면 즉시 반환, 미스면 single-flight로 동시 요청을 1회 계산으로 병합한다.
    반환 형태: {"by_global": {<exchange>: <payload or error>}, "last_run": {...}, "latest_scraping_time": ...}
    """
    _ip = request.headers.get('x-forwarded-for', request.client.host if request.client else None)
    if _ip:
        _ip = _ip.split(',')[0].strip()
    background_tasks.add_task(repositories.record_route_request, db)
    background_tasks.add_task(repositories.record_visit, db, _ip)
    latest_run = repositories.get_latest_successful_run(db)
    _run_id = latest_run.id if latest_run else None
    _cache_key = f"all:{mode}:{amount_krw}:{amount_btc}:{wallet_utxo_count}:{_run_id}"
    return _cheapest_path_cache.get_or_compute(
        _cache_key,
        lambda: _compute_cheapest_all(
            db,
            mode=mode,
            amount_krw=amount_krw,
            amount_btc=amount_btc,
            wallet_utxo_count=wallet_utxo_count,
        ),
    )


@router.get('/path-finder/inspect')
def get_path_inspect(
    amount_krw: int = Query(1000000, ge=10000),
    db: Session = Depends(get_db),
) -> dict:
    """cheapest-all 경로를 계산하고 각 경로의 invariant를 검사한다.

    어드민 진단 도구. 비정상 경로(음수 수수료, btc_received=0 등)를 조기 발견.
    """
    result_map = _compute_cheapest_all(
        db,
        mode='buy',
        amount_krw=amount_krw,
        amount_btc=None,
        wallet_utxo_count=1,
    )
    all_paths: list[dict] = []
    for payload in result_map.get('by_global', {}).values():
        if isinstance(payload, dict):
            all_paths.extend(payload.get('all_paths', []))

    inspect_results = _inspect_all(all_paths)
    results = [
        {
            'path_id': r.path_id,
            'severity': r.severity,
            'issues': r.issues,
        }
        for r in inspect_results
    ]
    total = len(results)
    ok = sum(1 for r in inspect_results if r.severity == 'ok')
    warnings = sum(1 for r in inspect_results if r.severity == 'warning')
    errors = sum(1 for r in inspect_results if r.severity == 'error')
    return {
        'results': results,
        'summary': {'total': total, 'ok': ok, 'warnings': warnings, 'errors': errors},
    }
