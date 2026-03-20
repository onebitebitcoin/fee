from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import logging

from backend.app.domain.market_core import (
    GROUPS,
    GLOBAL_FETCHERS,
    KOREA_FETCHERS,
    TRADING_FEES,
    check_maintenance_status,
    fetch_usd_krw_rate,
    get_ticker_data,
    get_withdrawal_data,
)
from backend.app.domain.path_helpers import (
    _build_path_id,
    fee_component,
    is_suspended,
    is_bitcoin_native_network,
)
# paths_buy.py로 이동된 함수 re-export
from backend.app.domain.paths_buy import (
    _build_available_filters,
    find_cheapest_path_from_snapshot_rows,  # noqa: F401
)
# paths_sell.py로 이동된 함수 re-export
from backend.app.domain.paths_sell import (
    find_cheapest_sell_path_from_snapshot_rows,  # noqa: F401
)

logger = logging.getLogger(__name__)


def compare_btc_prices(exchanges: str = 'all') -> dict:
    if exchanges == 'all':
        targets = GROUPS['korea'] + GROUPS['global']
    elif exchanges in GROUPS:
        targets = GROUPS[exchanges]
    else:
        targets = [item.strip().lower() for item in exchanges.split(',')]
        invalid = [item for item in targets if item not in GROUPS['korea'] + GROUPS['global']]
        if invalid:
            return {'error': f'지원하지 않는 거래소: {invalid}'}

    results = []
    errors = []
    for exchange in targets:
        try:
            data = get_ticker_data(exchange)
            if isinstance(data, list):
                data = next((item for item in data if item['market_type'] == 'spot'), data[0])
            results.append({
                'exchange': exchange,
                'price': data['price'],
                'currency': data['currency'],
                'pair': data['pair'],
            })
        except Exception as exc:
            errors.append({'exchange': exchange, 'error': str(exc)})

    krw_results = sorted((row for row in results if row['currency'] == 'KRW'), key=lambda item: item['price'])
    usd_results = sorted((row for row in results if row['currency'] == 'USD'), key=lambda item: item['price'])
    summary = {'results': results, 'errors': errors}
    if krw_results:
        summary['krw'] = {
            'lowest': krw_results[0],
            'highest': krw_results[-1],
            'spread_krw': krw_results[-1]['price'] - krw_results[0]['price'],
        }
    if usd_results:
        summary['usd'] = {
            'lowest': usd_results[0],
            'highest': usd_results[-1],
            'spread_usd': round(usd_results[-1]['price'] - usd_results[0]['price'], 2),
        }
    return summary


def get_exchange_summary(exchange: str) -> dict:
    exchange = exchange.lower()
    if exchange not in GROUPS['korea'] + GROUPS['global']:
        return {'error': f'지원하지 않는 거래소: {exchange}'}

    result = {'exchange': exchange}
    try:
        result['ticker'] = get_ticker_data(exchange)
    except Exception as exc:
        result['ticker_error'] = str(exc)

    for coin in ['BTC', 'USDT']:
        try:
            result[f'withdrawal_{coin.lower()}'] = get_withdrawal_data(exchange, coin)
        except Exception as exc:
            result[f'withdrawal_{coin.lower()}_error'] = str(exc)
    return result


