import asyncio
import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests as _requests
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from backend.app.db import repositories
from backend.app.db.session import get_db
from backend.app.services import kyc_registry
from backend.app.services.cache import _TtlCache
from backend.app.services.exchange_status_builder import build_exchange_status
from backend.app.domain.paths_buy import find_cheapest_path_from_snapshot_rows
from backend.app.domain.paths_sell import find_cheapest_sell_path_from_snapshot_rows
from backend.app.domain.market_core import (
    GROUPS,
    KOREA_FETCHERS,
    get_withdrawal_source_url,
    fetch_binance_spot,
    fetch_usd_krw_rate,
)
from backend.app.domain.route_inspect import inspect_all as _inspect_all

logger = logging.getLogger(__name__)

router = APIRouter()


_status_cache = _TtlCache(ttl=60)
# 키에 run_id가 포함되어 새 크롤이 나오면 키 자체가 바뀌고, 크롤 후
# invalidate_status_cache()가 clear()까지 하므로 TTL을 길게 잡아도 stale 위험이 없다.
_cheapest_path_cache = _TtlCache(ttl=3600)

# Upbit USDT/KRW 실시간 환율 캐시 (30초 TTL)
_usd_krw_cache: dict = {'rate': None, 'ts': 0.0}
_USD_KRW_CACHE_TTL = 30


def _fetch_usd_krw_realtime() -> float:
    """Upbit USDT/KRW 실시간 환율 조회. 30초 캐시 적용.

    Upbit KRW-USDT 체결가를 USD/KRW 기준값으로 사용한다.
    실패 시 Dunamu API → open.er-api.com fallback.
    """
    now = time.time()
    if _usd_krw_cache['rate'] is not None and now - _usd_krw_cache['ts'] < _USD_KRW_CACHE_TTL:
        return float(_usd_krw_cache['rate'])
    try:
        r = _requests.get(
            'https://api.upbit.com/v1/ticker?markets=KRW-USDT',
            timeout=5,
        )
        r.raise_for_status()
        rate = float(r.json()[0]['trade_price'])
    except Exception:
        rate = float(fetch_usd_krw_rate())
    _usd_krw_cache['rate'] = rate
    _usd_krw_cache['ts'] = now
    return rate


# 백그라운드 polling으로 갱신되는 kimp 최신 데이터
_kimp_latest: dict | None = None


def _current_usdt_krw_rate() -> float | None:
    """USDT 매수 leg에 쓸 한국 USDT/KRW 환율(업비트 USDT 체결가).

    김프 평가와 동일한 환율을 경로 계산에 주입해 "테더/원달러 환율 차이"
    아티팩트를 제거한다. 폴링값 우선, 없으면 실시간 조회. 실패 시 None
    (이 경우 컨텍스트가 포렉스 환율로 폴백).
    """
    if _kimp_latest and _kimp_latest.get('usd_krw_rate'):
        return float(_kimp_latest['usd_krw_rate'])
    try:
        return float(_fetch_usd_krw_realtime())
    except Exception:
        return None


def invalidate_status_cache() -> None:
    _status_cache.invalidate('status')
    _cheapest_path_cache.clear()


def _ts(dt_val) -> int | None:
    """datetime → unix timestamp (초). None이면 None 반환."""
    return int(dt_val.timestamp()) if dt_val else None


def _serialize_run(run) -> dict | None:
    """CrawlRun 객체를 직렬화 딕셔너리로 변환."""
    if run is None:
        return None
    return {
        'id': run.id,
        'status': run.status,
        'completed_at': _ts(run.completed_at),
        'started_at': _ts(run.started_at) if hasattr(run, 'started_at') else None,
    }


def _build_notice_lookup(notice_rows: list) -> dict[str, list[dict]]:
    lookup: dict[str, list[dict]] = {}
    for row in notice_rows:
        lookup.setdefault(row.exchange, []).append({
            'title': row.title,
            'url': row.url,
            'published_at': row.published_at,
        })
    return lookup


