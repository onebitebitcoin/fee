"""동적 수수료를 반영한 경로 계산 — FDUSD maker 0% 포함."""
from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor
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
    is_suspended,
    is_bitcoin_native_network,
)
from backend.app.services.promo_scraper import NO_PROMO_NOTES, PromoContext, fetch_promo_context

logger = logging.getLogger(__name__)

_DEFAULT_GLOBAL_TAKER = 0.001  # 0.1%

# Lightning 스왑 서비스: LN → 온체인 변환 수수료
LIGHTNING_SWAP_SERVICES = [
    {
        'name': 'cornwallet',
        'display': 'CornWallet',
        'fee_pct': 0.0045,         # 0.45%
        'fixed_fee_btc': 0.0,
        'kyc': False,              # 비수탁, 계정 불필요
    },
    {
        'name': 'boltz',
        'display': 'Boltz',
        'fee_pct': 0.005,          # 0.5%
        'fixed_fee_btc': 0.000002, # ~200 sats 채굴 수수료
        'kyc': False,              # 비수탁, 오픈소스 서브마린 스왑
    },
    {
        'name': 'walletofsatoshi',
        'display': 'WalletOfSatoshi',
        'fee_pct': 0.019,          # 1.9%
        'fixed_fee_btc': 0.0,
        'kyc': False,              # 비KYC (계정 불필요)
    },
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
    global_btc_price_usd: float,
    global_exchange: str,
    global_taker_usdt: float,
    global_onchain_wd_fee: float | None,
    global_onchain_wd_fee_krw: int,
    maintenance_status: dict,
) -> list[dict]:
    """USDT → 글로벌 → BTC 온체인 경로."""
    paths = []
    for network in usdt_networks:
        if not network.get('enabled', True) or network.get('fee') is None:
            continue
        if is_suspended(maintenance_status, exchange, 'USDT', network['label']):
            continue

        withdrawal_fee_usdt = network['fee']
        trading_fee_krw = round(amount_krw * korean_taker)
        usdt_bought = (amount_krw - trading_fee_krw) / usd_krw_rate
        usdt_after = usdt_bought - withdrawal_fee_usdt
        if usdt_after <= 0:
            continue

        global_fee_usdt = usdt_after * global_taker_usdt
        usdt_for_btc = usdt_after - global_fee_usdt
        btc_at_global = usdt_for_btc / global_btc_price_usd
        withdrawal_fee_krw = round(withdrawal_fee_usdt * usd_krw_rate)
        global_trading_fee_krw = round(global_fee_usdt * usd_krw_rate)

        # 각 노드의 실제 통과 금액 (KRW 환산)
        input_krw_buy = amount_krw
        input_krw_wd = round(usdt_bought * usd_krw_rate)
        input_krw_global_buy = round(usdt_after * usd_krw_rate)
        input_krw_btc_wd = round(btc_at_global * global_btc_price_usd * usd_krw_rate)

        if global_onchain_wd_fee is not None:
            btc_received = btc_at_global - global_onchain_wd_fee
            total_fee_krw = (
                trading_fee_krw + withdrawal_fee_krw
                + global_trading_fee_krw + global_onchain_wd_fee_krw
            )
            components = [
                fee_component('국내 매수 수수료', trading_fee_krw, input_krw=input_krw_buy),
                fee_component('USDT 출금 수수료', withdrawal_fee_krw,
                              input_krw=input_krw_wd, amount_text=f'{withdrawal_fee_usdt} USDT'),
                fee_component('해외 BTC 매수 수수료 (USDT/taker)', global_trading_fee_krw,
                              input_krw=input_krw_global_buy,
                              amount_text=f'{round(global_fee_usdt, 8)} USDT'),
                fee_component(f'해외 BTC 출금 ({global_exchange})', global_onchain_wd_fee_krw,
                              input_krw=input_krw_btc_wd, amount_text=f'{global_onchain_wd_fee} BTC'),
            ]
        else:
            btc_received = btc_at_global
            total_fee_krw = trading_fee_krw + withdrawal_fee_krw + global_trading_fee_krw
            components = [
                fee_component('국내 매수 수수료', trading_fee_krw, input_krw=input_krw_buy),
                fee_component('USDT 출금 수수료', withdrawal_fee_krw,
                              input_krw=input_krw_wd, amount_text=f'{withdrawal_fee_usdt} USDT'),
                fee_component('해외 BTC 매수 수수료 (USDT/taker)', global_trading_fee_krw,
                              input_krw=input_krw_global_buy,
                              amount_text=f'{round(global_fee_usdt, 8)} USDT'),
            ]

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
    for network in usdt_networks:
        if not network.get('enabled', True) or network.get('fee') is None:
            continue
        if is_suspended(maintenance_status, exchange, 'USDT', network['label']):
            continue

        withdrawal_fee_usdt = network['fee']
        trading_fee_krw = round(amount_krw * korean_taker)
        usdt_bought = (amount_krw - trading_fee_krw) / usd_krw_rate
        usdt_after = usdt_bought - withdrawal_fee_usdt
        if usdt_after <= 0:
            continue

        # USDT → FDUSD 전환 (스프레드 비용)
        convert_fee_usdt = usdt_after * fdusd_convert_spread
        fdusd_amount = usdt_after - convert_fee_usdt
        convert_fee_krw = round(convert_fee_usdt * usd_krw_rate)

        # BTC/FDUSD 지정가 매수 (maker)
        global_maker_fee_fdusd = fdusd_amount * fdusd_maker_fee
        fdusd_for_btc = fdusd_amount - global_maker_fee_fdusd
        btc_at_global = fdusd_for_btc / global_btc_price_usd
        global_trading_fee_krw = round(global_maker_fee_fdusd * usd_krw_rate)

        withdrawal_fee_krw = round(withdrawal_fee_usdt * usd_krw_rate)

        # 각 노드의 실제 통과 금액 (KRW 환산)
        input_krw_buy = amount_krw
        input_krw_wd = round(usdt_bought * usd_krw_rate)
        input_krw_convert = round(usdt_after * usd_krw_rate)
        input_krw_global_buy = round(fdusd_amount * usd_krw_rate)
        input_krw_btc_wd = round(btc_at_global * global_btc_price_usd * usd_krw_rate)

        if global_onchain_wd_fee is not None:
            btc_received = btc_at_global - global_onchain_wd_fee
            total_fee_krw = (
                trading_fee_krw + withdrawal_fee_krw + convert_fee_krw
                + global_trading_fee_krw + global_onchain_wd_fee_krw
            )
            components = [
                fee_component('국내 매수 수수료', trading_fee_krw, input_krw=input_krw_buy),
                fee_component('USDT 출금 수수료', withdrawal_fee_krw,
                              input_krw=input_krw_wd, amount_text=f'{withdrawal_fee_usdt} USDT'),
                fee_component('USDT→FDUSD 전환 스프레드', convert_fee_krw,
                              input_krw=input_krw_convert,
                              amount_text=f'{round(convert_fee_usdt, 6)} USDT'),
                fee_component(f'BTC/FDUSD 매수 수수료 (maker {fdusd_maker_fee * 100}%)',
                              global_trading_fee_krw, input_krw=input_krw_global_buy,
                              amount_text=f'{round(global_maker_fee_fdusd, 8)} FDUSD'),
                fee_component(f'해외 BTC 출금 ({global_exchange})', global_onchain_wd_fee_krw,
                              input_krw=input_krw_btc_wd, amount_text=f'{global_onchain_wd_fee} BTC'),
            ]
        else:
            btc_received = btc_at_global
            total_fee_krw = trading_fee_krw + withdrawal_fee_krw + convert_fee_krw + global_trading_fee_krw
            components = [
                fee_component('국내 매수 수수료', trading_fee_krw, input_krw=input_krw_buy),
                fee_component('USDT 출금 수수료', withdrawal_fee_krw,
                              input_krw=input_krw_wd, amount_text=f'{withdrawal_fee_usdt} USDT'),
                fee_component('USDT→FDUSD 전환 스프레드', convert_fee_krw,
                              input_krw=input_krw_convert,
                              amount_text=f'{round(convert_fee_usdt, 6)} USDT'),
                fee_component(f'BTC/FDUSD 매수 수수료 (maker {fdusd_maker_fee * 100}%)',
                              global_trading_fee_krw, input_krw=input_krw_global_buy,
                              amount_text=f'{round(global_maker_fee_fdusd, 8)} FDUSD'),
            ]

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
    strategies = [('usdt_taker', global_taker_usdt, 'USDT')]
    if include_fdusd and fdusd_promo_active and fdusd_maker_fee is not None:
        strategies.append(('fdusd_maker', fdusd_maker_fee, 'FDUSD'))

    for network in usdt_networks:
        if not network.get('enabled', True) or network.get('fee') is None:
            continue
        if is_suspended(maintenance_status, exchange, 'USDT', network['label']):
            continue

        withdrawal_fee_usdt = network['fee']
        trading_fee_krw = round(amount_krw * korean_taker)
        usdt_bought = (amount_krw - trading_fee_krw) / usd_krw_rate
        usdt_after = usdt_bought - withdrawal_fee_usdt
        if usdt_after <= 0:
            continue

        withdrawal_fee_krw = round(withdrawal_fee_usdt * usd_krw_rate)
        input_krw_buy = amount_krw
        input_krw_wd = round(usdt_bought * usd_krw_rate)

        for quote_strategy, buy_fee_rate, coin_label in strategies:
            if quote_strategy == 'fdusd_maker':
                convert_fee_usdt = usdt_after * fdusd_convert_spread
                buy_input = usdt_after - convert_fee_usdt
                convert_fee_krw = round(convert_fee_usdt * usd_krw_rate)
                input_krw_convert = round(usdt_after * usd_krw_rate)
                input_krw_global_buy = round(buy_input * usd_krw_rate)
                convert_comp = [fee_component(
                    'USDT→FDUSD 전환 스프레드', convert_fee_krw,
                    input_krw=input_krw_convert,
                    amount_text=f'{round(convert_fee_usdt, 6)} USDT',
                )]
                buy_label = f'BTC/FDUSD 매수 수수료 (maker {buy_fee_rate * 100:.1f}%)'
            else:
                buy_input = usdt_after
                convert_fee_krw = 0
                input_krw_global_buy = round(usdt_after * usd_krw_rate)
                convert_comp = []
                buy_label = '해외 BTC 매수 수수료 (USDT/taker)'

            global_buy_fee = buy_input * buy_fee_rate
            btc_at_global = (buy_input - global_buy_fee) / global_btc_price_usd
            global_trading_fee_krw = round(global_buy_fee * usd_krw_rate)
            input_krw_ln_wd = round(btc_at_global * global_btc_price_usd * usd_krw_rate)

            # LN 출금 후 잔량 및 제약 검사
            btc_after_ln_wd = btc_at_global - ln_wd_fee_btc
            if btc_after_ln_wd < ln_wd_min_btc:
                continue
            if ln_wd_max_btc is not None and btc_after_ln_wd > ln_wd_max_btc:
                continue

            ln_wd_fee_krw = round(ln_wd_fee_btc * global_btc_price_usd * usd_krw_rate)
            base_fee_krw = (trading_fee_krw + withdrawal_fee_krw + convert_fee_krw
                           + global_trading_fee_krw + ln_wd_fee_krw)
            ln_wd_sats = round(ln_wd_fee_btc * 1e8)

            base_components = [
                fee_component('국내 매수 수수료', trading_fee_krw, input_krw=input_krw_buy),
                fee_component('USDT 출금 수수료', withdrawal_fee_krw,
                              input_krw=input_krw_wd, amount_text=f'{withdrawal_fee_usdt} USDT'),
                *convert_comp,
                fee_component(buy_label, global_trading_fee_krw,
                              input_krw=input_krw_global_buy,
                              amount_text=f'{round(global_buy_fee, 8)} {coin_label}'),
                fee_component(f'⚡ LN 출금 ({global_exchange})', ln_wd_fee_krw,
                              input_krw=input_krw_ln_wd, amount_text=f'{ln_wd_sats} sats'),
            ]

            # LN 출금 → 스왑 서비스 → 개인 온체인 지갑 (자기수탁)
            input_krw_swap = round(btc_after_ln_wd * global_btc_price_usd * usd_krw_rate)
            for svc in LIGHTNING_SWAP_SERVICES:
                swap_fee_btc = btc_after_ln_wd * svc['fee_pct'] + svc.get('fixed_fee_btc', 0.0)
                btc_received = btc_after_ln_wd - swap_fee_btc
                if btc_received <= 0:
                    continue
                swap_fee_krw = round(swap_fee_btc * global_btc_price_usd * usd_krw_rate)
                total_fee_krw = base_fee_krw + swap_fee_krw
                swap_sats = round(swap_fee_btc * 1e8)

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
                        'components': base_components + [
                            fee_component(
                                f'⚡ LN→온체인 스왑 ({svc["display"]} {svc["fee_pct"] * 100:.1f}%)',
                                swap_fee_krw,
                                input_krw=input_krw_swap,
                                amount_text=f'{swap_sats} sats',
                            )
                        ],
                        'total_fee_krw': total_fee_krw,
                    },
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

        with ThreadPoolExecutor(max_workers=20) as executor:
            fut_rate = executor.submit(fetch_usd_krw_rate)
            fut_global = executor.submit(global_fn)
            fut_tickers = {ex: executor.submit(fn) for ex, fn in KOREA_FETCHERS.items()}
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

        # 동적 수수료 값
        global_taker_usdt = _get_global_taker(global_exchange, 'USDT', promo_ctx)
        fdusd_maker_fee = _get_global_maker(global_exchange, 'FDUSD', promo_ctx)
        fdusd_convert_spread = promo_ctx.get_convert_spread('USDT', 'FDUSD') or 0.0005
        fdusd_promo_active = fdusd_maker_fee is not None and fdusd_maker_fee == 0.0

        try:
            maintenance_status = check_maintenance_status(list(GROUPS['korea']))
        except Exception:
            maintenance_status = {}

        # 김치 프리미엄 계산 (각 한국 거래소 vs 현재 글로벌 거래소 기준)
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
            usdt_networks = [
                n for n in fut_withdrawals[(exchange, 'USDT')].result()
                if n.get('enabled', True) and n.get('fee') is not None
            ]

            # BTC 직접 출금 경로
            for network in fut_withdrawals[(exchange, 'BTC')].result():
                if not network.get('enabled', True) or network.get('fee') is None:
                    continue
                if is_suspended(maintenance_status, exchange, 'BTC', network['label']):
                    continue
                wd_fee_btc = network['fee']
                trading_fee_krw = round(amount_krw * korean_taker)
                # 슬리피지 반영 가격으로 BTC 매수량 계산
                btc_bought = (amount_krw - trading_fee_krw) / effective_btc_price_krw
                btc_received = btc_bought - wd_fee_btc
                if btc_received <= 0:
                    continue
                wd_fee_krw = round(wd_fee_btc * effective_btc_price_krw)
                # 슬리피지 비용 = 실효가 - 표시가 차이
                slippage_cost_krw = round((effective_btc_price_krw - korean_btc_price_krw) * btc_bought) if slip_pct > 0 else 0
                total_fee_krw = trading_fee_krw + wd_fee_krw + slippage_cost_krw
                input_krw_btc_wd = round(btc_bought * effective_btc_price_krw)
                components = [
                    fee_component('국내 매수 수수료', trading_fee_krw, input_krw=amount_krw),
                ]
                if slippage_cost_krw > 0:
                    components.append(fee_component(
                        f'슬리피지 추정 ({slip_pct:.2f}%)', slippage_cost_krw,
                        input_krw=amount_krw,
                        amount_text='추정값, 실제 체결가 기준',
                    ))
                all_paths.append({
                    'korean_exchange': exchange,
                    'transfer_coin': 'BTC',
                    'network': network['label'],
                    'global_exit_mode': 'direct',
                    'global_exit_network': network['label'],
                    'quote_strategy': 'btc_direct',
                    'slippage_pct': slip_pct,
                    'btc_received': round(btc_received, 8),
                    'btc_received_usd': round(btc_received * global_btc_price_usd, 2),
                    'total_fee_krw': total_fee_krw,
                    'fee_pct': round(total_fee_krw / amount_krw * 100, 4),
                    'breakdown': {
                        'components': components + [
                            fee_component('BTC 출금 수수료', wd_fee_krw,
                                          input_krw=input_krw_btc_wd, amount_text=f'{wd_fee_btc} BTC'),
                        ],
                        'total_fee_krw': total_fee_krw,
                    },
                })

            # USDT → BTC/USDT taker 경로 (기존)
            all_paths.extend(_build_usdt_onchain_paths(
                exchange=exchange,
                usdt_networks=usdt_networks,
                korean_taker=korean_taker,
                amount_krw=amount_krw,
                usd_krw_rate=usd_krw_rate,
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
    ref_price_krw: int = 0
    binance_fut = futures.get('binance')
    if binance_fut:
        try:
            br = binance_fut.result()
            if 'error' not in br:
                kimchi_data = br.get('kimchi_premiums', {})
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
        'global_btc_price_krw_ref': ref_price_krw,
        'errors': errors,
    }
