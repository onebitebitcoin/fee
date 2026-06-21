"""BTC 직접 출금 경로 — 국내 거래소에서 BTC 매수 후 온체인으로 개인 지갑에 직접 출금."""
from __future__ import annotations

from backend.app.domain.market_core import get_withdrawal_source_url
from backend.app.domain.path_graph import Blocked, korea_buy_leg, withdraw_leg
from backend.app.domain.path_helpers import _build_path_id, is_suspended
from backend.app.domain.korea_exchange_registry import get_withdrawal_limits
from backend.app.domain.paths.base import (
    BuilderContext,
    BuildResult,
    _force_calc_withdraw,
    _get_korean_taker,
)


def build_btc_direct(bctx: BuilderContext, exchange: str) -> BuildResult:
    """BTC 직접 출금 경로와 disabled 경로 반환."""
    ctx = bctx.ctx
    amount_krw = bctx.amount_krw
    global_exchange = bctx.global_exchange

    paths: list[dict] = []
    disabled_paths: list[dict] = []

    ticker_row = ctx.ticker_by_exchange.get(exchange)
    if ticker_row is None:
        return BuildResult(paths, disabled_paths)

    korean_btc_price_krw = float(ticker_row.price)
    korean_taker = _get_korean_taker(ticker_row, exchange)

    # 1회 KRW 출금 제한 — 초과 시 여러 트랜잭션으로 분할
    limits = get_withdrawal_limits(exchange)
    krw_per_tx = limits.krw_per_tx_limit if limits else None
    if krw_per_tx and krw_per_tx > 0:
        num_txs = -(-amount_krw // krw_per_tx)  # ceiling division
    else:
        num_txs = 1

    # 매수 엣지 (모든 BTC 출금 행 공통)
    buy = korea_buy_leg(amount_krw, korean_taker, korean_btc_price_krw, 'BTC', ctx.usd_krw_rate)

    for row in ctx.withdrawals_by_key.get((exchange, 'BTC'), []):
        # 비활성화 여부 판단 (enabled=False 또는 점검 정지)
        is_disabled = False
        row_disabled_reason = None

        if not row.enabled:
            row_disabled_reason = getattr(row, 'suspension_reason', None) or 'disabled'
            is_disabled = True
        elif row.fee is None:
            continue
        else:
            susp = is_suspended(ctx.maintenance_status, exchange, 'BTC', row.network_label)
            if susp:
                row_disabled_reason = susp
                is_disabled = True

        if is_disabled and row.fee is None:
            disabled_paths.append({
                'korean_exchange': exchange,
                'transfer_coin': 'BTC',
                'network': row.network_label,
                'reason': row_disabled_reason,
                'suspension_message': getattr(row, 'suspension_message', None),
            })
            continue

        # 출금 엣지 (비활성화 경로는 강제 계산)
        source_url = get_withdrawal_source_url(exchange, 'BTC', row.network_label)
        if is_disabled:
            wd = _force_calc_withdraw(
                row, buy.amount_out,
                coin='BTC', price_krw=korean_btc_price_krw, usd_krw=ctx.usd_krw_rate,
                num_txs=num_txs, source_url=source_url,
            )
        else:
            wd = withdraw_leg(
                row, buy.amount_out,
                coin='BTC', price_krw=korean_btc_price_krw, usd_krw=ctx.usd_krw_rate,
                num_txs=num_txs, source_url=source_url,
            )
        if wd is None or isinstance(wd, Blocked):
            disabled_paths.append({
                'korean_exchange': exchange,
                'transfer_coin': 'BTC',
                'network': row.network_label,
                'reason': wd.reason if isinstance(wd, Blocked) else (row_disabled_reason or 'disabled'),
            })
            continue

        btc_received = wd.amount_out
        if btc_received <= 0:
            continue

        total_fee_krw = buy.fee_krw + wd.fee_krw
        components = list(buy.components) + list(wd.components)

        entry: dict = {
            'korean_exchange': exchange,
            'transfer_coin': 'BTC',
            'route_variant': 'btc_direct',
            'network': row.network_label,
            'domestic_withdrawal_network': row.network_label,
            'global_exit_mode': 'onchain',
            'global_exit_network': row.network_label,
            'lightning_exit_provider': None,
            'num_withdrawal_txs': num_txs,
            'krw_per_tx_limit': krw_per_tx,
            'path_id': _build_path_id(
                global_exchange=global_exchange,
                korean_exchange=exchange,
                transfer_coin='BTC',
                domestic_withdrawal_network=row.network_label,
                global_exit_mode='onchain',
                global_exit_network=row.network_label,
                lightning_exit_provider=None,
            ),
            'btc_received': round(btc_received, 8),
            'btc_received_usd': round(btc_received * ctx.global_btc_price_usd, 2),
            'total_fee_krw': total_fee_krw,
            'fee_pct': round(total_fee_krw / amount_krw * 100, 4),
            'breakdown': {
                'components': components,
                'total_fee_krw': total_fee_krw,
            },
        }
        if is_disabled:
            entry['disabled'] = True
            entry['disabled_reason'] = row_disabled_reason
        paths.append(entry)

    return BuildResult(paths, disabled_paths)
