"""동적 수수료를 반영한 경로 계산 — FDUSD maker 0% 포함."""
from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
from backend.app.domain.market_core import (
    GROUPS,
    GLOBAL_FETCHERS,
    KOREA_FETCHERS,
    TRADING_FEES,
    check_maintenance_status,
    fetch_usd_krw_rate,
    get_withdrawal_data,
)
from backend.app.domain.path_helpers import (
    fee_component,
    is_bitcoin_native_network,
)
from backend.app.domain.path_graph import (
    row_from_dict,
    korea_buy_leg,
    withdraw_leg,
    global_buy_leg,
    global_buy_maker_leg,
    swap_leg,
    Blocked,
)
from backend.app.domain.korea_exchange_registry import get_withdrawal_limits
from backend.app.services.promo_scraper import NO_PROMO_NOTES, PromoContext, fetch_promo_context

logger = logging.getLogger(__name__)

_DEFAULT_GLOBAL_TAKER = 0.001  # 0.1%

# Lightning 스왑 서비스: LN → 온체인 변환 수수료
# 출처: lightning_scraper.py get_all_lightning_swap_fees() 실시간 API (2026-06-01 기준)
LIGHTNING_SWAP_SERVICES = [
    {
        'name': 'strike',
        'display': 'Strike',
        'fee_pct': 0.0,            # 0% — 실시간 API 확인 (2026-06-01)
        'fixed_fee_btc': 0.0,
        'kyc': True,               # 계정/KYC 필요 (미국 서비스)
    },
    {
        'name': 'oksusu',
        'display': 'CornWallet',   # team.oksu.su = CornWallet (옥수수) — 구 cornwallet.net의 현재 도메인
        'fee_pct': 0.0049,         # 0.49% — 실시간 API 확인 (2026-06-01)
        'fixed_fee_btc': 0.0,
        'kyc': False,              # 비KYC
    },
    {
        'name': 'boltz',
        'display': 'Boltz',
        'fee_pct': 0.005,          # 0.5% — 실시간 API 확인 (2026-06-01)
        'fixed_fee_btc': 0.0,      # 고정비 없음 (이전 200 sats 오류였음)
        'kyc': False,              # 비수탁, 오픈소스 서브마린 스왑
    },
    {
        'name': 'coinos',
        'display': 'Coinos',
        'fee_pct': 0.005,          # 0.5% — 실시간 API 확인 (2026-06-01)
        'fixed_fee_btc': 0.0,
        'kyc': False,              # 비KYC
    },
    {
        'name': 'walletofsatoshi',
        'display': 'WalletOfSatoshi',
        'fee_pct': 0.0195,         # 1.95% — 실시간 API 확인 (2026-06-01, 기존 1.9% 오류)
        'fixed_fee_btc': 0.0,
        'kyc': False,              # 비KYC (계정 불필요)
    },
    # Bitfreezer: API 403 차단 — 수수료 미확인, 제외
    # (CornWallet = oksusu 항목으로 통합, team.oksu.su 도메인 운영 중)
]


def _get_global_taker(exchange: str, quote_coin: str, promo: PromoContext) -> float:
    override = promo.get_global_taker(exchange, quote_coin)
    if override is not None:
        return override
    entry = TRADING_FEES[exchange]
    return entry['spot']['taker'] if isinstance(entry.get('spot'), dict) else entry['taker']


def _get_global_maker(exchange: str, quote_coin: str, promo: PromoContext) -> float:
    override = promo.get_global_maker(exchange, quote_coin)
    if override is not None:
        return override
    entry = TRADING_FEES[exchange]
    return entry['spot']['maker'] if isinstance(entry.get('spot'), dict) else entry['maker']