def _find_notice(exchange: str, coin: str, network: str, notice_lookup: dict) -> dict | None:
    notices = notice_lookup.get(exchange, [])
    n_lower = network.lower()
    # coin 이름은 너무 광범위 — 네트워크 특화 키워드만 사용
    if 'trc20' in n_lower:
        keywords = {'trc20', 'tron'}
    elif 'erc20' in n_lower:
        keywords = {'erc20', 'ethereum', 'eth'}
    elif 'bitcoin' in n_lower or coin.lower() == 'btc':
        keywords = {'btc', 'bitcoin', '비트코인'}
    elif 'kaia' in n_lower:
        keywords = {'kaia', 'klay', 'klaytn'}
    else:
        keywords = {n_lower}
    for notice in notices:
        title = (notice.get('title') or '').lower()
        if any(kw in title for kw in keywords):
            return notice
    return None


def _enrich_disabled_paths_with_notices(payload: dict, exchange_notices: dict) -> dict:
    def _attach(entry: dict) -> None:
        notice = _find_notice(
            entry.get('korean_exchange', ''),
            entry.get('transfer_coin', ''),
            entry.get('network', ''),
            exchange_notices,
        )
        entry['notice_url'] = notice.get('url') if notice else None
        entry['notice_published_at'] = notice.get('published_at') if notice else None
        entry['notice_title'] = notice.get('title') if notice else None

    for dp in payload.get('disabled_paths', []):
        _attach(dp)
    # all_paths의 disabled 항목에도 공지 첨부
    for path in payload.get('all_paths', []):
        if path.get('disabled'):
            _attach(path)
    return payload


def _enrich_path_payload_with_kyc(payload: dict, global_exchange: str) -> dict:
    registry = kyc_registry.get_kyc_registry()
    for path in payload.get('all_paths', []):
        path['domestic_kyc_status'] = kyc_registry.resolve_exchange_asset_kyc_status(
            path.get('korean_exchange'),
            path.get('transfer_coin'),
            registry=registry,
        )
        # 글로벌 거래소를 실제로 경유하는 경로만 global_kyc_status를 채운다.
        # 직접 출금(btc_direct/lightning_direct)은 해외 거래소를 거치지 않으므로 None.
        # USDT 경로는 항상 글로벌 경유(buy 모드에선 route_variant 미설정이라 transfer_coin도 함께 본다).
        uses_global = (
            path.get('transfer_coin') == 'USDT'
            or (path.get('route_variant') or '').endswith('via_global')
        )
        if uses_global:
            global_asset = 'BTC' if path.get('transfer_coin') == 'BTC' else 'USDT'
            path['global_kyc_status'] = kyc_registry.resolve_exchange_asset_kyc_status(
                global_exchange,
                global_asset,
                registry=registry,
            )
        else:
            path['global_kyc_status'] = None
        path['exit_service_kyc_status'] = kyc_registry.resolve_service_kyc_status(
            path.get('lightning_exit_provider') or path.get('swap_service'),
            registry=registry,
        )
        path['wallet_kyc_status'] = 'non_kyc'
    return payload


@router.get('/tickers/latest')
def get_latest_tickers(db: Session = Depends(get_db)) -> dict:
    latest_run = repositories.get_latest_successful_run(db)
    if latest_run is None:
        return {'last_run': None, 'items': []}
    rows = repositories.list_ticker_snapshots_for_run(db, latest_run.id)
    return {
        'last_run': _serialize_run(latest_run),
        'items': [
            {
                'exchange': row.exchange,
                'pair': row.pair,
                'market_type': row.market_type,
                'currency': row.currency,
                'price': row.price,
                'high_24h': row.high_24h,
                'low_24h': row.low_24h,
                'volume_24h_btc': row.volume_24h_btc,
                'maker_fee_pct': row.maker_fee_pct,
                'taker_fee_pct': row.taker_fee_pct,
                'maker_fee_usd': row.maker_fee_usd,
                'maker_fee_krw': row.maker_fee_krw,
                'taker_fee_usd': row.taker_fee_usd,
                'taker_fee_krw': row.taker_fee_krw,
                'usd_krw_rate': row.usd_krw_rate,
            }
            for row in rows
        ],
    }