def calculate_btc_purchase_cost(
    amount_krw: int = 1000000,
    korean_exchange: str = 'upbit',
    global_exchange: str = 'binance',
    transfer_coin: str = 'BTC',
    network: str = '',
) -> dict:
    korean_exchange = korean_exchange.lower()
    global_exchange = global_exchange.lower()
    transfer_coin = transfer_coin.upper()
    if korean_exchange not in GROUPS['korea']:
        return {'error': f"지원하지 않는 한국 거래소: {korean_exchange}. {GROUPS['korea']} 중 선택"}
    if global_exchange not in GROUPS['global']:
        return {'error': f"지원하지 않는 글로벌 거래소: {global_exchange}. {GROUPS['global']} 중 선택"}
    if transfer_coin not in ('BTC', 'USDT'):
        return {'error': "transfer_coin은 'BTC' 또는 'USDT'만 지원합니다"}

    try:
        usd_krw_rate = fetch_usd_krw_rate()
        korean_btc_price_krw = float(KOREA_FETCHERS[korean_exchange]()['price'])
        global_fetcher = GLOBAL_FETCHERS[global_exchange]
        global_btc_price_usd = float(global_fetcher['spot']()['price']) if isinstance(global_fetcher, dict) else float(global_fetcher()['price'])
        global_btc_price_krw = round(global_btc_price_usd * usd_krw_rate)
        kimchi_premium_pct = round((korean_btc_price_krw - global_btc_price_krw) / global_btc_price_krw * 100, 4)

        korean_taker = TRADING_FEES[korean_exchange]['taker']
        global_fees_entry = TRADING_FEES[global_exchange]
        global_taker = global_fees_entry['spot']['taker'] if isinstance(global_fees_entry.get('spot'), dict) else global_fees_entry['taker']
        withdrawal_networks = get_withdrawal_data(korean_exchange, transfer_coin)
        default_networks = {'BTC': ['Bitcoin', 'Bitcoin (On-chain)'], 'USDT': ['TRC20']}
        chosen_network_label = network.strip() if network.strip() else None
        withdrawal_fee_coin = None
        withdrawal_fee_note = ''

        for net in withdrawal_networks:
            label = net.get('label', '')
            if chosen_network_label:
                if chosen_network_label.lower() not in label.lower():
                    continue
            elif not any(default.lower() in label.lower() for default in default_networks[transfer_coin]):
                continue
            if net.get('enabled', True) is False:
                continue
            withdrawal_fee_coin = net.get('fee')
            withdrawal_fee_note = net.get('note', label)
            chosen_network_label = label
            break

        if withdrawal_fee_coin is None and chosen_network_label is None:
            for net in withdrawal_networks:
                if net.get('enabled', True) is False or net.get('fee') is None:
                    continue
                withdrawal_fee_coin = net['fee']
                chosen_network_label = net['label']
                withdrawal_fee_note = net.get('note', chosen_network_label)
                break

        korean_trading_fee_krw = round(amount_krw * korean_taker)
        common_breakdown = {
            'korean_trading_fee_krw': korean_trading_fee_krw,
            'korean_trading_fee_pct': round(korean_taker * 100, 4),
            'withdrawal_fee_krw': None,
            'withdrawal_fee_coin': withdrawal_fee_coin,
            'withdrawal_coin': transfer_coin,
            'withdrawal_network': chosen_network_label or 'N/A',
            'withdrawal_note': withdrawal_fee_note,
        }

        if transfer_coin == 'BTC':
            btc_bought = (amount_krw - korean_trading_fee_krw) / korean_btc_price_krw
            if withdrawal_fee_coin is not None:
                withdrawal_fee_krw = round(withdrawal_fee_coin * korean_btc_price_krw)
                btc_received = btc_bought - withdrawal_fee_coin
            else:
                withdrawal_fee_krw = None
                btc_received = None
            global_trading_fee_krw = 0
            cost_breakdown = {
                **common_breakdown,
                'withdrawal_fee_krw': withdrawal_fee_krw,
                'global_trading_fee_krw': global_trading_fee_krw,
                'total_fee_krw': korean_trading_fee_krw + (withdrawal_fee_krw or 0) if withdrawal_fee_krw is not None else None,
            }
        else:
            usdt_bought = (amount_krw - korean_trading_fee_krw) / usd_krw_rate
            if withdrawal_fee_coin is not None:
                withdrawal_fee_krw = round(withdrawal_fee_coin * usd_krw_rate)
                usdt_after_withdrawal = usdt_bought - withdrawal_fee_coin
            else:
                withdrawal_fee_krw = None
                usdt_after_withdrawal = usdt_bought
            if usdt_after_withdrawal is not None:
                global_trading_fee_usdt = usdt_after_withdrawal * global_taker
                global_trading_fee_krw = round(global_trading_fee_usdt * usd_krw_rate)
                usdt_for_btc = usdt_after_withdrawal - global_trading_fee_usdt
                btc_received = usdt_for_btc / global_btc_price_usd
            else:
                global_trading_fee_krw = None
                btc_received = None
            cost_breakdown = {
                **common_breakdown,
                'withdrawal_fee_krw': withdrawal_fee_krw,
                'global_trading_fee_krw': global_trading_fee_krw,
                'global_trading_fee_pct': round(global_taker * 100, 4),
                'total_fee_krw': korean_trading_fee_krw + (withdrawal_fee_krw or 0) + (global_trading_fee_krw or 0) if withdrawal_fee_krw is not None and global_trading_fee_krw is not None else None,
            }

        effective_btc_price_krw = round(amount_krw / btc_received) if btc_received and btc_received > 0 else None
        return {
            'amount_krw': amount_krw,
            'korean_exchange': korean_exchange,
            'global_exchange': global_exchange,
            'transfer_coin': transfer_coin,
            'kimchi_premium_pct': kimchi_premium_pct,
            'kimchi_direction': '한국이 글로벌보다 비쌈 (프리미엄)' if kimchi_premium_pct > 0 else '한국이 글로벌보다 저렴 (역프리미엄)',
            'korean_btc_price_krw': korean_btc_price_krw,
            'global_btc_price_krw': global_btc_price_krw,
            'global_btc_price_usd': global_btc_price_usd,
            'usd_krw_rate': round(usd_krw_rate),
            'cost_breakdown': cost_breakdown,
            'btc_received': round(btc_received, 8) if btc_received is not None else None,
            'effective_btc_price_krw': effective_btc_price_krw,
            'net_amount_krw': amount_krw - cost_breakdown['total_fee_krw'] if cost_breakdown.get('total_fee_krw') is not None else None,
        }
    except Exception as exc:
        return {'error': str(exc), 'korean_exchange': korean_exchange, 'global_exchange': global_exchange}


