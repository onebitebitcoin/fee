"""공통 스냅샷 컨텍스트 — buy/sell 경로 계산에서 공유하는 데이터."""
from __future__ import annotations

from dataclasses import dataclass

from backend.app.domain.market_core import TRADING_FEES, GROUPS
from backend.app.domain.path_helpers import (
    build_ticker_by_exchange,
    build_withdrawals_by_key,
    build_maintenance_status,
)


@dataclass
class SnapshotContext:
    """buy/sell 공통 스냅샷 컨텍스트."""

    usd_krw_rate: float
    global_btc_price_usd: float
    global_taker: float
    ticker_by_exchange: dict
    withdrawals_by_key: dict
    maintenance_status: dict
    maintenance_checked_at: int | None
    last_run: dict


def build_snapshot_context(
    global_exchange: str,
    latest_run,
    ticker_rows: list,
    withdrawal_rows: list,
    network_rows: list,
) -> SnapshotContext | dict:
    """공통 스냅샷 컨텍스트 빌드. 실패 시 {'error': ...} dict 반환."""
    if latest_run is None:
        return {'error': '최신 수집 결과가 없습니다. 먼저 수동 크롤링을 실행하세요.'}

    usd_krw_rate = latest_run.usd_krw_rate or next(
        (row.usd_krw_rate for row in ticker_rows if getattr(row, 'usd_krw_rate', None)),
        None,
    )
    if usd_krw_rate is None:
        return {'error': '최신 수집 결과에 환율 정보가 없습니다.'}

    global_row = next(
        (row for row in ticker_rows if row.exchange == global_exchange and row.market_type == 'spot'),
        None,
    )
    if global_row is None:
        return {'error': f'최신 수집 결과에 {global_exchange} spot 시세가 없습니다.'}

    global_btc_price_usd = float(global_row.price)
    fees_entry = TRADING_FEES.get(global_exchange, {})
    if global_row.taker_fee_pct is not None:
        global_taker = global_row.taker_fee_pct / 100
    elif isinstance(fees_entry.get('spot'), dict):
        global_taker = fees_entry['spot']['taker']
    else:
        global_taker = fees_entry['taker']

    completed_ts = int(latest_run.completed_at.timestamp()) if latest_run.completed_at else None
    return SnapshotContext(
        usd_krw_rate=float(usd_krw_rate),
        global_btc_price_usd=global_btc_price_usd,
        global_taker=global_taker,
        ticker_by_exchange=build_ticker_by_exchange(ticker_rows, GROUPS['korea']),
        withdrawals_by_key=build_withdrawals_by_key(withdrawal_rows),
        maintenance_status=build_maintenance_status(network_rows),
        maintenance_checked_at=completed_ts,
        last_run={
            'id': latest_run.id,
            'status': latest_run.status,
            'completed_at': completed_ts,
        },
    )
