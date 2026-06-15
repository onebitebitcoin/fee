"""buy 경로 계산 — find_cheapest_path_from_snapshot_rows."""
from __future__ import annotations

import logging
from types import SimpleNamespace

from backend.app.domain.market_core import GROUPS, TRADING_FEES, get_withdrawal_source_url
from backend.app.domain.path_helpers import (
    _build_path_id,
    is_suspended,
    normalize_usdt_network,
    resolve_global_onchain_wd_fee,
)
from backend.app.domain.path_graph import (
    Blocked,
    global_buy_leg,
    korea_buy_leg,
    swap_leg,
    withdraw_leg,
)
from backend.app.domain.paths_context import SnapshotContext, build_snapshot_context
from backend.app.domain.korea_exchange_registry import get_withdrawal_limits

logger = logging.getLogger(__name__)


def _force_calc_withdraw(row, amount_coin, *, coin, price_krw, usd_krw,
                         num_txs=1, source_url=None, label_override=None):
    """enabled=False / 점검 정지 경로의 수수료를 강제 계산 (제약 우회).

    enabled·min·max를 무시하고 fee가 존재하면 수수료를 산출해 반환한다.
    fee=None이면 None 반환.
    """
    if row.fee is None:
        return None
    fake = SimpleNamespace(
        network_label=getattr(row, 'network_label', ''),
        fee=row.fee,
        fee_krw=getattr(row, 'fee_krw', None),
        enabled=True,
        min_withdrawal=None,
        max_withdrawal=None,
    )
    return withdraw_leg(
        fake, amount_coin,
        coin=coin, price_krw=price_krw, usd_krw=usd_krw,
        num_txs=num_txs, source_url=source_url, label_override=label_override,
    )


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


def _get_korean_taker(ticker_row, exchange: str) -> float:
    return (
        ticker_row.taker_fee_pct / 100
        if ticker_row.taker_fee_pct is not None
        else TRADING_FEES[exchange]['taker']
    )


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

    return paths, disabled_paths


