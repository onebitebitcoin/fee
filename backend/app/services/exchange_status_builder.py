"""DB 스냅샷에서 거래소 상태 요약을 빌드하는 빌더."""

from sqlalchemy.orm import Session

from backend.app.db import repositories
from backend.app.domain.market_core import get_withdrawal_source_url
from backend.app.services import kyc_registry


def _ts(dt_val) -> int | None:
    """datetime → unix timestamp (초). None이면 None 반환."""
    return int(dt_val.timestamp()) if dt_val else None


def build_exchange_status(db: Session) -> dict:
    """DB 스냅샷에서 거래소 상태 요약을 빌드한다.

    Returns:
        {'exchanges': [...], 'lightning_services': [...], 'latest_notices': [...]}
        데이터 없으면 {'exchanges': [], 'lightning_services': [], 'latest_notices': []}
    """
    latest_run = repositories.get_latest_successful_run(db)
    if latest_run is None:
        return {'exchanges': [], 'lightning_services': [], 'latest_notices': []}

    withdrawal_rows = repositories.list_withdrawal_snapshots_for_run(db, latest_run.id)
    network_rows = repositories.list_network_status_for_run(db, latest_run.id)
    lightning_rows = repositories.list_lightning_swap_fees_for_run(db, latest_run.id)
    crawl_errors = repositories.list_crawl_errors_for_run(db, latest_run.id)
    notices_by_exchange = repositories.get_latest_notices_per_exchange(db, latest_run.id)
    registry = kyc_registry.get_kyc_registry()

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
                'kyc_status': None,
            }
        exchange_map[ex]['withdrawal_rows'].append({
            'coin': row.coin,
            'network_label': row.network_label,
            'fee': row.fee,
            'fee_krw': row.fee_krw,
            'min_withdrawal': row.min_withdrawal,
            'max_withdrawal': row.max_withdrawal,
            'enabled': row.enabled,
            'source': row.source,
            'note': row.note,
            'kyc_status': kyc_registry.resolve_exchange_asset_kyc_status(ex, row.coin, row.note, registry=registry),
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
                'kyc_status': None,
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
                'kyc_status': kyc_registry.resolve_service_kyc_status(row.service_name, registry=registry),
            }],
            'network_status': {'status': 'ok' if not has_error else 'error', 'suspended_networks': [], 'checked_at': None},
            'scrape_status': {
                'url': row.source_url,
                'status': 'error' if has_error else 'ok',
                'last_crawled_at': int(row.recorded_at.timestamp()) if row.recorded_at else None,
                'error_message': row.error_message,
            } if row.source_url else None,
            'notices': [],
            'kyc_status': kyc_registry.resolve_service_kyc_status(row.service_name, registry=registry),
            'direction': row.direction,
        })

    for node in exchange_map.values():
        node['kyc_status'] = kyc_registry.aggregate_kyc_status([
            row.get('kyc_status') for row in node.get('withdrawal_rows', [])
        ])

    # 최신 공지사항 (전역 정렬)
    latest_notice_rows = repositories.get_latest_relevant_notices(db, limit=5)
    latest_notices = [
        {
            'exchange': row.exchange,
            'title': row.title,
            'url': row.url,
            'published_at': _ts(row.published_at),
            'noticed_at': _ts(row.noticed_at),
        }
        for row in latest_notice_rows
    ]

    return {
        'exchanges': list(exchange_map.values()),
        'lightning_services': lightning_services,
        'latest_notices': latest_notices,
    }
