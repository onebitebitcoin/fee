"""Lightning exit 경로 — 글로벌 거래소 LN 출금 + (스왑 경유 / 직접출금).

집계 빌더: 내부에서 한국 거래소 전체를 순회하며 USDT→글로벌→LN, BTC→글로벌→LN 두 갈래를 만든다.
진입 체인(매수→국내출금→글로벌매수)은 paths.chain의 공용 반복자를 사용한다 — usdt/btc_via_global과 단일 구현.
글로벌 LN 출금 행이 없거나 스왑 행이 없으면 빈 결과를 반환한다.
"""
from __future__ import annotations

import math

from backend.app.domain.market_core import GROUPS
from backend.app.domain.path_graph import Blocked, swap_leg, withdraw_leg
from backend.app.domain.path_helpers import _build_path_id
from backend.app.domain.paths_context import SnapshotContext
from backend.app.domain.paths.base import BuilderContext, BuildResult, _ex_ko
from backend.app.domain.paths.chain import iter_btc_entries, iter_usdt_entries


def _resolve_global_ln_row(ctx: SnapshotContext, global_exchange: str):
    """글로벌 거래소 Lightning Network 출금 행 반환 (없으면 None)."""
    for wd_row in ctx.withdrawals_by_key.get((global_exchange, 'BTC'), []):
        if wd_row.enabled and wd_row.fee is not None and 'lightning' in (wd_row.network_label or '').lower():
            return wd_row
    return None


def _ln_num_txs(global_ln_wd_row, amount_coin: float) -> int:
    """글로벌 LN 출금 1회 한도(max_withdrawal) 초과 시 필요한 분할 출금 횟수."""
    max_wd = getattr(global_ln_wd_row, 'max_withdrawal', None)
    if max_wd and amount_coin > max_wd:
        return math.ceil(amount_coin / max_wd)
    return 1


