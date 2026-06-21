"""Lightning exit 경로 — 글로벌 거래소 LN 출금 + (스왑 경유 / 직접출금).

집계 빌더: 내부에서 한국 거래소 전체를 순회하며 USDT→글로벌→LN, BTC→글로벌→LN 두 갈래를 만든다.
글로벌 LN 출금 행을 자체 해석하고, LN 출금 행이 없거나 스왑 행이 없으면 빈 결과를 반환한다.
"""
from __future__ import annotations

import math

from backend.app.domain.market_core import GROUPS, get_withdrawal_source_url
from backend.app.domain.path_graph import (
    Blocked,
    global_buy_leg,
    korea_buy_leg,
    swap_leg,
    withdraw_leg,
)
from backend.app.domain.path_helpers import (
    _build_path_id,
    is_suspended,
    normalize_usdt_network,
)
from backend.app.domain.paths_context import SnapshotContext
from backend.app.domain.paths.base import (
    BuilderContext,
    BuildResult,
    _ex_ko,
    _get_korean_taker,
)


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


def _global_ln_fee_krw(global_ln_wd_row, ctx: SnapshotContext) -> int:
    if global_ln_wd_row is None:
        return 0
    if global_ln_wd_row.fee_krw is not None:
        return int(round(global_ln_wd_row.fee_krw))
    return round(global_ln_wd_row.fee * ctx.global_btc_price_usd * ctx.usd_krw_rate)


