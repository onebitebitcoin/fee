"""buy 경로 계산 — find_cheapest_path_from_snapshot_rows."""
from __future__ import annotations

import logging

from backend.app.domain.market_core import GROUPS, TRADING_FEES, get_withdrawal_source_url
from backend.app.domain.path_helpers import (
    _build_path_id,
    fee_component,
    is_suspended,
    resolve_global_onchain_wd_fee,
)
from backend.app.domain.paths_context import SnapshotContext, build_snapshot_context

logger = logging.getLogger(__name__)


def _build_available_filters(paths: list[dict]) -> dict:
    domestic_networks = sorted({
        path['domestic_withdrawal_network']
        for path in paths
        if path.get('domestic_withdrawal_network')
    })
    global_exit_options = sorted(
        {
            (
                path.get('global_exit_mode'),
                path.get('global_exit_network'),
            )
            for path in paths
            if path.get('global_exit_mode') and path.get('global_exit_network')
        },
        key=lambda item: (item[0] or '', item[1] or ''),
    )
    lightning_exit_providers = sorted({
        path['lightning_exit_provider']
        for path in paths
        if path.get('lightning_exit_provider')
    })
    return {
        'domestic_withdrawal_networks': domestic_networks,
        'global_exit_options': [
            {'mode': mode, 'network': network}
            for mode, network in global_exit_options
        ],
        'lightning_exit_providers': lightning_exit_providers,
    }


def _build_btc_paths(
    exchange: str,
    ctx: SnapshotContext,
    amount_krw: int,
    global_exchange: str,
) -> tuple[list[dict], list[dict]]:
    """BTC 직접 출금 경로와 disabled 경로 반환."""
    paths: list[dict] = []
    disabled_paths: list[dict] = []

    ticker_row = ctx.ticker_by_exchange.get(exchange)
    if ticker_row is None:
        return paths, disabled_paths

    korean_btc_price_krw = float(ticker_row.price)
    korean_taker = (
        ticker_row.taker_fee_pct / 100
        if ticker_row.taker_fee_pct is not None
        else TRADING_FEES[exchange]['taker']
    )

    for row in ctx.withdrawals_by_key.get((exchange, 'BTC'), []):
        if not row.enabled or row.fee is None:
            continue
        suspension_reason = is_suspended(ctx.maintenance_status, exchange, 'BTC', row.network_label)
        if suspension_reason:
            disabled_paths.append({
                'korean_exchange': exchange,
                'transfer_coin': 'BTC',
                'network': row.network_label,
                'reason': suspension_reason,
            })
            continue

        trading_fee_krw = round(amount_krw * korean_taker)
        btc_bought = (amount_krw - trading_fee_krw) / korean_btc_price_krw
        btc_received = btc_bought - row.fee
        if btc_received <= 0:
            continue

        withdrawal_fee_krw = (
            int(round(row.fee_krw))
            if row.fee_krw is not None
            else round(row.fee * korean_btc_price_krw)
        )
        total_fee_krw = trading_fee_krw + withdrawal_fee_krw
        paths.append({
            'korean_exchange': exchange,
            'transfer_coin': 'BTC',
            'network': row.network_label,
            'domestic_withdrawal_network': row.network_label,
            'global_exit_mode': 'onchain',
            'global_exit_network': row.network_label,
            'lightning_exit_provider': None,
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
                'components': [
                    fee_component('국내 매수 수수료', trading_fee_krw, rate_pct=korean_taker * 100),
                    fee_component(
                        'BTC 출금 수수료',
                        withdrawal_fee_krw,
                        amount_text=f'{row.fee} BTC',
                        source_url=get_withdrawal_source_url(exchange, 'BTC', row.network_label),
                    ),
                ],
                'total_fee_krw': total_fee_krw,
            },
        })

    return paths, disabled_paths


