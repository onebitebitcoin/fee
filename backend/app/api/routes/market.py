import time

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.app.db import repositories
from backend.app.db.session import get_db
from backend.app.services import kyc_registry
from backend.app.services.exchange_status_builder import build_exchange_status
from backend.app.services.live_market import (
    find_cheapest_path_from_snapshot_rows,
    find_cheapest_sell_path_from_snapshot_rows,
)
from backend.app.domain.market_core import get_withdrawal_source_url

router = APIRouter()

class _TtlCache:
    def __init__(self, ttl: int):
        self._ttl = ttl
        self._store: dict = {}

    def get(self, key: str):
        entry = self._store.get(key)
        if entry and time.time() - entry['ts'] < self._ttl:
            return entry['data']
        return None

    def set(self, key: str, data) -> None:
        self._store[key] = {'data': data, 'ts': time.time()}

    def invalidate(self, key: str) -> None:
        self._store.pop(key, None)


_status_cache = _TtlCache(ttl=60)


def _get_status_cache() -> dict | None:
    return _status_cache.get('status')


def _set_status_cache(data: dict) -> None:
    _status_cache.set('status', data)


def invalidate_status_cache() -> None:
    _status_cache.invalidate('status')


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


def _enrich_path_payload_with_kyc(payload: dict, global_exchange: str) -> dict:
    registry = kyc_registry.get_kyc_registry()
    for path in payload.get('all_paths', []):
        path['domestic_kyc_status'] = kyc_registry.resolve_exchange_asset_kyc_status(
            path.get('korean_exchange'),
            path.get('transfer_coin'),
            registry=registry,
        )
        global_asset = 'BTC' if path.get('transfer_coin') == 'BTC' else 'USDT'
        path['global_kyc_status'] = kyc_registry.resolve_exchange_asset_kyc_status(
            global_exchange,
            global_asset,
            registry=registry,
        )
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
    amount_krw: int = Query(1000000, ge=10000),
    amount_btc: float | None = Query(None, gt=0),
    wallet_utxo_count: int = Query(1, ge=1, le=200),
    mode: str = Query('buy'),
    global_exchange: str = Query('binance'),
    db: Session = Depends(get_db),
) -> dict:
    repositories.record_access(db)
    latest_run = repositories.get_latest_successful_run(db)
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
        )
    if payload.get('error'):
        raise HTTPException(status_code=503, detail=payload['error'])
    return _enrich_path_payload_with_kyc(payload, global_exchange)


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


@router.get('/status')
def get_exchange_status(db: Session = Depends(get_db)) -> dict:
    """출금 수수료 + 네트워크 상태 + 공지사항 통합 뷰"""
    cached = _get_status_cache()
    if cached is not None:
        return cached

    result = build_exchange_status(db)
    _set_status_cache(result)
    return result


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