def _build_btc_via_global_paths(
    exchange: str,
    ctx: SnapshotContext,
    amount_krw: int,
    global_exchange: str,
    global_onchain_wd_fee: float | None,
    global_onchain_wd_fee_krw: int,
    global_onchain_network_label: str | None,
) -> list[dict]:
    """국내 BTC 출금 → 글로벌 거래소 경유 → 개인 지갑 (온체인)."""
    if global_onchain_wd_fee is None:
        return []

    ticker_row = ctx.ticker_by_exchange.get(exchange)
    if ticker_row is None:
        return []

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
        from backend.app.domain.path_helpers import fee_component
        global_wd_comp = fee_component(
            f'해외 BTC 출금 ({global_exchange})', global_onchain_wd_fee_krw,
            amount_text=f'{round(global_onchain_wd_fee * 100_000_000):,} sats', is_fixed=True,
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

    return paths


def _build_usdt_paths(
    exchange: str,
    ctx: SnapshotContext,
    amount_krw: int,
    global_exchange: str,
    global_onchain_wd_fee: float | None,
    global_onchain_wd_fee_krw: int,
    global_onchain_network_label: str | None,
    global_usdt_nets: set[str] | None = None,
) -> tuple[list[dict], list[dict]]:
    """USDT 경유 경로와 disabled 경로 반환."""
    paths: list[dict] = []
    disabled_paths: list[dict] = []

    ticker_row = ctx.ticker_by_exchange.get(exchange)
    if ticker_row is None:
        return paths, disabled_paths

    korean_taker = _get_korean_taker(ticker_row, exchange)

    # 매수 엣지 (USDT)
    buy = korea_buy_leg(amount_krw, korean_taker, 0.0, 'USDT', ctx.usd_krw_rate)

    for row in ctx.withdrawals_by_key.get((exchange, 'USDT'), []):
        # 비활성화 여부 판단 (enabled=False 또는 점검 정지)
        is_disabled = False
        row_disabled_reason = None

        if not row.enabled:
            row_disabled_reason = getattr(row, 'suspension_reason', None) or 'disabled'
            is_disabled = True
        elif row.fee is None:
            continue
        elif global_usdt_nets and normalize_usdt_network(row.network_label) not in global_usdt_nets:
            # 글로벌 거래소 미지원 네트워크는 구조적 불가 — 수수료 계산 없이 기록만
            disabled_paths.append({
                'korean_exchange': exchange,
                'transfer_coin': 'USDT',
                'network': row.network_label,
                'reason': f'{global_exchange} USDT 입금 불가 네트워크',
            })
            continue
        else:
            susp = is_suspended(ctx.maintenance_status, exchange, 'USDT', row.network_label)
            if susp:
                row_disabled_reason = susp
                is_disabled = True

        if is_disabled and row.fee is None:
            disabled_paths.append({
                'korean_exchange': exchange,
                'transfer_coin': 'USDT',
                'network': row.network_label,
                'reason': row_disabled_reason,
                'suspension_message': getattr(row, 'suspension_message', None),
            })
            continue

        # USDT 출금 엣지 (비활성화 경로는 강제 계산)
        source_url = get_withdrawal_source_url(exchange, 'USDT', row.network_label)
        if is_disabled:
            usdt_wd = _force_calc_withdraw(
                row, buy.amount_out,
                coin='USDT', price_krw=ctx.usd_krw_rate, usd_krw=ctx.usd_krw_rate,
                source_url=source_url, label_override='USDT 출금 수수료',
            )
        else:
            usdt_wd = withdraw_leg(
                row, buy.amount_out,
                coin='USDT', price_krw=ctx.usd_krw_rate, usd_krw=ctx.usd_krw_rate,
                source_url=source_url,
                label_override='USDT 출금 수수료',
            )
        if usdt_wd is None or isinstance(usdt_wd, Blocked):
            disabled_paths.append({
                'korean_exchange': exchange,
                'transfer_coin': 'USDT',
                'network': row.network_label,
                'reason': usdt_wd.reason if isinstance(usdt_wd, Blocked) else (row_disabled_reason or 'disabled'),
            })
            continue
        if usdt_wd.amount_out <= 0:
            continue

        # USDT 출금 component amount_text 보정
        usdt_comp = usdt_wd.components[0].copy()
        usdt_comp['amount_text'] = f'{row.fee:g} USDT'

        # 글로벌 매수 엣지
        gbuy = global_buy_leg(usdt_wd.amount_out, ctx.global_taker, ctx.global_btc_price_usd, ctx.usd_krw_rate)

        from backend.app.domain.path_helpers import fee_component

        if global_onchain_wd_fee is not None:
            btc_received = gbuy.amount_out - global_onchain_wd_fee
            global_wd_comp = fee_component(
                f'해외 BTC 출금 수수료 ({global_exchange})', global_onchain_wd_fee_krw,
                amount_text=f'{round(global_onchain_wd_fee * 100_000_000):,} sats', is_fixed=True,
            )
            total_fee_krw = buy.fee_krw + usdt_wd.fee_krw + gbuy.fee_krw + global_onchain_wd_fee_krw
            wd_components = (
                list(buy.components)
                + [usdt_comp]
                + list(gbuy.components)
                + [global_wd_comp]
            )
        else:
            btc_received = gbuy.amount_out
            total_fee_krw = buy.fee_krw + usdt_wd.fee_krw + gbuy.fee_krw
            wd_components = (
                list(buy.components)
                + [usdt_comp]
                + list(gbuy.components)
            )

        if btc_received <= 0:
            continue

        entry: dict = {
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
        }
        if is_disabled:
            entry['disabled'] = True
            entry['disabled_reason'] = row_disabled_reason
        paths.append(entry)

    return paths, disabled_paths


def _resolve_global_ln_row(ctx: SnapshotContext, global_exchange: str):
    """글로벌 거래소 Lightning Network 출금 행 반환 (없으면 None)."""
    for wd_row in ctx.withdrawals_by_key.get((global_exchange, 'BTC'), []):
        if wd_row.enabled and wd_row.fee is not None and 'lightning' in (wd_row.network_label or '').lower():
            return wd_row
    return None


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
    swap_comp: dict | None,
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
        result.append(swap_comp)
    return result


def _build_lightning_paths(
    ctx: SnapshotContext,
    amount_krw: int,
    global_exchange: str,
    global_ln_wd_row,
    global_ln_fee_krw_val: int,
    lightning_swap_rows: list,
    global_usdt_nets: set[str],
) -> tuple[list[dict], list[dict]]:
    """Lightning exit 경로 생성 (ln_to_onchain 스왑 포함 / 직접출금 __).

    Returns:
        (paths, disabled_paths) — 글로벌 LN 출금 Blocked 사유를 중복 제거해 disabled_paths에 기록.
    """
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
            buy_usdt = korea_buy_leg(amount_krw, korean_taker, 0.0, 'USDT', ctx.usd_krw_rate)

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

                # 글로벌 LN 출금 엣지 — max_withdrawal 포함 모든 제약 검증
                global_ln_wd = withdraw_leg(
                    global_ln_wd_row, gbuy.amount_out,
                    coin='BTC', price_krw=ctx.global_btc_price_usd * ctx.usd_krw_rate,
                    usd_krw=ctx.usd_krw_rate,
                    label_override=f'해외 BTC 라이트닝 출금 수수료 ({global_exchange})',
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

                # 스왑 또는 직접 출금
                if swap is not None:
                    sl = swap_leg(swap, global_ln_wd.amount_out, ctx.global_btc_price_usd, ctx.usd_krw_rate)
                    if isinstance(sl, Blocked):
                        continue
                    btc_received = sl.amount_out
                    ln_swap_fee_krw = sl.fee_krw
                    swap_comp = sl.components[0]
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
                global_ln_comp['amount_text'] = f'{global_ln_wd_fee} BTC'

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

                # 글로벌 LN 출금 엣지 — max_withdrawal 포함 모든 제약 검증
                global_ln_wd = withdraw_leg(
                    global_ln_wd_row, domestic_wd.amount_out,
                    coin='BTC', price_krw=ctx.global_btc_price_usd * ctx.usd_krw_rate,
                    usd_krw=ctx.usd_krw_rate,
                    label_override=f'해외 BTC 라이트닝 출금 수수료 ({global_exchange})',
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
                    swap_comp = sl.components[0]
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
                global_ln_comp['amount_text'] = f'{global_ln_wd_fee} BTC'

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
                    'num_withdrawal_txs': 1,
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

    global_usdt_nets: set[str] = {
        normalize_usdt_network(r.network_label)
        for r in ctx.withdrawals_by_key.get((global_exchange, 'USDT'), [])
        if r.enabled and r.fee is not None
    }

    paths: list[dict] = []
    disabled_paths: list[dict] = []

    for exchange in GROUPS['korea']:
        if exchange not in ctx.ticker_by_exchange:
            continue
        p, d = _build_btc_paths(exchange, ctx, amount_krw, global_exchange)
        paths.extend(p)
        disabled_paths.extend(d)
        paths.extend(_build_btc_via_global_paths(
            exchange, ctx, amount_krw, global_exchange,
            global_onchain_wd_fee, global_onchain_wd_fee_krw, global_onchain_network_label,
        ))
        p, d = _build_usdt_paths(
            exchange, ctx, amount_krw, global_exchange,
            global_onchain_wd_fee, global_onchain_wd_fee_krw, global_onchain_network_label,
            global_usdt_nets=global_usdt_nets,
        )
        paths.extend(p)
        disabled_paths.extend(d)

    # Lightning exit 경로
    if lightning_swap_rows:
        global_ln_wd_row = _resolve_global_ln_row(ctx, global_exchange)
        if global_ln_wd_row is not None:
            ln_paths, ln_disabled = _build_lightning_paths(
                ctx, amount_krw, global_exchange,
                global_ln_wd_row, _global_ln_fee_krw(global_ln_wd_row, ctx),
                lightning_swap_rows, global_usdt_nets,
            )
            paths.extend(ln_paths)
            disabled_paths.extend(ln_disabled)

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
