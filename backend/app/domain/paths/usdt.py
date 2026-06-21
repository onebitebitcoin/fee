"""USDT 경유 경로 — 국내 USDT 매수·출금 → 글로벌 거래소 BTC 매수 → 온체인 개인 지갑."""
from __future__ import annotations

from backend.app.domain.market_core import get_withdrawal_source_url
from backend.app.domain.path_graph import (
    Blocked,
    global_buy_leg,
    korea_buy_leg,
    withdraw_leg,
)
from backend.app.domain.path_helpers import (
    _build_path_id,
    fee_component,
    is_suspended,
    normalize_usdt_network,
)
from backend.app.domain.paths.base import (
    BuilderContext,
    BuildResult,
    _force_calc_withdraw,
    _get_korean_taker,
)


def build_usdt(bctx: BuilderContext, exchange: str) -> BuildResult:
    """USDT 경유 경로와 disabled 경로 반환."""
    ctx = bctx.ctx
    amount_krw = bctx.amount_krw
    global_exchange = bctx.global_exchange
    global_onchain_wd_fee = bctx.global_onchain_wd_fee
    global_onchain_network_label = bctx.global_onchain_network_label
    global_usdt_nets = bctx.global_usdt_nets

    paths: list[dict] = []
    disabled_paths: list[dict] = []

    ticker_row = ctx.ticker_by_exchange.get(exchange)
    if ticker_row is None:
        return BuildResult(paths, disabled_paths)

    korean_taker = _get_korean_taker(ticker_row, exchange)

    # 매수 엣지 (USDT) — 한국 거래소 USDT/KRW 실거래가(usdt_buy_krw_rate)로 매수.
    # 이 단계에서만 원달러 프리미엄(업비트 USDT vs 포렉스)이 발생한다. 수수료 환산은 포렉스.
    buy = korea_buy_leg(amount_krw, korean_taker, 0.0, 'USDT', ctx.usdt_buy_krw_rate)

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

        # 글로벌 매수 엣지 — 수수료 원화 환산은 포렉스(usd_krw_rate). 매수 수량만 업비트 USDT.
        gbuy = global_buy_leg(usdt_wd.amount_out, ctx.global_taker, ctx.global_btc_price_usd, ctx.usd_krw_rate)

        if global_onchain_wd_fee is not None:
            btc_received = gbuy.amount_out - global_onchain_wd_fee
            # 글로벌 BTC 출금 수수료(BTC)→KRW도 포렉스(usd_krw_rate)로 환산.
            onchain_wd_fee_krw = round(global_onchain_wd_fee * ctx.global_btc_price_usd * ctx.usd_krw_rate)
            global_wd_comp = fee_component(
                f'해외 BTC 출금 수수료 ({global_exchange})', onchain_wd_fee_krw,
                amount_text=f'{round(global_onchain_wd_fee * 100_000_000):,} sats', is_fixed=True,
                move_amount=btc_received, move_coin='BTC',
                move_amount_krw=round(btc_received * ctx.global_btc_price_usd * ctx.usd_krw_rate),
            )
            total_fee_krw = buy.fee_krw + usdt_wd.fee_krw + gbuy.fee_krw + onchain_wd_fee_krw
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

    return BuildResult(paths, disabled_paths)