def _build_usdt_onchain_paths(
    exchange: str,
    usdt_networks: list,
    korean_taker: float,
    amount_krw: int,
    usd_krw_rate: float,
    korean_usdt_price_krw: float,
    global_btc_price_usd: float,
    global_exchange: str,
    global_taker_usdt: float,
    global_onchain_wd_fee: float | None,
    global_onchain_wd_fee_krw: int,
    maintenance_status: dict,
) -> list[dict]:
    """USDT → 글로벌 → BTC 온체인 경로."""
    paths = []
    # 국내 매수 수수료 (USDT): 인라인 계산 유지 (korean_usdt_price_krw 기준)
    # korea_buy_leg USDT 브랜치는 usd_krw_rate로 나누어 실거래가와 다름 — 직접 계산
    trading_fee_krw = round(amount_krw * korean_taker)
    usdt_bought = (amount_krw - trading_fee_krw) / korean_usdt_price_krw
    buy_comp = fee_component('국내 매수 수수료', trading_fee_krw, input_krw=amount_krw, is_fixed=False)

    for network in usdt_networks:
        # 국내 USDT 출금 엣지 (enabled/min/max/suspension 통일 검증)
        row = row_from_dict(network)
        wd = withdraw_leg(
            row, usdt_bought,
            coin='USDT', price_krw=korean_usdt_price_krw, usd_krw=usd_krw_rate,
            maintenance_status=maintenance_status, exchange=exchange,
        )
        if isinstance(wd, Blocked):
            continue

        usdt_after = wd.amount_out
        if usdt_after <= 0:
            continue

        # 글로벌 거래소 BTC 매수 엣지 (USDT/taker)
        gbl = global_buy_leg(usdt_after, global_taker_usdt, global_btc_price_usd, usd_krw_rate)
        btc_at_global = gbl.amount_out

        if global_onchain_wd_fee is not None:
            # 글로벌 BTC 온체인 출금 엣지
            global_wd_row = SimpleNamespace(
                network_label='Bitcoin',
                fee=global_onchain_wd_fee,
                enabled=True,
                fee_krw=global_onchain_wd_fee_krw,
                min_withdrawal=None,
                max_withdrawal=None,
            )
            gwd = withdraw_leg(
                global_wd_row, btc_at_global,
                coin='BTC', price_krw=0.0, usd_krw=0.0,
                label_override=f'해외 BTC 출금 ({global_exchange})',
            )
            if isinstance(gwd, Blocked):
                continue
            btc_received = gwd.amount_out
            total_fee_krw = trading_fee_krw + wd.fee_krw + gbl.fee_krw + gwd.fee_krw
            components = [buy_comp] + wd.components + gbl.components + gwd.components
        else:
            btc_received = btc_at_global
            total_fee_krw = trading_fee_krw + wd.fee_krw + gbl.fee_krw
            components = [buy_comp] + wd.components + gbl.components

        if btc_received <= 0:
            continue

        paths.append({
            'korean_exchange': exchange,
            'transfer_coin': 'USDT',
            'network': network['label'],
            'global_exit_mode': 'onchain',
            'global_exit_network': 'Bitcoin',
            'quote_strategy': 'usdt_taker',
            'btc_received': round(btc_received, 8),
            'btc_received_usd': round(btc_received * global_btc_price_usd, 2),
            'total_fee_krw': total_fee_krw,
            'fee_pct': round(total_fee_krw / amount_krw * 100, 4),
            'breakdown': {'components': components, 'total_fee_krw': total_fee_krw},
        })
    return paths


def _build_fdusd_maker_paths(
    exchange: str,
    usdt_networks: list,
    korean_taker: float,
    amount_krw: int,
    usd_krw_rate: float,
    korean_usdt_price_krw: float,
    global_btc_price_usd: float,
    global_exchange: str,
    fdusd_maker_fee: float,
    fdusd_convert_spread: float,
    global_onchain_wd_fee: float | None,
    global_onchain_wd_fee_krw: int,
    maintenance_status: dict,
) -> list[dict]:
    """USDT → Convert FDUSD → BTC/FDUSD 지정가(maker 0%) 경로."""
    paths = []
    # 국내 매수 수수료 (USDT): 인라인 계산 유지 (korean_usdt_price_krw 기준)
    trading_fee_krw = round(amount_krw * korean_taker)
    usdt_bought = (amount_krw - trading_fee_krw) / korean_usdt_price_krw
    buy_comp = fee_component('국내 매수 수수료', trading_fee_krw, input_krw=amount_krw, is_fixed=False)

    for network in usdt_networks:
        # 국내 USDT 출금 엣지 (enabled/min/max/suspension 통일 검증)
        row = row_from_dict(network)
        wd = withdraw_leg(
            row, usdt_bought,
            coin='USDT', price_krw=korean_usdt_price_krw, usd_krw=usd_krw_rate,
            maintenance_status=maintenance_status, exchange=exchange,
        )
        if isinstance(wd, Blocked):
            continue

        usdt_after = wd.amount_out
        if usdt_after <= 0:
            continue

        # USDT → FDUSD 전환 + maker 매수 엣지
        gbl = global_buy_maker_leg(usdt_after, fdusd_maker_fee, fdusd_convert_spread, global_btc_price_usd, usd_krw_rate)
        btc_at_global = gbl.amount_out

        if global_onchain_wd_fee is not None:
            global_wd_row = SimpleNamespace(
                network_label='Bitcoin',
                fee=global_onchain_wd_fee,
                enabled=True,
                fee_krw=global_onchain_wd_fee_krw,
                min_withdrawal=None,
                max_withdrawal=None,
            )
            gwd = withdraw_leg(
                global_wd_row, btc_at_global,
                coin='BTC', price_krw=0.0, usd_krw=0.0,
                label_override=f'해외 BTC 출금 ({global_exchange})',
            )
            if isinstance(gwd, Blocked):
                continue
            btc_received = gwd.amount_out
            total_fee_krw = trading_fee_krw + wd.fee_krw + gbl.fee_krw + gwd.fee_krw
            components = [buy_comp] + wd.components + gbl.components + gwd.components
        else:
            btc_received = btc_at_global
            total_fee_krw = trading_fee_krw + wd.fee_krw + gbl.fee_krw
            components = [buy_comp] + wd.components + gbl.components

        if btc_received <= 0:
            continue

        paths.append({
            'korean_exchange': exchange,
            'transfer_coin': 'USDT',
            'network': network['label'],
            'global_exit_mode': 'onchain',
            'global_exit_network': 'Bitcoin',
            'quote_strategy': 'fdusd_maker',
            'fdusd_convert_spread_pct': round(fdusd_convert_spread * 100, 4),
            'fdusd_maker_fee_pct': round(fdusd_maker_fee * 100, 4),
            'btc_received': round(btc_received, 8),
            'btc_received_usd': round(btc_received * global_btc_price_usd, 2),
            'total_fee_krw': total_fee_krw,
            'fee_pct': round(total_fee_krw / amount_krw * 100, 4),
            'breakdown': {'components': components, 'total_fee_krw': total_fee_krw},
        })
    return paths


