from __future__ import annotations

from sqlalchemy.orm import Session

from backend.app.db import repositories
from backend.app.services import live_market


def build_overview(db: Session) -> dict:
    latest_run = repositories.get_latest_successful_run(db)
    if latest_run is None:
        return {
            'last_run': None,
            'counts': {'tickers': 0, 'withdrawal_rows': 0, 'suspended_networks': 0},
            'usd_krw_rate': None,
            'ticker_highlights': {},
        }
    tickers = repositories.list_ticker_snapshots_for_run(db, latest_run.id)
    withdrawals = repositories.list_withdrawal_snapshots_for_run(db, latest_run.id)
    network_rows = repositories.list_network_status_for_run(db, latest_run.id)
    grouped = repositories.group_network_status(network_rows)
    krw_rows = sorted([row for row in tickers if row.currency == 'KRW'], key=lambda item: item.price)
    usd_rows = sorted([row for row in tickers if row.currency == 'USD'], key=lambda item: item.price)
    return {
        'last_run': {
            'id': latest_run.id,
            'trigger': latest_run.trigger,
            'status': latest_run.status,
            'message': latest_run.message,
            'started_at': latest_run.started_at.isoformat() if latest_run.started_at else None,
            'completed_at': latest_run.completed_at.isoformat() if latest_run.completed_at else None,
        },
        'counts': {
            'tickers': len(tickers),
            'withdrawal_rows': len(withdrawals),
            'suspended_networks': sum(len(item['suspended_networks']) for item in grouped.values()),
        },
        'usd_krw_rate': latest_run.usd_krw_rate,
        'ticker_highlights': {
            'krw_lowest': {'exchange': krw_rows[0].exchange, 'price': krw_rows[0].price} if krw_rows else None,
            'krw_highest': {'exchange': krw_rows[-1].exchange, 'price': krw_rows[-1].price} if krw_rows else None,
            'usd_lowest': {'exchange': usd_rows[0].exchange, 'price': usd_rows[0].price} if usd_rows else None,
            'usd_highest': {'exchange': usd_rows[-1].exchange, 'price': usd_rows[-1].price} if usd_rows else None,
        },
        'available_exchanges': live_market.list_exchanges(),
    }
