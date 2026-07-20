"""BTC 직접 출금 경로 — 국내 거래소에서 BTC 매수 후 온체인으로 개인 지갑에 직접 출금."""
from __future__ import annotations

from backend.app.domain.path_helpers import _build_path_id
from backend.app.domain.paths.base import BuilderContext, BuildResult
from backend.app.domain.paths.chain import iter_btc_entries


def build_btc_direct(bctx: BuilderContext, exchange: str) -> BuildResult:
    """BTC 직접 출금 경로와 disabled 경로 반환."""
    ctx = bctx.ctx
    amount_krw = bctx.amount_krw
    global_exchange = bctx.global_exchange

    paths: list[dict] = []
    disabled_paths: list[dict] = []

    for e in iter_btc_entries(bctx, exchange, mode='direct', disabled_out=disabled_paths):
        entry: dict = {
            'korean_exchange': exchange,
            'transfer_coin': 'BTC',
            'route_variant': 'btc_direct',
            'network': e.row.network_label,
            'domestic_withdrawal_network': e.row.network_label,
            'global_exit_mode': 'onchain',
            'global_exit_network': e.row.network_label,
            'lightning_exit_provider': None,
            'num_withdrawal_txs': e.num_txs,
            'krw_per_tx_limit': e.krw_per_tx_limit,
            'path_id': _build_path_id(
                global_exchange=global_exchange,
                korean_exchange=exchange,
                transfer_coin='BTC',
                domestic_withdrawal_network=e.row.network_label,
                global_exit_mode='onchain',
                global_exit_network=e.row.network_label,
                lightning_exit_provider=None,
            ),
            'btc_received': round(e.amount_out, 8),
            'btc_received_usd': round(e.amount_out * ctx.global_btc_price_usd, 2),
            'total_fee_krw': e.fee_krw,
            'fee_pct': round(e.fee_krw / amount_krw * 100, 4),
            'breakdown': {
                'components': e.components,
                'total_fee_krw': e.fee_krw,
            },
        }
        if e.is_disabled:
            entry['disabled'] = True
            entry['disabled_reason'] = e.disabled_reason
        paths.append(entry)

    return BuildResult(paths, disabled_paths)