def _build_usdt_paths(
    exchange: str,
    ctx: SnapshotContext,
    amount_krw: int,
    global_exchange: str,
    global_onchain_wd_fee: float | None,
    global_onchain_wd_fee_krw: int,
    global_onchain_network_label: str | None,
) -> tuple[list[dict], list[dict]]:
    """USDT 경유 경로와 disabled 경로 반환."""
    paths: list[dict] = []
    disabled_paths: list[dict] = []

    ticker_row = ctx.ticker_by_exchange.get(exchange)
    if ticker_row is None:
        return paths, disabled_paths

    korean_taker = (
        ticker_row.taker_fee_pct / 100
        if ticker_row.taker_fee_pct is not None
        else TRADING_FEES[exchange]['taker']
    )

    for row in ctx.withdrawals_by_key.get((exchange, 'USDT'), []):
        if not row.enabled or row.fee is None:
            continue
        suspension_reason = is_suspended(ctx.maintenance_status, exchange, 'USDT', row.network_label)
        if suspension_reason:
            disabled_paths.append({
                'korean_exchange': exchange,
                'transfer_coin': 'USDT',
                'network': row.network_label,
                'reason': suspension_reason,
            })
            continue

        trading_fee_krw = round(amount_krw * korean_taker)
        usdt_bought = (amount_krw - trading_fee_krw) / ctx.usd_krw_rate
        usdt_after_withdrawal = usdt_bought - row.fee
        if usdt_after_withdrawal <= 0:
            continue

        global_trading_fee_usdt = usdt_after_withdrawal * ctx.global_taker
        usdt_for_btc = usdt_after_withdrawal - global_trading_fee_usdt
        btc_at_global = usdt_for_btc / ctx.global_btc_price_usd
        withdrawal_fee_krw = (
            int(round(row.fee_krw))
            if row.fee_krw is not None
            else round(row.fee * ctx.usd_krw_rate)
        )
        global_trading_fee_krw = round(global_trading_fee_usdt * ctx.usd_krw_rate)

        if global_onchain_wd_fee is not None:
            btc_received = btc_at_global - global_onchain_wd_fee
            total_fee_krw = trading_fee_krw + withdrawal_fee_krw + global_trading_fee_krw + global_onchain_wd_fee_krw
            wd_components = [
                fee_component('국내 매수 수수료', trading_fee_krw, rate_pct=korean_taker * 100),
                fee_component(
                    'USDT 출금 수수료',
                    withdrawal_fee_krw,
                    amount_text=f'{row.fee} USDT',
                    source_url=get_withdrawal_source_url(exchange, 'USDT', row.network_label),
                ),
                fee_component(
                    '해외 BTC 매수 수수료',
                    round(global_trading_fee_usdt * ctx.usd_krw_rate, 1),
                    rate_pct=ctx.global_taker * 100,
                    amount_text=f'{round(global_trading_fee_usdt, 8)} USDT',
                ),
                fee_component(
                    f'해외 BTC 출금 수수료 ({global_exchange})',
                    global_onchain_wd_fee_krw,
                    amount_text=f'{global_onchain_wd_fee} BTC',
                ),
            ]
        else:
            btc_received = btc_at_global
            total_fee_krw = trading_fee_krw + withdrawal_fee_krw + global_trading_fee_krw
            wd_components = [
                fee_component('국내 매수 수수료', trading_fee_krw, rate_pct=korean_taker * 100),
                fee_component(
                    'USDT 출금 수수료',
                    withdrawal_fee_krw,
                    amount_text=f'{row.fee} USDT',
                    source_url=get_withdrawal_source_url(exchange, 'USDT', row.network_label),
                ),
                fee_component(
                    '해외 BTC 매수 수수료',
                    round(global_trading_fee_usdt * ctx.usd_krw_rate, 1),
                    rate_pct=ctx.global_taker * 100,
                    amount_text=f'{round(global_trading_fee_usdt, 8)} USDT',
                ),
            ]

        if btc_received <= 0:
            continue

        paths.append({
            'korean_exchange': exchange,
            'transfer_coin': 'USDT',
            'network': row.network_label,
            'domestic_withdrawal_network': row.network_label,
            'global_exit_mode': 'onchain',
            'global_exit_network': global_onchain_network_label or 'Bitcoin',
            'lightning_exit_provider': None,
            'path_id': _build_path_id(
                global_exchange=global_exchange,
                korean_exchange=exchange,
                transfer_coin='USDT',
                domestic_withdrawal_network=row.network_label,
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
        })

    return paths, disabled_paths


def find_cheapest_path_from_snapshot_rows(
    amount_krw: int,
    global_exchange: str,
    latest_run,
    ticker_rows: list,
    withdrawal_rows: list,
    network_rows: list,
    lightning_swap_rows: list | None = None,
) -> dict:
    global_exchange = global_exchange.lower()
    if global_exchange not in GROUPS['global']:
        return {'error': f"지원하지 않는 글로벌 거래소: {global_exchange}. {GROUPS['global']} 중 선택"}

    ctx_or_err = build_snapshot_context(global_exchange, latest_run, ticker_rows, withdrawal_rows, network_rows)
    if isinstance(ctx_or_err, dict):
        return ctx_or_err
    ctx: SnapshotContext = ctx_or_err

    global_onchain_wd_fee, global_onchain_wd_fee_krw, global_onchain_network_label = resolve_global_onchain_wd_fee(
        ctx.withdrawals_by_key, global_exchange, ctx.global_btc_price_usd, ctx.usd_krw_rate
    )

    paths: list[dict] = []
    disabled_paths: list[dict] = []

    for exchange in GROUPS['korea']:
        if exchange not in ctx.ticker_by_exchange:
            continue
        p, d = _build_btc_paths(exchange, ctx, amount_krw, global_exchange)
        paths.extend(p)
        disabled_paths.extend(d)
        p, d = _build_usdt_paths(
            exchange, ctx, amount_krw, global_exchange,
            global_onchain_wd_fee, global_onchain_wd_fee_krw, global_onchain_network_label,
        )
        paths.extend(p)
        disabled_paths.extend(d)

    # Lightning exit 경로 추가
    if lightning_swap_rows:
        # buy 모드: ln_to_onchain 서비스만 사용 (BitFreezer 등)
        # 흐름: 한국 USDT → 글로벌 거래소 BTC Lightning 출금 → ln_to_onchain 스왑 → 개인 on-chain 지갑
        active_swaps_ln_to_onchain = [
            s for s in lightning_swap_rows
            if s.enabled and s.fee_pct is not None and getattr(s, 'direction', None) == 'ln_to_onchain'
        ]

        global_btc_withdrawals = ctx.withdrawals_by_key.get((global_exchange, 'BTC'), [])
        global_ln_wd_row = None
        for wd_row in global_btc_withdrawals:
            if wd_row.enabled and wd_row.fee is not None and 'lightning' in (wd_row.network_label or '').lower():
                global_ln_wd_row = wd_row
                break

        global_ln_wd_fee = global_ln_wd_row.fee if global_ln_wd_row else None
        global_ln_wd_fee_krw = (
            int(round(global_ln_wd_row.fee_krw))
            if global_ln_wd_row and global_ln_wd_row.fee_krw is not None
            else round(global_ln_wd_row.fee * ctx.global_btc_price_usd * ctx.usd_krw_rate)
            if global_ln_wd_row
            else 0
        )

        for swap in active_swaps_ln_to_onchain:
            fee_pct = swap.fee_pct / 100
            fee_fixed_btc = (swap.fee_fixed_sat or 0) / 1e8

            min_btc = (swap.min_amount_sat or 0) / 1e8
            max_btc = (swap.max_amount_sat or float('inf')) / 1e8

            for exchange in GROUPS['korea']:
                ticker_row = ctx.ticker_by_exchange.get(exchange)
                if ticker_row is None:
                    continue
                korean_taker = (
                    ticker_row.taker_fee_pct / 100
                    if ticker_row.taker_fee_pct is not None
                    else TRADING_FEES[exchange]['taker']
                )

                for row in ctx.withdrawals_by_key.get((exchange, 'USDT'), []):
                    if not row.enabled or row.fee is None:
                        continue
                    suspension_reason = is_suspended(ctx.maintenance_status, exchange, 'USDT', row.network_label)
                    if suspension_reason:
                        continue

                    trading_fee_krw = round(amount_krw * korean_taker)
                    usdt_bought = (amount_krw - trading_fee_krw) / ctx.usd_krw_rate
                    usdt_after_wd = usdt_bought - row.fee
                    if usdt_after_wd <= 0:
                        continue

                    global_trading_fee_usdt = usdt_after_wd * ctx.global_taker
                    usdt_for_btc = usdt_after_wd - global_trading_fee_usdt
                    btc_at_global = usdt_for_btc / ctx.global_btc_price_usd

                    if global_ln_wd_fee is None:
                        continue
                    btc_after_global_wd = btc_at_global - global_ln_wd_fee
                    if btc_after_global_wd <= 0:
                        continue
                    if not (min_btc <= btc_after_global_wd <= max_btc):
                        continue

                    ln_swap_fee_btc = btc_after_global_wd * fee_pct + fee_fixed_btc
                    btc_received = btc_after_global_wd - ln_swap_fee_btc
                    if btc_received <= 0:
                        continue

                    withdrawal_fee_krw = (
                        int(round(row.fee_krw))
                        if row.fee_krw is not None
                        else round(row.fee * ctx.usd_krw_rate)
                    )
                    global_trading_fee_krw = round(global_trading_fee_usdt * ctx.usd_krw_rate)
                    ln_swap_fee_krw = round(ln_swap_fee_btc * ctx.global_btc_price_usd * ctx.usd_krw_rate)
                    total_fee_krw = (
                        trading_fee_krw + withdrawal_fee_krw + global_trading_fee_krw
                        + global_ln_wd_fee_krw + ln_swap_fee_krw
                    )

                    components = [
                        fee_component('국내 매수 수수료', trading_fee_krw, rate_pct=korean_taker * 100),
                        fee_component(
                            'USDT 출금 수수료',
                            withdrawal_fee_krw,
                            amount_text=f'{row.fee} USDT',
                            source_url=get_withdrawal_source_url(exchange, 'USDT', row.network_label),
                        ),
                        fee_component(
                            '해외 BTC 매수 수수료',
                            round(global_trading_fee_usdt * ctx.usd_krw_rate, 1),
                            rate_pct=ctx.global_taker * 100,
                            amount_text=f'{round(global_trading_fee_usdt, 8)} USDT',
                        ),
                        fee_component(
                            f'해외 BTC 라이트닝 출금 수수료 ({global_exchange})',
                            global_ln_wd_fee_krw,
                            amount_text=f'{global_ln_wd_fee} BTC',
                        ),
                        fee_component(
                            f'라이트닝 스왑 수수료 ({swap.service_name})',
                            ln_swap_fee_krw,
                            rate_pct=swap.fee_pct,
                            amount_text=f'{round(ln_swap_fee_btc, 8)} BTC',
                        ),
                    ]

                    paths.append({
                        'korean_exchange': exchange,
                        'transfer_coin': 'USDT',
                        'network': row.network_label,
                        'path_type': 'lightning_exit',
                        'swap_service': swap.service_name,
                        'domestic_withdrawal_network': row.network_label,
                        'global_exit_mode': 'lightning',
                        'global_exit_network': global_ln_wd_row.network_label if global_ln_wd_row else 'Lightning Network',
                        'lightning_exit_provider': swap.service_name,
                        'path_id': _build_path_id(
                            global_exchange=global_exchange,
                            korean_exchange=exchange,
                            transfer_coin='USDT',
                            domestic_withdrawal_network=row.network_label,
                            global_exit_mode='lightning',
                            global_exit_network=global_ln_wd_row.network_label if global_ln_wd_row else 'Lightning Network',
                            lightning_exit_provider=swap.service_name,
                        ),
                        'btc_received': round(btc_received, 8),
                        'btc_received_usd': round(btc_received * ctx.global_btc_price_usd, 2),
                        'total_fee_krw': total_fee_krw,
                        'fee_pct': round(total_fee_krw / amount_krw * 100, 4),
                        'lightning_swap_fee_krw': ln_swap_fee_krw,
                        'global_withdrawal_fee_krw': global_ln_wd_fee_krw,
                        'breakdown': {
                            'components': components,
                            'total_fee_krw': total_fee_krw,
                        },
                    })

    paths.sort(key=lambda item: (item['total_fee_krw'], -item['btc_received']))
    lightning_services = sorted({
        s.service_name for s in (lightning_swap_rows or [])
        if s.enabled and s.fee_pct is not None
        and getattr(s, 'direction', None) == 'ln_to_onchain'
    })
    return {
        'amount_krw': amount_krw,
        'mode': 'buy',
        'global_exchange': global_exchange,
        'global_btc_price_usd': ctx.global_btc_price_usd,
        'usd_krw_rate': round(float(ctx.usd_krw_rate)),
        'total_paths_evaluated': len(paths),
        'best_path': paths[0] if paths else None,
        'top5': paths[:5],
        'all_paths': paths,
        'disabled_paths': disabled_paths,
        'available_filters': _build_available_filters(paths),
        'maintenance_checked_at': ctx.maintenance_checked_at,
        'data_source': 'latest_snapshot',
        'latest_scraping_time': int(latest_run.completed_at.timestamp()) if latest_run.completed_at else None,
        'lightning_swap_services': lightning_services,
        'last_run': ctx.last_run,
    }