def _build_ln_exit_paths(
    exchange: str,
    usdt_networks: list,
    korean_taker: float,
    amount_krw: int,
    usd_krw_rate: float,
    korean_usdt_price_krw: float,
    global_btc_price_usd: float,
    global_exchange: str,
    global_taker_usdt: float,
    fdusd_maker_fee: float | None,
    fdusd_convert_spread: float,
    fdusd_promo_active: bool,
    ln_wd_fee_btc: float,
    ln_wd_min_btc: float,
    ln_wd_max_btc: float | None,
    maintenance_status: dict,
    include_fdusd: bool = False,
) -> list[dict]:
    """글로벌 거래소 Lightning 출금 → 스왑 서비스 → 개인 온체인 지갑 경로."""
    paths = []
    strategies = [('usdt_taker', global_taker_usdt)]
    if include_fdusd and fdusd_promo_active and fdusd_maker_fee is not None:
        strategies.append(('fdusd_maker', fdusd_maker_fee))

    # 글로벌 LN 출금 row (fee_krw=None → price_krw로 환산)
    ln_wd_row = SimpleNamespace(
        network_label='Lightning Network',
        fee=ln_wd_fee_btc,
        enabled=True,
        fee_krw=None,
        min_withdrawal=None,   # LN min/max는 btc_after_ln_wd 기준으로 아래서 직접 검사
        max_withdrawal=None,
    )

    # 국내 매수 수수료 (USDT): 인라인 계산 유지 (korean_usdt_price_krw 기준)
    trading_fee_krw = round(amount_krw * korean_taker)
    usdt_bought = (amount_krw - trading_fee_krw) / korean_usdt_price_krw
    buy_comp = fee_component('국내 매수 수수료', trading_fee_krw, input_krw=amount_krw, is_fixed=False)

    for network in usdt_networks:
        # 국내 USDT 출금 엣지
        row = row_from_dict(network)
        wd = withdraw_leg(
            row, usdt_bought,
            coin='USDT', price_krw=korean_usdt_price_krw, usd_krw=usd_krw_rate,
            maintenance_status=maintenance_status, exchange=exchange,
        )
        if isinstance(wd, Blocked):
            continue

        usdt_after = wd.amount_out
        if usdt_after <= 0:
            continue

        for quote_strategy, buy_fee_rate in strategies:
            # 글로벌 거래소 BTC 매수 엣지
            if quote_strategy == 'fdusd_maker':
                gbl = global_buy_maker_leg(usdt_after, buy_fee_rate, fdusd_convert_spread, global_btc_price_usd, usd_krw_rate)
            else:
                gbl = global_buy_leg(usdt_after, buy_fee_rate, global_btc_price_usd, usd_krw_rate)
            btc_at_global = gbl.amount_out

            # 글로벌 LN 출금 엣지
            ln_wd = withdraw_leg(
                ln_wd_row, btc_at_global,
                coin='BTC', price_krw=global_btc_price_usd * usd_krw_rate, usd_krw=usd_krw_rate,
                label_override=f'⚡ LN 출금 ({global_exchange})',
            )
            if isinstance(ln_wd, Blocked):
                continue
            btc_after_ln_wd = ln_wd.amount_out

            # LN 출금 후 min/max 검사 (btc_after_ln_wd 기준)
            if btc_after_ln_wd < ln_wd_min_btc:
                continue
            if ln_wd_max_btc is not None and btc_after_ln_wd > ln_wd_max_btc:
                continue

            base_fee_krw = trading_fee_krw + wd.fee_krw + gbl.fee_krw + ln_wd.fee_krw
            base_components = [buy_comp] + wd.components + gbl.components + ln_wd.components

            # LN 출금 → 스왑 서비스 → 개인 온체인 지갑 (자기수탁)
            for svc in LIGHTNING_SWAP_SERVICES:
                # swap_leg는 fee_pct를 퍼센트로 받으므로 svc['fee_pct'](소수) × 100 변환
                swap_obj = SimpleNamespace(
                    service_name=svc['display'],
                    fee_pct=svc['fee_pct'] * 100,
                    fee_fixed_sat=round(svc.get('fixed_fee_btc', 0.0) * 1e8),
                    min_amount_sat=0,
                    max_amount_sat=None,
                )
                swp = swap_leg(swap_obj, btc_after_ln_wd, global_btc_price_usd, usd_krw_rate)
                if isinstance(swp, Blocked):
                    continue
                btc_received = swp.amount_out
                if btc_received <= 0:
                    continue

                total_fee_krw = base_fee_krw + swp.fee_krw

                paths.append({
                    'korean_exchange': exchange,
                    'transfer_coin': 'USDT',
                    'network': network['label'],
                    'global_exit_mode': 'lightning_swap',
                    'global_exit_network': 'Lightning Network',
                    'quote_strategy': quote_strategy,
                    'ln_swap_service': svc['name'],
                    'ln_swap_display': svc['display'],
                    'ln_swap_kyc': svc.get('kyc', True),
                    'destination': 'onchain_wallet',
                    'btc_received': round(btc_received, 8),
                    'btc_received_usd': round(btc_received * global_btc_price_usd, 2),
                    'total_fee_krw': total_fee_krw,
                    'fee_pct': round(total_fee_krw / amount_krw * 100, 4),
                    'breakdown': {
                        'components': base_components + swp.components,
                        'total_fee_krw': total_fee_krw,
                    },
                })

    return paths


