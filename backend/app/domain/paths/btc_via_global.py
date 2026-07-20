"""BTC 글로벌 경유 경로 — 국내 BTC 출금 → 글로벌 거래소 → 온체인 개인 지갑."""
from __future__ import annotations

from backend.app.domain.market_core import get_withdrawal_source_url
from backend.app.domain.path_graph import Blocked, korea_buy_leg, withdraw_leg
from backend.app.domain.path_helpers import _build_path_id, is_suspended
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
    global_onchain_wd_row = bctx.global_onchain_wd_row

    if global_onchain_wd_row is None:
        return BuildResult([], [])

    ticker_row = ctx.ticker_by_exchange.get(exchange)
    if ticker_row is None:
        return BuildResult([], [])

    korean_btc_price_krw = float(ticker_row.price)
    korean_taker = _get_korean_taker(ticker_row, exchange)

    buy = korea_buy_leg(amount_krw, korean_taker, korean_btc_price_krw, 'BTC', ctx.usd_krw_rate)

    paths: list[dict] = []
    disabled_paths: list[dict] = []
    _seen_disabled: set[tuple] = set()
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

        # 글로벌 온체인 출금 엣지 — enabled/min/max/suspension 통일 검증 (withdraw_leg invariant)
        global_wd = withdraw_leg(
            global_onchain_wd_row, domestic_wd.amount_out,
            coin='BTC', price_krw=ctx.global_btc_price_usd * ctx.usd_krw_rate,
            usd_krw=ctx.usd_krw_rate,
            split_on_max=True,
            maintenance_status=ctx.maintenance_status, exchange=global_exchange,
            label_override=f'해외 BTC 출금 ({global_exchange})',
        )
        if isinstance(global_wd, Blocked):
            _key = (exchange, row.network_label, global_wd.reason)
            if _key not in _seen_disabled:
                _seen_disabled.add(_key)
                disabled_paths.append({
                    'korean_exchange': exchange,
                    'transfer_coin': 'BTC',
                    'network': global_onchain_wd_row.network_label,
                    'reason': global_wd.reason,
                })
            continue
        btc_received = global_wd.amount_out
        if btc_received <= 0:
            continue

        # amount_text 보정 — 실제 차감된 총 수수료(BTC)를 sats로 표기 (분할 출금 포함)
        global_wd_fee_btc = domestic_wd.amount_out - btc_received
        global_wd_comp = global_wd.components[0].copy()
        global_wd_comp['amount_text'] = f'{round(global_wd_fee_btc * 100_000_000):,} sats'

        # domestic_wd.components에서 label을 확인해 amount_text 동기화
        # withdraw_leg가 label_override 사용 시 amount_text=None이므로 보정
        domestic_comp = domestic_wd.components[0].copy()
        domestic_fee_btc = row.fee
        domestic_comp['amount_text'] = f'{domestic_fee_btc} BTC'

        total_fee_krw = buy.fee_krw + domestic_wd.fee_krw + global_wd.fee_krw
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

    return BuildResult(paths, disabled_paths)