def build_lightning(bctx: BuilderContext) -> BuildResult:
    """Lightning exit 경로 생성 (ln_to_onchain 스왑 포함 / 직접출금 __direct__).

    Returns:
        BuildResult — 글로벌 LN 출금 Blocked 사유를 중복 제거해 disabled에 기록.
    """
    lightning_swap_rows = bctx.lightning_swap_rows
    if not lightning_swap_rows:
        return BuildResult([], [])

    ctx = bctx.ctx
    amount_krw = bctx.amount_krw
    global_exchange = bctx.global_exchange

    global_ln_wd_row = _resolve_global_ln_row(ctx, global_exchange)
    if global_ln_wd_row is None:
        return BuildResult([], [])

    paths: list[dict] = []
    disabled_paths: list[dict] = []
    # (korean_exchange, transfer_coin, network, reason) 기준 중복 제거
    _seen_disabled: set[tuple] = set()
    global_ln_wd_fee = global_ln_wd_row.fee
    ln_network_label = global_ln_wd_row.network_label

    active_swaps = [
        s for s in lightning_swap_rows
        if s.enabled and s.fee_pct is not None and getattr(s, 'direction', None) == 'ln_to_onchain'
    ]

    def _ln_withdraw(amount_in: float, transfer_coin: str):
        """글로벌 LN 출금 엣지 — 1회 한도 초과 시 분할 출금(수수료 × 횟수).

        Blocked 시 disabled 기록 후 None, 성공 시 (Leg, num_txs, 보정 component) 반환.
        """
        ln_num_txs = _ln_num_txs(global_ln_wd_row, amount_in)
        global_ln_wd = withdraw_leg(
            global_ln_wd_row, amount_in,
            coin='BTC', price_krw=ctx.global_btc_price_usd * ctx.usd_krw_rate,
            usd_krw=ctx.usd_krw_rate,
            split_on_max=True,
            label_override=f'해외 BTC 라이트닝 출금 수수료 ({_ex_ko(global_exchange)})'
            + (f' · {ln_num_txs}회 분할' if ln_num_txs > 1 else ''),
        )
        if isinstance(global_ln_wd, Blocked):
            _key = (exchange, transfer_coin, ln_network_label, global_ln_wd.reason)
            if _key not in _seen_disabled:
                _seen_disabled.add(_key)
                disabled_paths.append({
                    'korean_exchange': exchange,
                    'transfer_coin': transfer_coin,
                    'network': ln_network_label,
                    'reason': global_ln_wd.reason,
                })
            return None
        if global_ln_wd.amount_out <= 0:
            return None
        comp = global_ln_wd.components[0].copy()
        comp['amount_text'] = (
            f'{round(global_ln_wd_fee * ln_num_txs, 8)} BTC ({ln_num_txs}회)'
            if ln_num_txs > 1 else f'{global_ln_wd_fee} BTC'
        )
        return global_ln_wd, ln_num_txs, comp

    def _apply_swap(swap, amount_in: float):
        """스왑 또는 직접 출금(__direct__) — 실패 시 None."""
        if swap is not None:
            sl = swap_leg(swap, amount_in, ctx.global_btc_price_usd, ctx.usd_krw_rate)
            if isinstance(sl, Blocked):
                return None
            return sl.amount_out, sl.fee_krw, list(sl.components), swap.service_name, swap.service_name
        return amount_in, 0, [], '__direct__', None

    # 스왑 목록 + __direct__ 센티널 (None → 직접 출금)
    swap_variants: list = list(active_swaps) + [None]

    for swap in swap_variants:
        for exchange in GROUPS['korea']:
            # ── USDT → 글로벌 → LN 경로 ─────────────────────────────────────
            for e in iter_usdt_entries(bctx, exchange, include_disabled=False):
                ln = _ln_withdraw(e.amount_out, 'USDT')
                if ln is None:
                    continue
                global_ln_wd, ln_num_txs, global_ln_comp = ln

                swapped = _apply_swap(swap, global_ln_wd.amount_out)
                if swapped is None:
                    continue
                btc_received, ln_swap_fee_krw, swap_comps, lightning_exit_provider, swap_service = swapped
                if btc_received <= 0:
                    continue

                total_fee_krw = e.fee_krw + global_ln_wd.fee_krw + ln_swap_fee_krw
                components = list(e.components) + [global_ln_comp] + swap_comps

                paths.append({
                    'korean_exchange': exchange,
                    'transfer_coin': 'USDT',
                    'network': e.row.network_label,
                    'path_type': 'lightning_exit',
                    'swap_service': swap_service,
                    'domestic_withdrawal_network': e.row.network_label,
                    'global_exit_mode': 'lightning',
                    'global_exit_network': ln_network_label,
                    'lightning_exit_provider': lightning_exit_provider,
                    'num_withdrawal_txs': ln_num_txs,
                    'path_id': _build_path_id(
                        global_exchange=global_exchange,
                        korean_exchange=exchange,
                        transfer_coin='USDT',
                        domestic_withdrawal_network=e.row.network_label,
                        global_exit_mode='lightning',
                        global_exit_network=ln_network_label,
                        lightning_exit_provider=lightning_exit_provider,
                    ),
                    'btc_received': round(btc_received, 8),
                    'btc_received_usd': round(btc_received * ctx.global_btc_price_usd, 2),
                    'total_fee_krw': total_fee_krw,
                    'fee_pct': round(total_fee_krw / amount_krw * 100, 4),
                    'lightning_swap_fee_krw': ln_swap_fee_krw,
                    'global_withdrawal_fee_krw': global_ln_wd.fee_krw,
                    'breakdown': {
                        'components': components,
                        'total_fee_krw': total_fee_krw,
                    },
                })

            # ── BTC → 글로벌 → LN 경로 ──────────────────────────────────────
            for e in iter_btc_entries(bctx, exchange, mode='via'):
                ln = _ln_withdraw(e.amount_out, 'BTC')
                if ln is None:
                    continue
                global_ln_wd, ln_num_txs, global_ln_comp = ln

                swapped = _apply_swap(swap, global_ln_wd.amount_out)
                if swapped is None:
                    continue
                btc_received, ln_swap_fee_krw, swap_comps, lightning_exit_provider, swap_service = swapped
                if btc_received <= 0:
                    continue

                total_fee_krw = e.fee_krw + global_ln_wd.fee_krw + ln_swap_fee_krw
                components = list(e.components) + [global_ln_comp] + swap_comps

                paths.append({
                    'korean_exchange': exchange,
                    'transfer_coin': 'BTC',
                    'route_variant': 'btc_via_global',
                    'network': e.row.network_label,
                    'path_type': 'lightning_exit',
                    'swap_service': swap_service,
                    'domestic_withdrawal_network': e.row.network_label,
                    'global_exit_mode': 'lightning',
                    'global_exit_network': ln_network_label,
                    'lightning_exit_provider': lightning_exit_provider,
                    'num_withdrawal_txs': ln_num_txs,
                    'krw_per_tx_limit': None,
                    'path_id': _build_path_id(
                        global_exchange=global_exchange,
                        korean_exchange=exchange,
                        transfer_coin='BTC',
                        domestic_withdrawal_network=e.row.network_label,
                        global_exit_mode='lightning',
                        global_exit_network=ln_network_label,
                        lightning_exit_provider=lightning_exit_provider,
                    ) + '__via_global',
                    'btc_received': round(btc_received, 8),
                    'btc_received_usd': round(btc_received * ctx.global_btc_price_usd, 2),
                    'total_fee_krw': total_fee_krw,
                    'fee_pct': round(total_fee_krw / amount_krw * 100, 4),
                    'lightning_swap_fee_krw': ln_swap_fee_krw,
                    'global_withdrawal_fee_krw': global_ln_wd.fee_krw,
                    'breakdown': {
                        'components': components,
                        'total_fee_krw': total_fee_krw,
                    },
                })

    return BuildResult(paths, disabled_paths)
