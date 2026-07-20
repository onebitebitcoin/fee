"""USDT 경유 경로 — 국내 USDT 매수·출금 → 글로벌 거래소 BTC 매수 → 온체인 개인 지갑."""
from __future__ import annotations

from backend.app.domain.path_graph import Blocked
from backend.app.domain.path_helpers import _build_path_id
from backend.app.domain.paths.base import BuilderContext, BuildResult
from backend.app.domain.paths.chain import global_onchain_exit, iter_usdt_entries


def build_usdt(bctx: BuilderContext, exchange: str) -> BuildResult:
    """USDT 경유 경로와 disabled 경로 반환."""
    ctx = bctx.ctx
    amount_krw = bctx.amount_krw
    global_exchange = bctx.global_exchange
    global_onchain_wd_row = bctx.global_onchain_wd_row
    global_onchain_network_label = bctx.global_onchain_network_label

    # 글로벌 BTC 온체인 출금 행이 없으면 마지막 홉 비용을 알 수 없다 —
    # 수수료 누락된 채 경로를 만들지 않고 btc_via_global과 동일하게 경로 자체를 생략.
    if global_onchain_wd_row is None:
        return BuildResult([], [])

    paths: list[dict] = []
    disabled_paths: list[dict] = []
    _seen_disabled: set[tuple] = set()

    for e in iter_usdt_entries(bctx, exchange, include_disabled=True, disabled_out=disabled_paths):
        # 글로벌 온체인 출금 엣지 — enabled/min/max/suspension 통일 검증 (withdraw_leg invariant)
        global_wd = global_onchain_exit(
            bctx, e.amount_out, label=f'해외 BTC 출금 수수료 ({global_exchange})',
        )
        if isinstance(global_wd, Blocked):
            _key = (exchange, e.row.network_label, global_wd.reason)
            if _key not in _seen_disabled:
                _seen_disabled.add(_key)
                disabled_paths.append({
                    'korean_exchange': exchange,
                    'transfer_coin': 'USDT',
                    'network': global_onchain_wd_row.network_label,
                    'reason': global_wd.reason,
                })
            continue
        btc_received = global_wd.amount_out
        if btc_received <= 0:
            continue

        total_fee_krw = e.fee_krw + global_wd.fee_krw
        wd_components = list(e.components) + list(global_wd.components)

        entry: dict = {
            'korean_exchange': exchange,
            'transfer_coin': 'USDT',
            'network': e.row.network_label,
            'domestic_withdrawal_network': e.row.network_label,
            'global_exit_mode': 'onchain',
            'global_exit_network': global_onchain_network_label or 'Bitcoin',
            'lightning_exit_provider': None,
            'path_id': _build_path_id(
                global_exchange=global_exchange,
                korean_exchange=exchange,
                transfer_coin='USDT',
                domestic_withdrawal_network=e.row.network_label,
                global_exit_mode='onchain',
                global_exit_network=global_onchain_network_label or 'Bitcoin',
                lightning_exit_provider=None,
            ),
            'btc_received': round(btc_received, 8),
            'btc_received_usd': round(btc_received * ctx.global_btc_price_usd, 2),
            'total_fee_krw': total_fee_krw,
            'fee_pct': round(total_fee_krw / amount_krw * 100, 4),
            'breakdown': {
                'components': wd_components,
                'total_fee_krw': total_fee_krw,
            },
        }
        if e.is_disabled:
            entry['disabled'] = True
            entry['disabled_reason'] = e.disabled_reason
        paths.append(entry)

    return BuildResult(paths, disabled_paths)
