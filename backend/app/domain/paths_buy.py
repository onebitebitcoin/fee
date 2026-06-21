"""buy 경로 계산 오케스트레이터 — find_cheapest_path_from_snapshot_rows.

빌더 본체는 backend.app.domain.paths/ 패키지로 분리되어 있고, registry가 실행 순서를 정의한다.
이 모듈은 컨텍스트 빌드 → 레지스트리 순회 → 후처리(종착지 태깅/정렬/응답 envelope)만 담당한다.
"""
from __future__ import annotations

import logging

from backend.app.domain.market_core import GROUPS
from backend.app.domain.path_helpers import (
    normalize_usdt_network,
    resolve_global_onchain_wd_fee,
)
from backend.app.domain.paths_context import SnapshotContext, build_snapshot_context
from backend.app.domain.min_order_registry import calc_discarded_krw
from backend.app.domain.paths import (
    AGGREGATE_BUILDERS,
    PER_EXCHANGE_BUILDERS,
    BuilderContext,
)
from backend.app.domain.paths.destination import resolve_destination

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


def find_cheapest_path_from_snapshot_rows(
    amount_krw: int,
    global_exchange: str,
    latest_run,
    ticker_rows: list,
    withdrawal_rows: list,
    network_rows: list,
    lightning_swap_rows: list | None = None,
    usdt_krw_rate: float | None = None,
) -> dict:
    global_exchange = global_exchange.lower()
    if global_exchange not in GROUPS['global']:
        return {'error': f"지원하지 않는 글로벌 거래소: {global_exchange}. {GROUPS['global']} 중 선택"}

    ctx_or_err = build_snapshot_context(
        global_exchange, latest_run, ticker_rows, withdrawal_rows, network_rows,
        usdt_krw_rate=usdt_krw_rate,
    )
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

    bctx = BuilderContext(
        ctx=ctx,
        amount_krw=amount_krw,
        global_exchange=global_exchange,
        global_onchain_wd_fee=global_onchain_wd_fee,
        global_onchain_wd_fee_krw=global_onchain_wd_fee_krw,
        global_onchain_network_label=global_onchain_network_label,
        global_usdt_nets=global_usdt_nets,
        lightning_swap_rows=lightning_swap_rows or [],
    )

    paths: list[dict] = []
    disabled_paths: list[dict] = []

    # 거래소별 빌더 — 삽입 순서 보존(stable sort 결과 일치)
    for exchange in GROUPS['korea']:
        if exchange not in ctx.ticker_by_exchange:
            continue
        for builder in PER_EXCHANGE_BUILDERS:
            result = builder(bctx, exchange)
            paths.extend(result.paths)
            disabled_paths.extend(result.disabled)

    # 집계 빌더 (Lightning 등) — 거래소 루프 이후 실행
    for builder in AGGREGATE_BUILDERS:
        result = builder(bctx)
        paths.extend(result.paths)
        disabled_paths.extend(result.disabled)

    # 최소 주문 단위로 인해 못 쓰고 남는 잔돈(표시용 근사). btc_received는 건드리지 않는다.
    # 종착지(destination) 태깅은 paths/destination.py 리졸버에 위임 (선언적 규칙).
    for p in paths:
        p['discarded_krw'] = calc_discarded_krw(amount_krw, p['korean_exchange'])
        p['destination'] = resolve_destination(p)

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
        # USDT 매수에 실제 사용한 한국 USDT/KRW 환율 (프론트가 동일 환율로 평가해 잔차 0)
        'usdt_buy_krw_rate': round(float(ctx.usdt_buy_krw_rate), 2),
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
