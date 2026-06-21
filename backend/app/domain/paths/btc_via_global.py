"""BTC 글로벌 경유 경로 — 국내 BTC 출금 → 글로벌 거래소 → 온체인 개인 지갑."""
from __future__ import annotations

from backend.app.domain.market_core import get_withdrawal_source_url
from backend.app.domain.path_graph import Blocked, korea_buy_leg, withdraw_leg
from backend.app.domain.path_helpers import _build_path_id, fee_component, is_suspended
from backend.app.domain.paths.base import (
    BuilderContext,
    BuildResult,
    _get_korean_taker,
)


def build_btc_via_global(bctx: BuilderContext, exchange: str) -> BuildResult:
    """국내 BTC 출금 → 글로벌 거래소 경유 → 개인 지갑 (온체인)."""
    ctx = bctx.ctx
    amount_krw = bctx.amount_krw
    global_exchange = bctx.global_exchange
    global_onchain_wd_fee = bctx.global_onchain_wd_fee
    global_onchain_wd_fee_krw = bctx.global_onchain_wd_fee_krw

    if global_onchain_wd_fee is None:
        return BuildResult([], [])

    ticker_row = ctx.ticker_by_exchange.get(exchange)
    if ticker_row is None:
        return BuildResult([], [])

    korean_btc_price_krw = float(ticker_row.price)
    korean_taker = _get_korean_taker(ticker_row, exchange)

    buy = korea_buy_leg(amount_krw, korean_taker, korean_btc_price_krw, 'BTC', ctx.usd_krw_rate)

    paths: list[dict] = []
    for row in ctx.withdrawals_by_key.get((exchange, 'BTC'), []):
        if not row.enabled or row.fee is None:
            continue
        if is_suspended(ctx.maintenance_status, exchange, 'BTC', row.network_label):
            continue

        # 국내 BTC → 글로벌 출금 엣지
        source_url = get_withdrawal_source_url(exchange, 'BTC', row.network_label)
        domestic_wd = withdraw_leg(
            row, buy.amount_out,
            coin='BTC', price_krw=korean_btc_price_krw, usd_krw=ctx.usd_krw_rate,
            num_txs=1, source_url=source_url,
            label_override='국내 BTC 출금 수수료',
        )
        if isinstance(domestic_wd, Blocked):
            continue
        if domestic_wd.amount_out <= 0:
            continue

        # 글로벌 온체인 출금 수수료 (이미 계산된 고정값 사용)
        btc_received = domestic_wd.amount_out - global_onchain_wd_fee
        if btc_received <= 0:
            continue

        # breakdown 구성 (기존 스키마 호환 — 글로벌 출금은 fee_component 직접 생성)
        global_wd_comp = fee_component(
            f'해외 BTC 출금 ({global_exchange})', global_onchain_wd_fee_krw,
            amount_text=f'{round(global_onchain_wd_fee * 100_000_000):,} sats', is_fixed=True,
            move_amount=btc_received, move_coin='BTC',
            move_amount_krw=round(btc_received * ctx.global_btc_price_usd * ctx.usd_krw_rate),
        )

        # domestic_wd.components에서 label을 확인해 amount_text 동기화
        # withdraw_leg가 label_override 사용 시 amount_text=None이므로 보정
        domestic_comp = domestic_wd.components[0].copy()
        domestic_fee_btc = row.fee
        domestic_comp['amount_text'] = f'{domestic_fee_btc} BTC'

        total_fee_krw = buy.fee_krw + domestic_wd.fee_krw + global_onchain_wd_fee_krw
        components = list(buy.components) + [domestic_comp] + [global_wd_comp]

        paths.append({
            'korean_exchange': exchange,
            'transfer_coin': 'BTC',
            'route_variant': 'btc_via_global',
            'network': row.network_label,
            'domestic_withdrawal_network': row.network_label,
            'global_exit_mode': 'onchain',
            'global_exit_network': 'Bitcoin',
            'lightning_exit_provider': None,
            'num_withdrawal_txs': 1,
            'krw_per_tx_limit': None,
            'path_id': _build_path_id(
                global_exchange=global_exchange,
                korean_exchange=exchange,
                transfer_coin='BTC',
                domestic_withdrawal_network=row.network_label,
                global_exit_mode='onchain',
                global_exit_network='Bitcoin',
                lightning_exit_provider=None,
            ) + '__via_global',
            'btc_received': round(btc_received, 8),
            'btc_received_usd': round(btc_received * ctx.global_btc_price_usd, 2),
            'total_fee_krw': total_fee_krw,
            'fee_pct': round(total_fee_krw / amount_krw * 100, 4),
            'breakdown': {
                'components': components,
                'total_fee_krw': total_fee_krw,
            },
        })

    return BuildResult(paths, [])
