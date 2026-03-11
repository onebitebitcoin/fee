from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.app.db import repositories
from backend.app.db.session import get_db
from backend.app.services.live_market import find_cheapest_path_from_snapshot_rows
from backend.app.domain.market_core import get_withdrawal_source_url

router = APIRouter()


@router.get('/tickers/latest')
def get_latest_tickers(db: Session = Depends(get_db)) -> dict:
    latest_run = repositories.get_latest_successful_run(db)
    if latest_run is None:
        return {'last_run': None, 'items': []}
    rows = repositories.list_ticker_snapshots_for_run(db, latest_run.id)
    return {
        'last_run': {'id': latest_run.id, 'status': latest_run.status, 'completed_at': int(latest_run.completed_at.timestamp()) if latest_run.completed_at else None},
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
        'last_run': {'id': latest_run.id, 'status': latest_run.status, 'completed_at': int(latest_run.completed_at.timestamp()) if latest_run.completed_at else None},
        'latest_scraping_time': int(latest_run.completed_at.timestamp()) if latest_run.completed_at else None,
        'items': [
            {
                'exchange': row.exchange,
                'coin': row.coin,
                'source': row.source,
                'network_label': row.network_label,
                'fee': row.fee,
                'fee_usd': row.fee_usd,
                'fee_krw': row.fee_krw,
                'enabled': row.enabled,
                'note': row.note,
                'source_url': get_withdrawal_source_url(row.exchange, row.coin, row.network_label),
                'recorded_at': int(row.recorded_at.timestamp()) if row.recorded_at else None,
            }
            for row in rows
        ],
        'errors': [
            {
                'exchange': row.exchange,
                'coin': row.coin,
                'stage': row.stage,
                'error_message': row.error_message,
                'created_at': int(row.created_at.timestamp()) if row.created_at else None,
            }
            for row in errors
        ] + [
            {
                'exchange': row.exchange,
                'coin': row.coin,
                'stage': 'withdrawal',
                'error_message': '정적 fallback 기반 과거 스냅샷입니다. 최신 스크래핑을 다시 실행하세요.',
                'created_at': int(row.recorded_at.timestamp()) if row.recorded_at else None,
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


@router.get('/path-finder/cheapest')
def get_cheapest_path(amount_krw: int = Query(1000000, ge=10000), global_exchange: str = Query('binance'), db: Session = Depends(get_db)) -> dict:
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
    return find_cheapest_path_from_snapshot_rows(
        amount_krw=amount_krw,
        global_exchange=global_exchange,
        latest_run=latest_run,
        ticker_rows=ticker_rows,
        withdrawal_rows=withdrawal_rows,
        network_rows=network_rows,
        lightning_swap_rows=lightning_swap_rows,
    )


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


@router.get('/exchange-status')
def get_exchange_status(db: Session = Depends(get_db)) -> dict:
    """출금 수수료 + 네트워크 상태 + 공지사항 통합 뷰"""
    latest_run = repositories.get_latest_successful_run(db)
    if latest_run is None:
        return {'exchanges': [], 'lightning_services': []}

    withdrawal_rows = repositories.list_withdrawal_snapshots_for_run(db, latest_run.id)
    network_rows = repositories.list_network_status_for_run(db, latest_run.id)
    lightning_rows = repositories.list_lightning_swap_fees_for_run(db, latest_run.id)
    crawl_errors = repositories.list_crawl_errors_for_run(db, latest_run.id)
    notices_by_exchange = repositories.get_latest_notices_per_exchange(db, latest_run.id)

    # Scrape status lookup by exchange
    error_stages = {(e.exchange, e.stage): e.error_message for e in crawl_errors}

    # --- Build exchange nodes ---
    exchange_map: dict[str, dict] = {}

    # Group withdrawal rows by exchange
    for row in withdrawal_rows:
        ex = row.exchange
        if ex not in exchange_map:
            exchange_map[ex] = {
                'exchange': ex,
                'type': 'exchange',
                'withdrawal_rows': [],
                'network_status': {'status': 'ok', 'suspended_networks': [], 'checked_at': None},
                'scrape_status': None,
                'notices': notices_by_exchange.get(ex, []),
            }
        exchange_map[ex]['withdrawal_rows'].append({
            'coin': row.coin,
            'network_label': row.network_label,
            'fee': row.fee,
            'fee_krw': row.fee_krw,
            'enabled': row.enabled,
            'source': row.source,
            'note': row.note,
        })

    # Populate scrape_status for each exchange
    seen_exchanges_for_scrape: set[str] = set()
    for row in withdrawal_rows:
        ex = row.exchange
        if ex not in seen_exchanges_for_scrape:
            seen_exchanges_for_scrape.add(ex)
            source_url = get_withdrawal_source_url(ex, row.coin, row.network_label)
            if source_url and ex in exchange_map:
                has_error = (ex, 'withdrawal') in error_stages
                exchange_map[ex]['scrape_status'] = {
                    'url': source_url,
                    'status': 'error' if has_error else 'ok',
                    'last_crawled_at': int(row.recorded_at.timestamp()) if row.recorded_at else None,
                    'error_message': error_stages.get((ex, 'withdrawal')),
                }

    # Merge network status
    network_grouped = repositories.group_network_status(network_rows)
    for ex, status in network_grouped.items():
        if ex not in exchange_map:
            exchange_map[ex] = {
                'exchange': ex,
                'type': 'exchange',
                'withdrawal_rows': [],
                'network_status': status,
                'scrape_status': None,
                'notices': notices_by_exchange.get(ex, []),
            }
        else:
            exchange_map[ex]['network_status'] = status

        # network_status scrape_status
        network_source_rows = [r for r in network_rows if r.exchange == ex and r.source_url]
        if network_source_rows:
            source_url = network_source_rows[0].source_url
            has_error = (ex, 'network_status') in error_stages
            if exchange_map[ex]['scrape_status'] is None:
                exchange_map[ex]['scrape_status'] = {
                    'url': source_url,
                    'status': 'error' if has_error else 'ok',
                    'last_crawled_at': int(network_source_rows[0].recorded_at.timestamp()) if network_source_rows[0].recorded_at else None,
                    'error_message': error_stages.get((ex, 'network_status')),
                }

    # --- Build lightning service nodes ---
    lightning_services = []
    for row in lightning_rows:
        has_error = not row.enabled or bool(row.error_message)
        lightning_services.append({
            'exchange': row.service_name,
            'type': 'lightning',
            'withdrawal_rows': [{
                'coin': 'BTC',
                'network_label': 'Lightning Network',
                'fee_pct': row.fee_pct,
                'fee_fixed_sat': row.fee_fixed_sat,
                'min_amount_sat': row.min_amount_sat,
                'max_amount_sat': row.max_amount_sat,
                'enabled': row.enabled,
                'source': 'realtime_api',
                'note': row.error_message,
            }],
            'network_status': {'status': 'ok' if not has_error else 'error', 'suspended_networks': [], 'checked_at': None},
            'scrape_status': {
                'url': row.source_url,
                'status': 'error' if has_error else 'ok',
                'last_crawled_at': int(row.recorded_at.timestamp()) if row.recorded_at else None,
                'error_message': row.error_message,
            } if row.source_url else None,
            'notices': [],
        })

    return {
        'exchanges': list(exchange_map.values()),
        'lightning_services': lightning_services,
    }