def _build_btc_via_global_paths(
    exchange: str,
    btc_wd_networks: list,
    korean_taker: float,
    amount_krw: int,
    effective_btc_price_krw: float,
    korean_btc_price_krw: float,
    slip_pct: float,
    global_exchange: str,
    global_btc_price_usd: float,
    global_onchain_wd_fee: float | None,
    global_onchain_wd_fee_krw: int,
    maintenance_status: dict,
) -> list[dict]:
    """국내 비트코인 출금 → 글로벌 거래소 입금 → 비트코인 출금 → 개인 지갑.

    해외 거래소에서 별도 매매 없이 비트코인을 바로 내 지갑으로 출금한다.
    수수료: 국내 매수 + 국내 BTC 출금 + 해외 BTC 출금
    """
    if global_onchain_wd_fee is None:
        return []

    paths = []
    # 글로벌 BTC 출금 row 사전 생성 (fee_krw 확정으로 환산 생략)
    global_wd_row = SimpleNamespace(
        network_label='Bitcoin',
        fee=global_onchain_wd_fee,
        enabled=True,
        fee_krw=global_onchain_wd_fee_krw,
        min_withdrawal=None,
        max_withdrawal=None,
    )

    for network in btc_wd_networks:
        # 국내 BTC 출금 엣지 (enabled/min/max/suspension 통일 검증)
        row = row_from_dict(network)
        buy = korea_buy_leg(amount_krw, korean_taker, effective_btc_price_krw, 'BTC', 0.0)
        btc_bought = buy.amount_out

        wd = withdraw_leg(
            row, btc_bought,
            coin='BTC', price_krw=effective_btc_price_krw, usd_krw=0.0,
            label_override='국내 비트코인 출금 수수료',
            maintenance_status=maintenance_status, exchange=exchange,
        )
        if isinstance(wd, Blocked):
            continue

        btc_after_domestic_wd = wd.amount_out
        if btc_after_domestic_wd <= 0:
            continue

        # 글로벌 BTC 출금 엣지 (fee_krw가 row에 확정돼 있으므로 price_krw 불필요, 0 전달)
        gwd = withdraw_leg(
            global_wd_row, btc_after_domestic_wd,
            coin='BTC', price_krw=0.0, usd_krw=0.0,
            label_override=f'해외 BTC 출금 ({global_exchange})',
        )
        if isinstance(gwd, Blocked):
            continue
        btc_received = gwd.amount_out
        if btc_received <= 0:
            continue

        # 슬리피지 비용 별도 추가 (엣지에 없으므로 인라인)
        slippage_cost_krw = (
            round((effective_btc_price_krw - korean_btc_price_krw) * btc_bought)
            if slip_pct > 0 else 0
        )
        total_fee_krw = buy.fee_krw + wd.fee_krw + gwd.fee_krw + slippage_cost_krw

        components = list(buy.components)
        if slippage_cost_krw > 0:
            components.append(fee_component(
                f'슬리피지 추정 ({slip_pct:.2f}%)', slippage_cost_krw,
                input_krw=amount_krw,
                amount_text='추정값, 실제 체결가 기준', is_fixed=False,
            ))
        components += wd.components + gwd.components

        paths.append({
            'korean_exchange': exchange,
            'transfer_coin': 'BTC',
            'route_variant': 'btc_via_global',
            'network': network['label'],
            'global_exit_mode': 'onchain',
            'global_exit_network': 'Bitcoin',
            'quote_strategy': 'btc_via_global',
            'slippage_pct': slip_pct,
            'btc_received': round(btc_received, 8),
            'btc_received_usd': round(btc_received * global_btc_price_usd, 2),
            'total_fee_krw': total_fee_krw,
            'fee_pct': round(total_fee_krw / amount_krw * 100, 4),
            'breakdown': {'components': components, 'total_fee_krw': total_fee_krw},
        })
    return paths