@router.get('/withdrawal-fees/latest')
def get_latest_withdrawals(exchange: str | None = None, coin: str | None = None, db: Session = Depends(get_db)) -> dict:
    latest_run = repositories.get_latest_successful_run(db)
    if latest_run is None:
        return {'last_run': None, 'latest_scraping_time': None, 'items': [], 'errors': []}
    rows = repositories.list_withdrawal_snapshots_for_run(db, latest_run.id)
    errors = repositories.list_crawl_errors_for_run(db, latest_run.id, stage='withdrawal')
    if exchange:
        rows = [row for row in rows if row.exchange == exchange.lower()]
        errors = [row for row in errors if row.exchange == exchange.lower()]
    if coin:
        rows = [row for row in rows if row.coin == coin.upper()]
        errors = [row for row in errors if row.coin == coin.upper()]
    legacy_rows = [row for row in rows if row.source == 'official_docs']
    return {
        'last_run': _serialize_run(latest_run),
        'latest_scraping_time': _ts(latest_run.completed_at),
        'items': [
            {
                'exchange': row.exchange,
                'coin': row.coin,
                'source': row.source,
                'network_label': row.network_label,
                'fee': row.fee,
                'fee_usd': row.fee_usd,
                'fee_krw': row.fee_krw,
                'min_withdrawal': row.min_withdrawal,
                'max_withdrawal': row.max_withdrawal,
                'enabled': row.enabled,
                'note': row.note,
                'source_url': get_withdrawal_source_url(row.exchange, row.coin, row.network_label),
                'recorded_at': _ts(row.recorded_at),
            }
            for row in rows
        ],
        'errors': [
            {
                'exchange': row.exchange,
                'coin': row.coin,
                'stage': row.stage,
                'error_message': row.error_message,
                'created_at': _ts(row.created_at),
            }
            for row in errors
        ] + [
            {
                'exchange': row.exchange,
                'coin': row.coin,
                'stage': 'withdrawal',
                'error_message': '정적 fallback 기반 과거 스냅샷입니다. 최신 스크래핑을 다시 실행하세요.',
                'created_at': _ts(row.recorded_at),
            }
            for row in legacy_rows
        ],
    }


@router.get('/network-status/latest')
def get_latest_network_status(db: Session = Depends(get_db)) -> dict:
    latest_run = repositories.get_latest_successful_run(db)
    if latest_run is None:
        return {'last_run': None, 'exchanges': {}, 'total_suspended': 0}
    rows = repositories.list_network_status_for_run(db, latest_run.id)
    grouped = repositories.group_network_status(rows)
    return {
        'last_run': {'id': latest_run.id, 'status': latest_run.status, 'completed_at': int(latest_run.completed_at.timestamp()) if latest_run.completed_at else None},
        'exchanges': grouped,
        'total_suspended': sum(len(item['suspended_networks']) for item in grouped.values()),
    }


@router.get('/lightning-swap-fees/latest')
def get_latest_lightning_swap_fees(db: Session = Depends(get_db)) -> dict:
    latest_run = repositories.get_latest_successful_run(db)
    if latest_run is None:
        return {'last_run': None, 'items': []}
    rows = repositories.list_lightning_swap_fees_for_run(db, latest_run.id)
    return {
        'last_run': {'id': latest_run.id, 'status': latest_run.status, 'completed_at': int(latest_run.completed_at.timestamp()) if latest_run.completed_at else None},
        'items': [
            {
                'service_name': row.service_name,
                'fee_pct': row.fee_pct,
                'fee_fixed_sat': row.fee_fixed_sat,
                'min_amount_sat': row.min_amount_sat,
                'max_amount_sat': row.max_amount_sat,
                'enabled': row.enabled,
                'source_url': row.source_url,
                'error_message': row.error_message,
                'recorded_at': int(row.recorded_at.timestamp()) if row.recorded_at else None,
            }
            for row in rows
        ],
    }