def _build_ln_global_exit_components(
    buy_components: list[dict],
    usdt_comp: dict | None,
    gbuy_components: list[dict] | None,
    domestic_btc_comp: dict | None,
    global_ln_comp: dict,
    swap_comp: list[dict] | dict | None,
) -> list[dict]:
    """LN exit 경로의 components 목록 구성."""
    result = list(buy_components)
    if usdt_comp:
        result.append(usdt_comp)
    if gbuy_components:
        result.extend(gbuy_components)
    if domestic_btc_comp:
        result.append(domestic_btc_comp)
    result.append(global_ln_comp)
    if swap_comp:
        if isinstance(swap_comp, list):
            result.extend(swap_comp)
        else:
            result.append(swap_comp)
    return result


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
    global_usdt_nets = bctx.global_usdt_nets

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

    # 스왑 목록 + __direct__ 센티널 (None → 직접 출금)
    # swap_obj=None 이면 직접 출금 경로
    swap_variants: list = list(active_swaps) + [None]

    for swap in swap_variants:
        for exchange in GROUPS['korea']:
            ticker_row = ctx.ticker_by_exchange.get(exchange)
            if ticker_row is None:
                continue
            korean_taker = _get_korean_taker(ticker_row, exchange)

            # ── USDT → 글로벌 → LN 경로 ─────────────────────────────────────
            # USDT 매수 수량만 업비트 USDT(원달러 프리미엄 발생). 수수료 환산은 포렉스(usd_krw_rate).
            buy_usdt = korea_buy_leg(amount_krw, korean_taker, 0.0, 'USDT', ctx.usdt_buy_krw_rate)

            for row in ctx.withdrawals_by_key.get((exchange, 'USDT'), []):
                if not row.enabled or row.fee is None:
                    continue
                if global_usdt_nets and normalize_usdt_network(row.network_label) not in global_usdt_nets:
                    continue
                suspension_reason = is_suspended(ctx.maintenance_status, exchange, 'USDT', row.network_label)
                if suspension_reason:
                    continue

                source_url = get_withdrawal_source_url(exchange, 'USDT', row.network_label)
                usdt_wd = withdraw_leg(
                    row, buy_usdt.amount_out,
                    coin='USDT', price_krw=ctx.usd_krw_rate, usd_krw=ctx.usd_krw_rate,
                    source_url=source_url, label_override='USDT 출금 수수료',
                )
                if isinstance(usdt_wd, Blocked):
                    continue
                if usdt_wd.amount_out <= 0:
                    continue

                gbuy = global_buy_leg(usdt_wd.amount_out, ctx.global_taker, ctx.global_btc_price_usd, ctx.usd_krw_rate)

                # 글로벌 LN 출금 엣지 — 1회 한도 초과 시 분할 출금(수수료 × 횟수)
                ln_num_txs = _ln_num_txs(global_ln_wd_row, gbuy.amount_out)
                global_ln_wd = withdraw_leg(
                    global_ln_wd_row, gbuy.amount_out,
                    coin='BTC', price_krw=ctx.global_btc_price_usd * ctx.usd_krw_rate,
                    usd_krw=ctx.usd_krw_rate,
                    split_on_max=True,
                    label_override=f'해외 BTC 라이트닝 출금 수수료 ({_ex_ko(global_exchange)})'
                    + (f' · {ln_num_txs}회 분할' if ln_num_txs > 1 else ''),
                )
                if isinstance(global_ln_wd, Blocked):
                    _key = (exchange, 'USDT', ln_network_label, global_ln_wd.reason)
                    if _key not in _seen_disabled:
                        _seen_disabled.add(_key)
                        disabled_paths.append({
                            'korean_exchange': exchange,
                            'transfer_coin': 'USDT',
                            'network': ln_network_label,
                            'reason': global_ln_wd.reason,
                        })
                    continue
                if global_ln_wd.amount_out <= 0:
                    continue

                # 스왑 또는 직접 출금 — swap 수수료 KRW 환산도 포렉스(usd_krw_rate)
                if swap is not None:
                    sl = swap_leg(swap, global_ln_wd.amount_out, ctx.global_btc_price_usd, ctx.usd_krw_rate)
                    if isinstance(sl, Blocked):
                        continue
                    btc_received = sl.amount_out
                    ln_swap_fee_krw = sl.fee_krw
                    swap_comp = sl.components
                    lightning_exit_provider = swap.service_name
                    swap_service = swap.service_name
                    path_type = 'lightning_exit'
                else:
                    btc_received = global_ln_wd.amount_out
                    ln_swap_fee_krw = 0
                    swap_comp = None
                    lightning_exit_provider = '__direct__'
                    swap_service = None
                    path_type = 'lightning_exit'

                if btc_received <= 0:
                    continue

                # amount_text 보정
                usdt_comp = usdt_wd.components[0].copy()
                usdt_comp['amount_text'] = f'{row.fee:g} USDT'

                global_ln_comp = global_ln_wd.components[0].copy()
                global_ln_comp['amount_text'] = (
                    f'{round(global_ln_wd_fee * ln_num_txs, 8)} BTC ({ln_num_txs}회)'
                    if ln_num_txs > 1 else f'{global_ln_wd_fee} BTC'
                )

                total_fee_krw = (
                    buy_usdt.fee_krw + usdt_wd.fee_krw + gbuy.fee_krw
                    + global_ln_wd.fee_krw + ln_swap_fee_krw
                )
                components = _build_ln_global_exit_components(
                    buy_components=list(buy_usdt.components),
                    usdt_comp=usdt_comp,
                    gbuy_components=list(gbuy.components),
                    domestic_btc_comp=None,
                    global_ln_comp=global_ln_comp,
                    swap_comp=swap_comp,
                )

                paths.append({
                    'korean_exchange': exchange,
                    'transfer_coin': 'USDT',
                    'network': row.network_label,
                    'path_type': path_type,
                    'swap_service': swap_service,
                    'domestic_withdrawal_network': row.network_label,
                    'global_exit_mode': 'lightning',
                    'global_exit_network': ln_network_label,
                    'lightning_exit_provider': lightning_exit_provider,
                    'num_withdrawal_txs': ln_num_txs,
                    'path_id': _build_path_id(
                        global_exchange=global_exchange,
                        korean_exchange=exchange,
                        transfer_coin='USDT',
                        domestic_withdrawal_network=row.network_label,
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
            korean_btc_price_krw = float(ticker_row.price)
            buy_btc = korea_buy_leg(amount_krw, korean_taker, korean_btc_price_krw, 'BTC', ctx.usd_krw_rate)

            for row in ctx.withdrawals_by_key.get((exchange, 'BTC'), []):
                if not row.enabled or row.fee is None:
                    continue
                if is_suspended(ctx.maintenance_status, exchange, 'BTC', row.network_label):
                    continue

                # 국내 BTC → 글로벌 출금 엣지
                source_url = get_withdrawal_source_url(exchange, 'BTC', row.network_label)
                domestic_wd = withdraw_leg(
                    row, buy_btc.amount_out,
                    coin='BTC', price_krw=korean_btc_price_krw, usd_krw=ctx.usd_krw_rate,
                    num_txs=1, source_url=source_url,
                    label_override='국내 BTC 출금 수수료',
                )
                if isinstance(domestic_wd, Blocked):
                    continue
                if domestic_wd.amount_out <= 0:
                    continue

                # 글로벌 LN 출금 엣지 — 1회 한도 초과 시 분할 출금(수수료 × 횟수)
                ln_num_txs = _ln_num_txs(global_ln_wd_row, domestic_wd.amount_out)
                global_ln_wd = withdraw_leg(
                    global_ln_wd_row, domestic_wd.amount_out,
                    coin='BTC', price_krw=ctx.global_btc_price_usd * ctx.usd_krw_rate,
                    usd_krw=ctx.usd_krw_rate,
                    split_on_max=True,
                    label_override=f'해외 BTC 라이트닝 출금 수수료 ({_ex_ko(global_exchange)})'
                    + (f' · {ln_num_txs}회 분할' if ln_num_txs > 1 else ''),
                )
                if isinstance(global_ln_wd, Blocked):
                    _key = (exchange, 'BTC', ln_network_label, global_ln_wd.reason)
                    if _key not in _seen_disabled:
                        _seen_disabled.add(_key)
                        disabled_paths.append({
                            'korean_exchange': exchange,
                            'transfer_coin': 'BTC',
                            'network': ln_network_label,
                            'reason': global_ln_wd.reason,
                        })
                    continue
                if global_ln_wd.amount_out <= 0:
                    continue

                # 스왑 또는 직접 출금
                if swap is not None:
                    sl = swap_leg(swap, global_ln_wd.amount_out, ctx.global_btc_price_usd, ctx.usd_krw_rate)
                    if isinstance(sl, Blocked):
                        continue
                    btc_received = sl.amount_out
                    ln_swap_fee_krw = sl.fee_krw
                    swap_comp = sl.components
                    lightning_exit_provider = swap.service_name
                    swap_service = swap.service_name
                    path_type = 'lightning_exit'
                else:
                    btc_received = global_ln_wd.amount_out
                    ln_swap_fee_krw = 0
                    swap_comp = None
                    lightning_exit_provider = '__direct__'
                    swap_service = None
                    path_type = 'lightning_exit'

                if btc_received <= 0:
                    continue

                # amount_text 보정
                domestic_comp = domestic_wd.components[0].copy()
                domestic_comp['amount_text'] = f'{row.fee} BTC'

                global_ln_comp = global_ln_wd.components[0].copy()
                global_ln_comp['amount_text'] = (
                    f'{round(global_ln_wd_fee * ln_num_txs, 8)} BTC ({ln_num_txs}회)'
                    if ln_num_txs > 1 else f'{global_ln_wd_fee} BTC'
                )

                total_fee_krw = (
                    buy_btc.fee_krw + domestic_wd.fee_krw
                    + global_ln_wd.fee_krw + ln_swap_fee_krw
                )
                components = _build_ln_global_exit_components(
                    buy_components=list(buy_btc.components),
                    usdt_comp=None,
                    gbuy_components=None,
                    domestic_btc_comp=domestic_comp,
                    global_ln_comp=global_ln_comp,
                    swap_comp=swap_comp,
                )

                paths.append({
                    'korean_exchange': exchange,
                    'transfer_coin': 'BTC',
                    'route_variant': 'btc_via_global',
                    'network': row.network_label,
                    'path_type': path_type,
                    'swap_service': swap_service,
                    'domestic_withdrawal_network': row.network_label,
                    'global_exit_mode': 'lightning',
                    'global_exit_network': ln_network_label,
                    'lightning_exit_provider': lightning_exit_provider,
                    'num_withdrawal_txs': ln_num_txs,
                    'krw_per_tx_limit': None,
                    'path_id': _build_path_id(
                        global_exchange=global_exchange,
                        korean_exchange=exchange,
                        transfer_coin='BTC',
                        domestic_withdrawal_network=row.network_label,
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