def find_cheapest_path_dynamic(
    amount_krw: int = 1_000_000,
    global_exchange: str = 'binance',
    promo_ctx: PromoContext | None = None,
    include_fdusd: bool = False,
) -> dict:
    """
    실시간 프로모션을 반영한 경로 계산.
    promo_ctx가 None이면 자동으로 fetch_promo_context()를 호출.
    include_fdusd=False(기본)이면 FDUSD maker 경로를 제외한다.
    """
    global_exchange = global_exchange.lower()
    if global_exchange not in GROUPS['global']:
        return {'error': f'지원하지 않는 거래소: {global_exchange}'}

    if promo_ctx is None:
        promo_ctx = fetch_promo_context()

    try:
        global_fn = (
            GLOBAL_FETCHERS[global_exchange]['spot']
            if isinstance(GLOBAL_FETCHERS[global_exchange], dict)
            else GLOBAL_FETCHERS[global_exchange]
        )

        with ThreadPoolExecutor(max_workers=24) as executor:
            fut_rate = executor.submit(fetch_usd_krw_rate)
            fut_global = executor.submit(global_fn)
            fut_tickers = {ex: executor.submit(fn) for ex, fn in KOREA_FETCHERS.items()}
            fut_usdt_tickers = {ex: executor.submit(fn, 'USDT') for ex, fn in KOREA_FETCHERS.items()}
            fut_withdrawals = {
                (ex, coin): executor.submit(get_withdrawal_data, ex, coin)
                for ex in GROUPS['korea']
                for coin in ['BTC', 'USDT']
            }
            fut_global_btc_wd = executor.submit(get_withdrawal_data, global_exchange, 'BTC')

        usd_krw_rate = fut_rate.result()
        global_btc_price_usd = float(fut_global.result()['price'])

        # 글로벌 거래소 온체인/LN BTC 출금 수수료 파싱
        global_onchain_wd_fee: float | None = None
        global_onchain_wd_fee_krw: int = 0
        global_ln_wd_fee: float | None = None
        global_ln_wd_min: float = 0.0
        global_ln_wd_max: float | None = None
        for net in fut_global_btc_wd.result():
            label = (net.get('label', '') or '').lower()
            fee = net.get('fee')
            if not net.get('enabled', True) or fee is None:
                continue
            if is_bitcoin_native_network(label):
                if global_onchain_wd_fee is None:
                    global_onchain_wd_fee = fee
                    global_onchain_wd_fee_krw = round(fee * global_btc_price_usd * usd_krw_rate)
            elif 'lightning' in label:
                global_ln_wd_fee = fee
                global_ln_wd_min = net.get('min') or 0.0
                global_ln_wd_max = net.get('max')

        # OKX/Coinbase: BTC 출금 수수료 미포함 (변동/추정 수수료라 비교 불가)
        if global_exchange in ('okx', 'coinbase'):
            global_onchain_wd_fee = None
            global_onchain_wd_fee_krw = 0

        # 동적 수수료 값
        global_taker_usdt = _get_global_taker(global_exchange, 'USDT', promo_ctx)
        fdusd_maker_fee = _get_global_maker(global_exchange, 'FDUSD', promo_ctx)
        fdusd_convert_spread = promo_ctx.get_convert_spread('USDT', 'FDUSD') or 0.0005
        fdusd_promo_active = fdusd_maker_fee is not None and fdusd_maker_fee == 0.0

        try:
            maintenance_status = check_maintenance_status(list(GROUPS['korea']))
        except Exception:
            maintenance_status = {}

        # 김치 프리미엄 계산 — 포렉스(은행간) 환율 기준
        # 주의: kimpga 등 일부 사이트는 국내 거래소 USDT/KRW 실거래가를 환율로 사용해
        # 결과값이 다르게 나올 수 있음 (역테더 프리미엄으로 인한 괴리, 통상 1~2%p 차이)
        global_btc_price_krw_ref = global_btc_price_usd * usd_krw_rate
        kimchi_premiums: dict[str, float] = {}
        korean_btc_prices: dict[str, int] = {}
        for ex in GROUPS['korea']:
            try:
                kr_price = float(fut_tickers[ex].result()['price'])
                korean_btc_prices[ex] = round(kr_price)
                kimchi_premiums[ex] = round((kr_price / global_btc_price_krw_ref - 1) * 100, 4)
            except Exception:
                pass

        # USDT 김치 프리미엄 (각 한국 거래소 USDT/KRW 실거래가 vs 포렉스 환율)
        korean_usdt_prices: dict[str, float] = {}
        usdt_kimchi_premiums: dict[str, float] = {}
        for ex in GROUPS['korea']:
            try:
                usdt_price = float(fut_usdt_tickers[ex].result()['price'])
                korean_usdt_prices[ex] = usdt_price
                usdt_kimchi_premiums[ex] = round((usdt_price / usd_krw_rate - 1) * 100, 4)
            except Exception:
                korean_usdt_prices[ex] = usd_krw_rate  # fallback: 포렉스 환율

        # 슬리피지 프로파일 로드
        from backend.app.domain.korea_exchange_registry import get_slippage
        all_paths: list[dict] = []

        for exchange in GROUPS['korea']:
            try:
                korean_btc_price_krw = float(fut_tickers[exchange].result()['price'])
            except Exception:
                continue

            # 슬리피지 반영 실효 매수가 계산
            slip = get_slippage(exchange)
            slip_pct = 0.0
            if slip:
                slip_pct = slip.large_order_pct if amount_krw >= 1_000_000 else slip.estimated_pct
            effective_btc_price_krw = korean_btc_price_krw * (1 + slip_pct / 100)

            korean_taker = TRADING_FEES[exchange]['taker']
            korean_usdt_price_krw = korean_usdt_prices.get(exchange, usd_krw_rate)
            try:
                usdt_networks = [
                    n for n in fut_withdrawals[(exchange, 'USDT')].result()
                    if n.get('enabled', True) and n.get('fee') is not None
                ]
            except Exception:
                usdt_networks = []

            # BTC 직접 출금 경로
            try:
                btc_wd_networks = fut_withdrawals[(exchange, 'BTC')].result()
            except Exception:
                btc_wd_networks = []

            limits = get_withdrawal_limits(exchange)
            krw_per_tx = limits.krw_per_tx_limit if limits else None
            num_txs = -(-amount_krw // krw_per_tx) if (krw_per_tx and krw_per_tx > 0) else 1

            for network in btc_wd_networks:
                # BTC 매수 엣지 (슬리피지 반영 effective_btc_price_krw 사용)
                buy = korea_buy_leg(amount_krw, korean_taker, effective_btc_price_krw, 'BTC', 0.0)
                btc_bought = buy.amount_out

                # BTC 출금 엣지 (enabled/min/max/suspension 통일 검증, num_txs 지원)
                row = row_from_dict(network)
                wd = withdraw_leg(
                    row, btc_bought,
                    coin='BTC', price_krw=effective_btc_price_krw, usd_krw=0.0,
                    num_txs=num_txs,
                    maintenance_status=maintenance_status, exchange=exchange,
                )
                if isinstance(wd, Blocked):
                    continue

                btc_received = wd.amount_out
                if btc_received <= 0:
                    continue

                # 슬리피지 비용 = 실효가 - 표시가 차이 (엣지 밖 별도 처리)
                slippage_cost_krw = (
                    round((effective_btc_price_krw - korean_btc_price_krw) * btc_bought)
                    if slip_pct > 0 else 0
                )
                total_fee_krw = buy.fee_krw + wd.fee_krw + slippage_cost_krw

                components = list(buy.components)
                if slippage_cost_krw > 0:
                    components.append(fee_component(
                        f'슬리피지 추정 ({slip_pct:.2f}%)', slippage_cost_krw,
                        input_krw=amount_krw,
                        amount_text='추정값, 실제 체결가 기준', is_fixed=False,
                    ))
                components += wd.components

                all_paths.append({
                    'korean_exchange': exchange,
                    'transfer_coin': 'BTC',
                    'route_variant': 'btc_direct',
                    'network': network['label'],
                    'global_exit_mode': 'direct',
                    'global_exit_network': network['label'],
                    'quote_strategy': 'btc_direct',
                    'slippage_pct': slip_pct,
                    'num_withdrawal_txs': num_txs,
                    'krw_per_tx_limit': krw_per_tx,
                    'btc_received': round(btc_received, 8),
                    'btc_received_usd': round(btc_received * global_btc_price_usd, 2),
                    'total_fee_krw': total_fee_krw,
                    'fee_pct': round(total_fee_krw / amount_krw * 100, 4),
                    'breakdown': {
                        'components': components,
                        'total_fee_krw': total_fee_krw,
                    },
                })

            # BTC → 글로벌 거래소 경유 → BTC 출금 경로 (신규)
            all_paths.extend(_build_btc_via_global_paths(
                exchange=exchange,
                btc_wd_networks=btc_wd_networks,
                korean_taker=korean_taker,
                amount_krw=amount_krw,
                effective_btc_price_krw=effective_btc_price_krw,
                korean_btc_price_krw=korean_btc_price_krw,
                slip_pct=slip_pct,
                global_exchange=global_exchange,
                global_btc_price_usd=global_btc_price_usd,
                global_onchain_wd_fee=global_onchain_wd_fee,
                global_onchain_wd_fee_krw=global_onchain_wd_fee_krw,
                maintenance_status=maintenance_status,
            ))

            # USDT → BTC/USDT taker 경로 (기존)
            all_paths.extend(_build_usdt_onchain_paths(
                exchange=exchange,
                usdt_networks=usdt_networks,
                korean_taker=korean_taker,
                amount_krw=amount_krw,
                usd_krw_rate=usd_krw_rate,
                korean_usdt_price_krw=korean_usdt_price_krw,
                global_btc_price_usd=global_btc_price_usd,
                global_exchange=global_exchange,
                global_taker_usdt=global_taker_usdt,
                global_onchain_wd_fee=global_onchain_wd_fee,
                global_onchain_wd_fee_krw=global_onchain_wd_fee_krw,
                maintenance_status=maintenance_status,
            ))

            # USDT → FDUSD convert → BTC/FDUSD maker 경로 (옵션)
            if include_fdusd and fdusd_promo_active:
                all_paths.extend(_build_fdusd_maker_paths(
                    exchange=exchange,
                    usdt_networks=usdt_networks,
                    korean_taker=korean_taker,
                    amount_krw=amount_krw,
                    usd_krw_rate=usd_krw_rate,
                    korean_usdt_price_krw=korean_usdt_price_krw,
                    global_btc_price_usd=global_btc_price_usd,
                    global_exchange=global_exchange,
                    fdusd_maker_fee=fdusd_maker_fee,
                    fdusd_convert_spread=fdusd_convert_spread,
                    global_onchain_wd_fee=global_onchain_wd_fee,
                    global_onchain_wd_fee_krw=global_onchain_wd_fee_krw,
                    maintenance_status=maintenance_status,
                ))

            # ⚡ Lightning 출금 경로 (글로벌 거래소가 LN 지원 시)
            if global_ln_wd_fee is not None:
                all_paths.extend(_build_ln_exit_paths(
                    exchange=exchange,
                    usdt_networks=usdt_networks,
                    korean_taker=korean_taker,
                    amount_krw=amount_krw,
                    usd_krw_rate=usd_krw_rate,
                    korean_usdt_price_krw=korean_usdt_price_krw,
                    global_btc_price_usd=global_btc_price_usd,
                    global_exchange=global_exchange,
                    global_taker_usdt=global_taker_usdt,
                    fdusd_maker_fee=fdusd_maker_fee,
                    fdusd_convert_spread=fdusd_convert_spread,
                    fdusd_promo_active=fdusd_promo_active,
                    ln_wd_fee_btc=global_ln_wd_fee,
                    ln_wd_min_btc=global_ln_wd_min,
                    ln_wd_max_btc=global_ln_wd_max,
                    maintenance_status=maintenance_status,
                    include_fdusd=include_fdusd,
                ))

        all_paths.sort(key=lambda p: -p['btc_received'])

        return {
            'amount_krw': amount_krw,
            'global_exchange': global_exchange,
            'global_btc_price_usd': global_btc_price_usd,
            'usd_krw_rate': round(usd_krw_rate),
            'promo_context': {
                'fdusd_maker_fee_pct': round(fdusd_maker_fee * 100, 4) if fdusd_maker_fee is not None else None,
                'fdusd_maker_promo_active': fdusd_promo_active,
                'fdusd_convert_spread_pct': round(fdusd_convert_spread * 100, 4),
                'fee_override_sources': [o.source for o in promo_ctx.fee_overrides],
                'source_details': [
                    {
                        'label': s.label,
                        'value': s.value,
                        'source': s.source,
                        'url': s.url,
                    }
                    for s in promo_ctx.source_details
                ],
                'errors': promo_ctx.errors,
                'warnings': promo_ctx.warnings,
                'fetched_at': promo_ctx.fetched_at,
            },
            'global_btc_price_krw_ref': round(global_btc_price_krw_ref),
            'korean_btc_prices': korean_btc_prices,
            'kimchi_premiums': kimchi_premiums,
            'korean_usdt_prices': korean_usdt_prices,
            'usdt_kimchi_premiums': usdt_kimchi_premiums,
            'total_paths_evaluated': len(all_paths),
            'best_path': all_paths[0] if all_paths else None,
            'top5': all_paths[:5],
            'all_paths': all_paths,
        }

    except Exception as exc:
        logger.exception('find_cheapest_path_dynamic 오류')
        return {'error': str(exc)}


def find_cheapest_path_all_exchanges(
    amount_krw: int = 1_000_000,
    promo_ctx: PromoContext | None = None,
    include_fdusd: bool = False,
) -> dict:
    """
    모든 글로벌 거래소를 병렬로 탐색해 전체 최적 경로를 반환.
    각 경로에 global_exchange 필드 포함.
    """
    if promo_ctx is None:
        promo_ctx = fetch_promo_context()

    global_exchanges = GROUPS['global']
    all_paths: list[dict] = []
    exchange_summaries: dict[str, dict] = {}
    errors: list[str] = []

    with ThreadPoolExecutor(max_workers=len(global_exchanges)) as executor:
        futures = {
            ex: executor.submit(find_cheapest_path_dynamic, amount_krw, ex, promo_ctx, include_fdusd)
            for ex in global_exchanges
        }

    for ex, fut in futures.items():
        try:
            result = fut.result()
            if 'error' in result:
                errors.append(f"{ex}: {result['error']}")
                continue
            paths = result.get('all_paths', [])
            # 각 경로에 global_exchange 태그 추가
            for p in paths:
                p['global_exchange'] = ex
            all_paths.extend(paths)
            lowest_fee_path = min(paths, key=lambda p: p['total_fee_krw']) if paths else None
            exchange_summaries[ex] = {
                'best_fee_krw': lowest_fee_path['total_fee_krw'] if lowest_fee_path else None,
                'best_fee_pct': lowest_fee_path['fee_pct'] if lowest_fee_path else None,
                'best_strategy': lowest_fee_path.get('quote_strategy') if lowest_fee_path else None,
                'best_path': lowest_fee_path,
                'paths_count': len(paths),
            }
        except Exception as exc:
            errors.append(f"{ex}: {exc}")

    all_paths.sort(key=lambda p: -p['btc_received'])

    # 거래소별 프로모션 메모 추가
    for ex, summary in exchange_summaries.items():
        summary['promo_note'] = NO_PROMO_NOTES.get(ex, '')

    # Binance promo_context + 김치 프리미엄 (Binance 기준 참조값)
    promo_info = {
        'fdusd_maker_promo_active': promo_ctx.get_global_maker('binance', 'FDUSD') == 0.0,
        'fdusd_convert_spread_pct': round((promo_ctx.get_convert_spread('USDT', 'FDUSD') or 0.0005) * 100, 4),
        'source_details': [
            {'label': s.label, 'value': s.value, 'source': s.source, 'url': s.url}
            for s in promo_ctx.source_details
        ],
        'errors': promo_ctx.errors,
        'warnings': promo_ctx.warnings,
        'fetched_at': promo_ctx.fetched_at,
    }

    # 김치 프리미엄 — Binance 결과에서 추출 (가장 대표적 글로벌 기준)
    kimchi_data: dict = {}
    usdt_kimchi_data: dict = {}
    korean_usdt_prices_data: dict = {}
    ref_price_krw: int = 0
    binance_fut = futures.get('binance')
    if binance_fut:
        try:
            br = binance_fut.result()
            if 'error' not in br:
                kimchi_data = br.get('kimchi_premiums', {})
                usdt_kimchi_data = br.get('usdt_kimchi_premiums', {})
                korean_usdt_prices_data = br.get('korean_usdt_prices', {})
                ref_price_krw = br.get('global_btc_price_krw_ref', 0)
                promo_info['usd_krw_rate'] = br.get('usd_krw_rate', 0)
        except Exception:
            pass

    return {
        'amount_krw': amount_krw,
        'total_paths_evaluated': len(all_paths),
        'global_exchanges_searched': global_exchanges,
        'best_path': all_paths[0] if all_paths else None,
        'top10': all_paths[:10],
        'all_paths': all_paths,
        'exchange_summaries': exchange_summaries,
        'promo_context': promo_info,
        'kimchi_premiums': kimchi_data,
        'usdt_kimchi_premiums': usdt_kimchi_data,
        'korean_usdt_prices': korean_usdt_prices_data,
        'global_btc_price_krw_ref': ref_price_krw,
        'errors': errors,
    }