@router.get('/exchange-capabilities/latest')
def get_latest_exchange_capabilities(db: Session = Depends(get_db)) -> dict:
    latest_run = repositories.get_latest_successful_run(db)
    if latest_run is None:
        return {'last_run': None, 'items': []}
    rows = repositories.list_exchange_capabilities_for_run(db, latest_run.id)
    return {
        'last_run': _serialize_run(latest_run),
        'items': [
            {
                'exchange': row.exchange,
                'supports_lightning_deposit': row.supports_lightning_deposit,
                'supports_lightning_withdrawal': row.supports_lightning_withdrawal,
            }
            for row in rows
        ],
    }


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


@router.get('/scrape-status')
def get_scrape_status(db: Session = Depends(get_db)) -> dict:
    latest_run = repositories.get_latest_successful_run(db)
    if latest_run is None:
        return {'last_run': None, 'items': []}

    items = []
    crawl_errors = repositories.list_crawl_errors_for_run(db, latest_run.id)
    error_stages = {(e.exchange, e.stage): e.error_message for e in crawl_errors}

    # 1. NetworkStatusSnapshot source_url
    network_rows = repositories.list_network_status_for_run(db, latest_run.id)
    seen_urls: set[str] = set()
    for row in network_rows:
        if row.source_url and row.source_url not in seen_urls:
            seen_urls.add(row.source_url)
            has_error = (row.exchange, 'network_status') in error_stages
            items.append({
                'label': f'{row.exchange} 네트워크 상태',
                'url': row.source_url,
                'category': 'network_status',
                'status': 'error' if has_error else 'ok',
                'last_crawled_at': int(row.recorded_at.timestamp()) if row.recorded_at else None,
                'error_message': error_stages.get((row.exchange, 'network_status')),
            })

    # 2. LightningSwapFeeSnapshot source_url
    lightning_rows = repositories.list_lightning_swap_fees_for_run(db, latest_run.id)
    for row in lightning_rows:
        if row.source_url:
            has_error = not row.enabled or bool(row.error_message)
            items.append({
                'label': row.service_name,
                'url': row.source_url,
                'category': 'lightning',
                'status': 'error' if has_error else 'ok',
                'last_crawled_at': int(row.recorded_at.timestamp()) if row.recorded_at else None,
                'error_message': row.error_message,
            })

    # 3. WithdrawalFeeSnapshot - 거래소별 소스 URL
    withdrawal_rows = repositories.list_withdrawal_snapshots_for_run(db, latest_run.id)
    seen_exchanges: set[str] = set()
    for row in withdrawal_rows:
        if row.exchange not in seen_exchanges:
            seen_exchanges.add(row.exchange)
            source_url = get_withdrawal_source_url(row.exchange, row.coin, row.network_label)
            if source_url:
                has_error = (row.exchange, 'withdrawal') in error_stages
                items.append({
                    'label': f'{row.exchange} 출금 수수료',
                    'url': source_url,
                    'category': 'withdrawal',
                    'status': 'error' if has_error else 'ok',
                    'last_crawled_at': int(row.recorded_at.timestamp()) if row.recorded_at else None,
                    'error_message': error_stages.get((row.exchange, 'withdrawal')),
                })

    return {
        'last_run': {
            'id': latest_run.id,
            'status': latest_run.status,
            'completed_at': int(latest_run.completed_at.timestamp()) if latest_run.completed_at else None,
        },
        'items': items,
    }