def find_cheapest_path(amount_krw: int = 1000000, global_exchange: str = 'binance') -> dict:
    global_exchange = global_exchange.lower()
    if global_exchange not in GROUPS['global']:
        return {'error': f"지원하지 않는 글로벌 거래소: {global_exchange}. {GROUPS['global']} 중 선택"}

    try:
        global_fn = GLOBAL_FETCHERS[global_exchange]['spot'] if isinstance(GLOBAL_FETCHERS[global_exchange], dict) else GLOBAL_FETCHERS[global_exchange]
        with ThreadPoolExecutor(max_workers=18) as executor:
            fut_rate = executor.submit(fetch_usd_krw_rate)
            fut_global = executor.submit(global_fn)
            fut_tickers = {exchange: executor.submit(fetcher) for exchange, fetcher in KOREA_FETCHERS.items()}
            fut_withdrawals = {
                (exchange, coin): executor.submit(get_withdrawal_data, exchange, coin)
                for exchange in GROUPS['korea']
                for coin in ['BTC', 'USDT']
            }
            # Bug #3 fix: 글로벌 거래소 BTC 출금 수수료도 병렬로 조회
            fut_global_btc_withdrawal = executor.submit(get_withdrawal_data, global_exchange, 'BTC')

        usd_krw_rate = fut_rate.result()
        global_btc_price_usd = float(fut_global.result()['price'])
        global_fees_entry = TRADING_FEES[global_exchange]
        global_taker = global_fees_entry['spot']['taker'] if isinstance(global_fees_entry.get('spot'), dict) else global_fees_entry['taker']

        # Bug #3 fix: 글로벌 거래소 BTC on-chain 출금 수수료 (USDT 경유 경로에 포함)
        global_onchain_wd_fee: float | None = None
        global_onchain_wd_fee_krw: int = 0
        try:
            for _net in fut_global_btc_withdrawal.result():
                label_lower = (_net.get('label', '') or '').lower()
                if _net.get('enabled', True) and _net.get('fee') is not None and is_bitcoin_native_network(label_lower):
                    global_onchain_wd_fee = _net['fee']
                    global_onchain_wd_fee_krw = round(global_onchain_wd_fee * global_btc_price_usd * usd_krw_rate)
                    break
        except Exception:
            logger.warning('글로벌 거래소 BTC 출금 수수료 조회 실패', exc_info=True)

        try:
            maintenance_status = check_maintenance_status(list(GROUPS['korea']))
            maintenance_checked_at = int(datetime.now().timestamp())
        except Exception:
            maintenance_status = {}
            maintenance_checked_at = None

        paths = []
        disabled_paths = []
        for exchange in GROUPS['korea']:
            try:
                korean_btc_price_krw = float(fut_tickers[exchange].result()['price'])
            except Exception:
                continue

            korean_taker = TRADING_FEES[exchange]['taker']

            try:
                for network in fut_withdrawals[(exchange, 'BTC')].result():
                    if not network.get('enabled', True) or network.get('fee') is None:
                        continue
                    suspension_reason = is_suspended(maintenance_status, exchange, 'BTC', network['label'])
                    if suspension_reason:
                        disabled_paths.append({'korean_exchange': exchange, 'transfer_coin': 'BTC', 'network': network['label'], 'reason': suspension_reason})
                        continue

                    withdrawal_fee_btc = network['fee']
                    trading_fee_krw = round(amount_krw * korean_taker)
                    btc_bought = (amount_krw - trading_fee_krw) / korean_btc_price_krw
                    btc_received = btc_bought - withdrawal_fee_btc
                    if btc_received <= 0:
                        continue

                    withdrawal_fee_krw = round(withdrawal_fee_btc * korean_btc_price_krw)
                    total_fee_krw = trading_fee_krw + withdrawal_fee_krw
                    paths.append({
                        'korean_exchange': exchange,
                        'transfer_coin': 'BTC',
                        'network': network['label'],
                        'domestic_withdrawal_network': network['label'],
                        'global_exit_mode': 'onchain',
                        'global_exit_network': network['label'],
                        'lightning_exit_provider': None,
                        'path_id': _build_path_id(
                            global_exchange=global_exchange,
                            korean_exchange=exchange,
                            transfer_coin='BTC',
                            domestic_withdrawal_network=network['label'],
                            global_exit_mode='onchain',
                            global_exit_network=network['label'],
                            lightning_exit_provider=None,
                        ),
                        'btc_received': round(btc_received, 8),
                        'btc_received_usd': round(btc_received * global_btc_price_usd, 2),
                        'total_fee_krw': total_fee_krw,
                        'fee_pct': round(total_fee_krw / amount_krw * 100, 4),
                        'breakdown': {
                            'components': [
                                fee_component('국내 매수 수수료', trading_fee_krw, rate_pct=korean_taker * 100),
                                fee_component('BTC 출금 수수료', withdrawal_fee_krw, amount_text=f'{withdrawal_fee_btc} BTC'),
                            ],
                            'total_fee_krw': total_fee_krw,
                        },
                    })
            except Exception:
                logger.warning('BTC 출금 경로 계산 중 오류 (exchange=%s)', exchange, exc_info=True)

            try:
                for network in fut_withdrawals[(exchange, 'USDT')].result():
                    if not network.get('enabled', True) or network.get('fee') is None:
                        continue
                    suspension_reason = is_suspended(maintenance_status, exchange, 'USDT', network['label'])
                    if suspension_reason:
                        disabled_paths.append({'korean_exchange': exchange, 'transfer_coin': 'USDT', 'network': network['label'], 'reason': suspension_reason})
                        continue

                    withdrawal_fee_usdt = network['fee']
                    trading_fee_krw = round(amount_krw * korean_taker)
                    usdt_bought = (amount_krw - trading_fee_krw) / usd_krw_rate
                    usdt_after_withdrawal = usdt_bought - withdrawal_fee_usdt
                    if usdt_after_withdrawal <= 0:
                        continue

                    global_trading_fee_usdt = usdt_after_withdrawal * global_taker
                    usdt_for_btc = usdt_after_withdrawal - global_trading_fee_usdt
                    btc_at_global = usdt_for_btc / global_btc_price_usd
                    withdrawal_fee_krw = round(withdrawal_fee_usdt * usd_krw_rate)
                    global_trading_fee_krw = round(global_trading_fee_usdt * usd_krw_rate)
                    # Bug #3 fix: 글로벌 거래소 BTC 출금 수수료 포함 (스냅샷 버전과 동일)
                    if global_onchain_wd_fee is not None:
                        btc_received = btc_at_global - global_onchain_wd_fee
                        total_fee_krw = trading_fee_krw + withdrawal_fee_krw + global_trading_fee_krw + global_onchain_wd_fee_krw
                        fee_components = [
                            fee_component('국내 매수 수수료', trading_fee_krw, rate_pct=korean_taker * 100),
                            fee_component('USDT 출금 수수료', withdrawal_fee_krw, amount_text=f'{withdrawal_fee_usdt} USDT'),
                            fee_component('해외 BTC 매수 수수료', global_trading_fee_krw, rate_pct=global_taker * 100, amount_text=f'{round(global_trading_fee_usdt, 8)} USDT'),
                            fee_component(f'해외 BTC 출금 수수료 ({global_exchange})', global_onchain_wd_fee_krw, amount_text=f'{global_onchain_wd_fee} BTC'),
                        ]
                    else:
                        btc_received = btc_at_global
                        total_fee_krw = trading_fee_krw + withdrawal_fee_krw + global_trading_fee_krw
                        fee_components = [
                            fee_component('국내 매수 수수료', trading_fee_krw, rate_pct=korean_taker * 100),
                            fee_component('USDT 출금 수수료', withdrawal_fee_krw, amount_text=f'{withdrawal_fee_usdt} USDT'),
                            fee_component('해외 BTC 매수 수수료', global_trading_fee_krw, rate_pct=global_taker * 100, amount_text=f'{round(global_trading_fee_usdt, 8)} USDT'),
                        ]
                    if btc_received <= 0:
                        continue
                    paths.append({
                        'korean_exchange': exchange,
                        'transfer_coin': 'USDT',
                        'network': network['label'],
                        'domestic_withdrawal_network': network['label'],
                        'global_exit_mode': 'onchain',
                        'global_exit_network': 'Bitcoin',
                        'lightning_exit_provider': None,
                        'path_id': _build_path_id(
                            global_exchange=global_exchange,
                            korean_exchange=exchange,
                            transfer_coin='USDT',
                            domestic_withdrawal_network=network['label'],
                            global_exit_mode='onchain',
                            global_exit_network='Bitcoin',
                            lightning_exit_provider=None,
                        ),
                        'btc_received': round(btc_received, 8),
                        'btc_received_usd': round(btc_received * global_btc_price_usd, 2),
                        'total_fee_krw': total_fee_krw,
                        'fee_pct': round(total_fee_krw / amount_krw * 100, 4),
                        'breakdown': {
                            'components': fee_components,
                            'total_fee_krw': total_fee_krw,
                        },
                    })
            except Exception:
                logger.warning('USDT 출금 경로 계산 중 오류 (exchange=%s)', exchange, exc_info=True)

        paths.sort(key=lambda item: (item['total_fee_krw'], -item['btc_received']))
        return {
            'amount_krw': amount_krw,
            'global_exchange': global_exchange,
            'global_btc_price_usd': global_btc_price_usd,
            'usd_krw_rate': round(usd_krw_rate),
            'total_paths_evaluated': len(paths),
            'best_path': paths[0] if paths else None,
            'top5': paths[:5],
            'all_paths': paths,
            'disabled_paths': disabled_paths,
            'maintenance_checked_at': maintenance_checked_at,
            'available_filters': _build_available_filters(paths),
        }
    except Exception as exc:
        return {'error': str(exc)}


def get_network_status(exchange: str = 'all') -> dict:
    if exchange == 'all':
        targets = GROUPS['korea']
    elif exchange.lower() in GROUPS['korea']:
        targets = [exchange.lower()]
    else:
        return {'error': f'지원하지 않는 거래소: {exchange}. 한국 거래소만 지원 (upbit, bithumb, korbit, coinone, gopax)'}

    try:
        maintenance = check_maintenance_status(targets)
        checked_at = int(datetime.now().timestamp())
        exchanges = {}
        for target in targets:
            suspended = maintenance.get(target, [])
            exchanges[target] = {
                'status': 'maintenance_detected' if suspended else 'ok',
                'suspended_networks': suspended,
                'checked_at': checked_at,
            }
        return {
            'exchanges': exchanges,
            'total_suspended': sum(len(value['suspended_networks']) for value in exchanges.values()),
            'checked_at': checked_at,
        }
    except Exception as exc:
        return {'error': str(exc)}


__all__ = [
    'compare_btc_prices',
    'get_exchange_summary',
    'calculate_btc_purchase_cost',
    'find_cheapest_path',
    'get_network_status',
    'find_cheapest_path_from_snapshot_rows',
    'find_cheapest_sell_path_from_snapshot_rows',
]
