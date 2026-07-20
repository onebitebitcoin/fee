"""BTC 글로벌 경유 경로 — 국내 BTC 출금 → 글로벌 거래소 → 온체인 개인 지갑."""
from __future__ import annotations

from backend.app.domain.path_graph import Blocked
from backend.app.domain.path_helpers import _build_path_id
from backend.app.domain.paths.base import BuilderContext, BuildResult
from backend.app.domain.paths.chain import global_onchain_exit, iter_btc_entries


def build_btc_via_global(bctx: BuilderContext, exchange: str) -> BuildResult:
    """국내 BTC 출금 → 글로벌 거래소 경유 → 개인 지갑 (온체인)."""
    ctx = bctx.ctx
    amount_krw = bctx.amount_krw
    global_exchange = bctx.global_exchange
    global_onchain_wd_row = bctx.global_onchain_wd_row

    if global_onchain_wd_row is None:
        return BuildResult([], [])

    paths: list[dict] = []
    disabled_paths: list[dict] = []
    _seen_disabled: set[tuple] = set()

    for e in iter_btc_entries(bctx, exchange, mode='via'):
        # 글로벌 온체인 출금 엣지 — enabled/min/max/suspension 통일 검증 (withdraw_leg invariant)
        global_wd = global_onchain_exit(
            bctx, e.amount_out, label=f'해외 BTC 출금 ({global_exchange})',
        )
        if isinstance(global_wd, Blocked):
            _key = (exchange, e.row.network_label, global_wd.reason)
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

        total_fee_krw = e.fee_krw + global_wd.fee_krw
        components = list(e.components) + list(global_wd.components)

        paths.append({
            'korean_exchange': exchange,
            'transfer_coin': 'BTC',
            'route_variant': 'btc_via_global',
            'network': e.row.network_label,
            'domestic_withdrawal_network': e.row.network_label,
            'global_exit_mode': 'onchain',
            'global_exit_network': 'Bitcoin',
            'lightning_exit_provider': None,
            'num_withdrawal_txs': 1,
            'krw_per_tx_limit': None,
            'path_id': _build_path_id(
                global_exchange=global_exchange,
                korean_exchange=exchange,
                transfer_coin='BTC',
                domestic_withdrawal_network=e.row.network_label,
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