@router.get('/crawl-status')
def get_crawl_status(db: Session = Depends(get_db)) -> dict:
    """거래소별 최신 크롤 결과 (Pass/Fail/Error 요약)."""
    from backend.app.domain.market_core import GROUPS

    all_exchanges = list(GROUPS['korea']) + list(GROUPS['global'])

    # 가장 최근 3개 run 조회
    runs = repositories.list_crawl_runs(db, limit=3)
    latest = runs[0] if runs else None

    if latest is None:
        return {'last_run': None, 'exchanges': [], 'running': False}

    is_running = latest.status == 'running'

    # 에러 목록
    errors_by_exchange: dict[str, list[str]] = {}
    for e in repositories.list_crawl_errors_for_run(db, latest.id):
        errors_by_exchange.setdefault(e.exchange or '__global__', []).append(
            f'{e.stage}: {e.error_message}'
        )

    # 티커 스냅샷 존재 여부
    ticker_rows = repositories.list_ticker_snapshots_for_run(db, latest.id)
    has_ticker: set[str] = {r.exchange for r in ticker_rows}

    # 출금 스냅샷 존재 여부 (coin별)
    withdrawal_rows = repositories.list_withdrawal_snapshots_for_run(db, latest.id)
    has_btc_wd: set[str] = {r.exchange for r in withdrawal_rows if r.coin == 'BTC'}
    has_usdt_wd: set[str] = {r.exchange for r in withdrawal_rows if r.coin == 'USDT'}

    # 데이터 갭: 출금이 활성(enabled)인데 수수료가 비어 경로 계산에서 제외되는 행 (조치 필요)
    # 예: okx Lightning Network — enabled=True 이지만 fee=None 이면 라이트닝 경로가 생성되지 않음
    data_gaps = [
        {
            'exchange': r.exchange,
            'coin': r.coin,
            'network_label': r.network_label,
            'issue': '출금 활성이지만 수수료 미수집',
        }
        for r in withdrawal_rows
        if r.enabled and r.fee is None
    ]
    data_gaps.sort(key=lambda g: (g['exchange'], g['coin'], g['network_label'] or ''))

    result_exchanges = []
    for ex in all_exchanges:
        errs = errors_by_exchange.get(ex, [])
        result_exchanges.append({
            'exchange': ex,
            'group': 'korea' if ex in GROUPS['korea'] else 'global',
            'ticker':   'pass' if ex in has_ticker  else ('error' if any('ticker' in e for e in errs) else 'missing'),
            'btc_wd':   'pass' if ex in has_btc_wd  else ('error' if any('withdrawal' in e for e in errs) else 'missing'),
            'usdt_wd':  'pass' if ex in has_usdt_wd else ('error' if any('withdrawal' in e for e in errs) else 'missing'),
            'errors':   errs,
        })

    return {
        'running': is_running,
        'last_run': {
            'id': latest.id,
            'status': latest.status,
            'trigger': latest.trigger,
            'message': latest.message,
            'started_at': int(latest.started_at.timestamp()) if latest.started_at else None,
            'completed_at': int(latest.completed_at.timestamp()) if latest.completed_at else None,
            'usd_krw_rate': latest.usd_krw_rate,
        },
        'exchanges': result_exchanges,
        'data_gaps': data_gaps,
    }


@router.get('/status')
def get_exchange_status(db: Session = Depends(get_db)) -> dict:
    """출금 수수료 + 네트워크 상태 + 공지사항 통합 뷰"""
    # single-flight: 캐시 만료 직후 동시 요청을 1회 계산으로 병합
    return _status_cache.get_or_compute('status', lambda: build_exchange_status(db))


@router.get('/notices/latest')
def get_latest_notices(limit: int = Query(5, ge=1, le=20), db: Session = Depends(get_db)) -> dict:
    """BTC/USDT/Lightning 관련 최신 공지사항 반환"""
    rows = repositories.get_latest_relevant_notices(db, limit=limit)
    return {
        'items': [
            {
                'exchange': row.exchange,
                'title': row.title,
                'url': row.url,
                'published_at': int(row.published_at.timestamp()) if row.published_at else None,
                'noticed_at': int(row.noticed_at.timestamp()) if row.noticed_at else None,
            }
            for row in rows
        ]
    }


@router.get('/network-changes/recent')
def get_recent_network_changes(hours: int = Query(24, ge=1, le=72), db: Session = Depends(get_db)) -> dict:
    """최근 N시간 내 네트워크 상태 변경(출금 정지/재개) 목록 + 관련 공지 반환"""
    items = repositories.get_recent_network_changes(db, hours=hours)
    return {'items': items}


def _fetch_kimp_data() -> dict | None:
    """한국 거래소 + Binance 실시간 호출로 kimp 계산. 실패 시 None 반환.

    환율은 Upbit USDT/KRW 실시간 체결가 기준 (30초 TTL 캐시).
    국내 거래소의 USDT/KRW 실거래가를 기준으로 삼으면 거래소별 USDT 수급 차이(역테더 프리미엄)가
    섞여 들어가 "글로벌 시세 대비 국내 시세 괴리"라는 본래 의미가 흐려지므로 채택하지 않는다.
    """
    def _fetch_korea(exchange: str) -> tuple[str, float | None]:
        try:
            btc_price = float(KOREA_FETCHERS[exchange]()['price'])
        except Exception:
            btc_price = None
        return exchange, btc_price

    def _fetch_global() -> tuple[float | None, float | None, float | None]:
        try:
            btc_usd = float(fetch_binance_spot()['price'])
            usd_krw = _fetch_usd_krw_realtime()  # 업비트 USDT/KRW (김프 환율 기준)
            try:
                forex = float(fetch_usd_krw_rate())  # 두나무 원달러 포렉스
            except Exception:
                forex = None
            return btc_usd, usd_krw, forex
        except Exception:
            return None, None, None

    with ThreadPoolExecutor(max_workers=6) as executor:
        korea_futures = {executor.submit(_fetch_korea, ex): ex for ex in KOREA_FETCHERS}
        global_future = executor.submit(_fetch_global)

        korea_btc_prices: dict[str, float] = {}
        for fut in as_completed(korea_futures):
            ex, btc_price = fut.result()
            if btc_price is not None:
                korea_btc_prices[ex] = btc_price

        btc_usd, usd_krw, forex = global_future.result()

    if btc_usd is None or usd_krw is None or not korea_btc_prices:
        return None

    global_btc_price_krw = btc_usd * usd_krw
    kimp: dict[str, float] = {
        ex: round((price / global_btc_price_krw - 1) * 100, 4)
        for ex, price in korea_btc_prices.items()
    }
    # 원달러 프리미엄 = 업비트 USDT/KRW ÷ 두나무 포렉스 − 1 (테더 프리미엄, 단일 시장값)
    usdt_premium = round((usd_krw / forex - 1) * 100, 4) if forex else None
    # 김치 프리미엄(총) = 한국 BTC(KRW) ÷ (글로벌 BTC(USD) × 두나무 포렉스) − 1
    # = (1 + 비트코인 프리미엄)(1 + 테더 프리미엄) − 1. 포렉스 없으면 계산 불가.
    kimchi_premium_total: dict[str, float] = (
        {ex: round((price / (btc_usd * forex) - 1) * 100, 4) for ex, price in korea_btc_prices.items()}
        if forex else {}
    )
    return {
        'kimp': kimp,
        'kimchi_premium_total': kimchi_premium_total,
        'korean_btc_prices': korea_btc_prices,
        'global_btc_price_krw': round(global_btc_price_krw),
        'usd_krw_rate': round(usd_krw, 2),
        'forex_usd_krw_rate': round(forex, 2) if forex else None,
        'usdt_premium': usdt_premium,
        'fetched_at': int(time.time()),
    }


async def kimp_poll_loop(interval: int = 10) -> None:
    """백그라운드에서 주기적으로 kimp 데이터를 갱신한다."""
    global _kimp_latest
    loop = asyncio.get_event_loop()
    while True:
        try:
            result = await loop.run_in_executor(None, _fetch_kimp_data)
            if result is not None:
                _kimp_latest = result
        except Exception as exc:
            logger.warning('kimp poll failed: %s', exc)
        await asyncio.sleep(interval)


@router.get('/kimp/live')
def get_live_kimp() -> dict:
    """백그라운드 polling으로 갱신된 최신 kimp 데이터 반환."""
    if _kimp_latest is None:
        raise HTTPException(status_code=503, detail='kimp 데이터 수집 중입니다. 잠시 후 다시 시도하세요.')
    return _kimp_latest


@router.get('/carf-exchanges')
def get_carf_exchanges(db: Session = Depends(get_db)) -> dict:
    """CARF 거래소 정보 목록 반환"""
    import json
    rows = repositories.list_carf_exchanges(db)
    exchanges = []
    for r in rows:
        exchanges.append({
            'id': r.id,
            'name': r.name,
            'shortName': r.short_name,
            'type': r.type,
            'registeredCountry': r.registered_country,
            'carfGroup': r.carf_group,
            'carfDataCollectionStart': r.carf_data_collection_start,
            'carfFirstExchange': r.carf_first_exchange,
            'koreaService': r.korea_service,
            'koreaBlocked': r.korea_blocked,
            'koreaImpact': r.korea_impact,
            'impactDetail': r.impact_detail,
            'travelRuleKorea': r.travel_rule_korea,
            'travelRuleNote': r.travel_rule_note,
            'koreaUserJurisdiction': r.korea_user_jurisdiction,
            'koreaUserJurisdictionNote': r.korea_user_jurisdiction_note,
            'mapLocation': json.loads(r.map_location_json) if r.map_location_json else None,
            'sources': json.loads(r.sources_json) if r.sources_json else None,
        })
    return {'exchanges': exchanges}


@router.get('/exchange-volumes')
def get_exchange_volumes(db: Session = Depends(get_db)) -> dict:
    """거래소별 24H/7D/30D 거래량 반환 (DB 기반, 크롤링 시 하루 1회 갱신).

    - volume_24h_usd: 24시간 거래량 (USD)
    - volume_7d_usd : 7일 거래량 추정 (24H × 7)
    - volume_30d_usd: 30일 거래량 추정 (24H × 30)
    - trust_rank    : CoinGecko 신뢰도 순위
    - recorded_at   : 마지막 갱신 시각 (unix timestamp)
    """
    rows = repositories.get_latest_exchange_volumes(db)
    volumes: dict[str, dict] = {}
    for r in rows:
        vol24 = r.volume_24h_usd
        volumes[r.exchange] = {
            'volume_24h_btc': r.volume_24h_btc,
            'volume_24h_usd': vol24,
            'volume_7d_usd':  round(vol24 * 7)  if vol24 else None,
            'volume_30d_usd': round(vol24 * 30) if vol24 else None,
            'trust_score': r.trust_score,
            'trust_rank':  r.trust_rank,
            'recorded_at': int(r.recorded_at.timestamp()) if r.recorded_at else None,
        }
    return {'volumes': volumes}


@router.get('/withdrawal-limits/latest')
def get_withdrawal_limits(db: Session = Depends(get_db)) -> dict:
    """국내 거래소 출금 한도 반환 (크롤 데이터 우선, 정적 데이터 fallback).

    - krw_per_tx_limit    : 트래블룰 1회 KRW 제한 (null=제한없음)
    - btc_per_tx_max      : 1회 최대 BTC (null=제한없음)
    - btc_daily_verified  : KYC 인증 완료 일일 BTC 한도 (정적 추정)
    - krw_daily_verified_digital: 크롤링된 일일 디지털 자산 KRW 한도 (null=미수집)
    - source              : playwright / static
    - scraped_at          : 크롤 시각 (unix timestamp, null=정적)
    """
    from backend.app.domain.korea_exchange_registry import WITHDRAWAL_LIMITS  # noqa: PLC0415

    scraped_rows = repositories.get_latest_korea_withdrawal_limits(db)
    scraped_by_exchange: dict[str, object] = {r.exchange: r for r in scraped_rows}

    result: dict[str, dict] = {}
    for exchange, static_lim in WITHDRAWAL_LIMITS.items():
        db_row = scraped_by_exchange.get(exchange)
        result[exchange] = {
            'krw_per_tx_limit': static_lim.krw_per_tx_limit,
            'btc_per_tx_max': static_lim.btc_per_tx_max,
            'btc_daily_verified': static_lim.btc_daily_verified,
            'krw_daily_verified_digital': db_row.krw_daily_verified_digital if db_row else None,
            'source': db_row.source if db_row else 'static',
            'scraped_at': int(db_row.recorded_at.timestamp()) if db_row else None,
        }
    return {'limits': result}
