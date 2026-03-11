from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

from backend.app.domain.market_core import (
    GROUPS,
    GLOBAL_FETCHERS,
    KOREA_FETCHERS,
    TRADING_FEES,
    check_maintenance_status,
    fetch_usd_krw_rate,
    get_ticker_data,
    get_withdrawal_source_url,
    get_withdrawal_data,
)


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

        if transfer_coin == 'BTC':
            korean_trading_fee_krw = round(amount_krw * korean_taker)
            btc_bought = (amount_krw - korean_trading_fee_krw) / korean_btc_price_krw
            if withdrawal_fee_coin is not None:
                withdrawal_fee_krw = round(withdrawal_fee_coin * korean_btc_price_krw)
                btc_received = btc_bought - withdrawal_fee_coin
            else:
                withdrawal_fee_krw = None
                btc_received = None
            global_trading_fee_krw = 0
            cost_breakdown = {
                'korean_trading_fee_krw': korean_trading_fee_krw,
                'korean_trading_fee_pct': round(korean_taker * 100, 4),
                'withdrawal_fee_krw': withdrawal_fee_krw,
                'withdrawal_fee_coin': withdrawal_fee_coin,
                'withdrawal_coin': transfer_coin,
                'withdrawal_network': chosen_network_label or 'N/A',
                'withdrawal_note': withdrawal_fee_note,
                'global_trading_fee_krw': global_trading_fee_krw,
                'total_fee_krw': korean_trading_fee_krw + (withdrawal_fee_krw or 0) if withdrawal_fee_krw is not None else None,
            }
        else:
            korean_trading_fee_krw = round(amount_krw * korean_taker)
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
                'korean_trading_fee_krw': korean_trading_fee_krw,
                'korean_trading_fee_pct': round(korean_taker * 100, 4),
                'withdrawal_fee_krw': withdrawal_fee_krw,
                'withdrawal_fee_coin': withdrawal_fee_coin,
                'withdrawal_coin': transfer_coin,
                'withdrawal_network': chosen_network_label or 'N/A',
                'withdrawal_note': withdrawal_fee_note,
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
        with ThreadPoolExecutor(max_workers=16) as executor:
            fut_rate = executor.submit(fetch_usd_krw_rate)
            fut_global = executor.submit(global_fn)
            fut_tickers = {exchange: executor.submit(fetcher) for exchange, fetcher in KOREA_FETCHERS.items()}
            fut_withdrawals = {
                (exchange, coin): executor.submit(get_withdrawal_data, exchange, coin)
                for exchange in GROUPS['korea']
                for coin in ['BTC', 'USDT']
            }

        usd_krw_rate = fut_rate.result()
        global_btc_price_usd = float(fut_global.result()['price'])
        global_fees_entry = TRADING_FEES[global_exchange]
        global_taker = global_fees_entry['spot']['taker'] if isinstance(global_fees_entry.get('spot'), dict) else global_fees_entry['taker']

        try:
            maintenance_status = check_maintenance_status(list(GROUPS['korea']))
            maintenance_checked_at = datetime.now().isoformat()
        except Exception:
            maintenance_status = {}
            maintenance_checked_at = None

        def is_suspended(exchange: str, coin: str, network_label: str):
            for item in maintenance_status.get(exchange, []):
                if item.get('coin', '').upper() == coin.upper() and item.get('network', '').lower() in network_label.lower():
                    return item.get('reason', '점검 중')
            return None

        def fee_component(label: str, amount_krw: int, *, rate_pct: float | None = None, amount_text: str | None = None, source_url: str | None = None) -> dict:
            return {
                'label': label,
                'amount_krw': amount_krw,
                'rate_pct': round(rate_pct, 4) if rate_pct is not None else None,
                'amount_text': amount_text,
                'source_url': source_url,
            }

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
                    suspension_reason = is_suspended(exchange, 'BTC', network['label'])
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
                pass

            try:
                for network in fut_withdrawals[(exchange, 'USDT')].result():
                    if not network.get('enabled', True) or network.get('fee') is None:
                        continue
                    suspension_reason = is_suspended(exchange, 'USDT', network['label'])
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
                    btc_received = usdt_for_btc / global_btc_price_usd
                    withdrawal_fee_krw = round(withdrawal_fee_usdt * usd_krw_rate)
                    global_trading_fee_krw = round(global_trading_fee_usdt * usd_krw_rate)
                    total_fee_krw = trading_fee_krw + withdrawal_fee_krw + global_trading_fee_krw
                    paths.append({
                        'korean_exchange': exchange,
                        'transfer_coin': 'USDT',
                        'network': network['label'],
                        'btc_received': round(btc_received, 8),
                        'btc_received_usd': round(btc_received * global_btc_price_usd, 2),
                        'total_fee_krw': total_fee_krw,
                        'fee_pct': round(total_fee_krw / amount_krw * 100, 4),
                        'breakdown': {
                            'components': [
                                fee_component('국내 매수 수수료', trading_fee_krw, rate_pct=korean_taker * 100),
                                fee_component('USDT 출금 수수료', withdrawal_fee_krw, amount_text=f'{withdrawal_fee_usdt} USDT'),
                                fee_component('해외 BTC 매수 수수료', global_trading_fee_krw, rate_pct=global_taker * 100, amount_text=f'{round(global_trading_fee_usdt, 8)} USDT'),
                            ],
                            'total_fee_krw': total_fee_krw,
                        },
                    })
            except Exception:
                pass

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
        }
    except Exception as exc:
        return {'error': str(exc)}


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
    if latest_run is None:
        return {'error': '최신 수집 결과가 없습니다. 먼저 수동 크롤링을 실행하세요.'}

    def fee_component(label: str, amount_krw: int, *, rate_pct: float | None = None, amount_text: str | None = None, source_url: str | None = None) -> dict:
        return {
            'label': label,
            'amount_krw': amount_krw,
            'rate_pct': round(rate_pct, 4) if rate_pct is not None else None,
            'amount_text': amount_text,
            'source_url': source_url,
        }

    def is_suspended(exchange: str, coin: str, network_label: str):
        for item in maintenance_status.get(exchange, []):
            if item.get('coin', '').upper() == coin.upper() and item.get('network', '').lower() in network_label.lower():
                return item.get('reason', '점검 중')
        return None

    usd_krw_rate = latest_run.usd_krw_rate or next((row.usd_krw_rate for row in ticker_rows if getattr(row, 'usd_krw_rate', None)), None)
    if usd_krw_rate is None:
        return {'error': '최신 수집 결과에 환율 정보가 없습니다.'}

    global_row = next((row for row in ticker_rows if row.exchange == global_exchange and row.market_type == 'spot'), None)
    if global_row is None:
        return {'error': f'최신 수집 결과에 {global_exchange} spot 시세가 없습니다.'}

    global_btc_price_usd = float(global_row.price)
    global_taker = (global_row.taker_fee_pct / 100) if global_row.taker_fee_pct is not None else (
        TRADING_FEES[global_exchange]['spot']['taker'] if isinstance(TRADING_FEES[global_exchange].get('spot'), dict) else TRADING_FEES[global_exchange]['taker']
    )

    ticker_by_exchange = {
        row.exchange: row
        for row in ticker_rows
        if row.exchange in GROUPS['korea'] and row.market_type == 'spot' and row.currency == 'KRW'
    }

    withdrawals_by_key: dict[tuple[str, str], list] = {}
    for row in withdrawal_rows:
        withdrawals_by_key.setdefault((row.exchange, row.coin), []).append(row)

    # 글로벌 거래소 BTC Bitcoin on-chain 출금 수수료 (USDT 경유 일반 경로에 포함)
    # Bitcoin 네트워크만 선택 (BNB Smart Chain, ERC20 등 wrapped BTC 제외)
    _global_btc_wds = withdrawals_by_key.get((global_exchange, 'BTC'), [])
    global_onchain_wd_fee: float | None = None
    global_onchain_wd_fee_krw: int = 0
    for _wd in _global_btc_wds:
        label_lower = (_wd.network_label or '').lower()
        is_bitcoin_native = ('bitcoin' in label_lower or 'btc' in label_lower) and 'lightning' not in label_lower
        is_non_btc_chain = any(x in label_lower for x in ('bep20', 'erc20', 'trc20', 'solana', 'aptos', 'sui', 'x layer', 'bnb'))
        if _wd.enabled and _wd.fee is not None and is_bitcoin_native and not is_non_btc_chain:
            global_onchain_wd_fee = _wd.fee
            global_onchain_wd_fee_krw = int(round(_wd.fee_krw)) if _wd.fee_krw is not None else round(_wd.fee * global_btc_price_usd * float(usd_krw_rate))
            break

    maintenance_status: dict[str, list[dict]] = {}
    for row in network_rows:
        if row.status == 'ok':
            continue
        maintenance_status.setdefault(row.exchange, []).append({
            'coin': row.coin or '',
            'network': row.network or '',
            'reason': row.reason or row.status,
        })

    maintenance_checked_at = latest_run.completed_at.isoformat() if latest_run.completed_at else None
    paths = []
    disabled_paths = []

    for exchange in GROUPS['korea']:
        ticker_row = ticker_by_exchange.get(exchange)
        if ticker_row is None:
            continue

        korean_btc_price_krw = float(ticker_row.price)
        korean_taker = (ticker_row.taker_fee_pct / 100) if ticker_row.taker_fee_pct is not None else TRADING_FEES[exchange]['taker']

        for row in withdrawals_by_key.get((exchange, 'BTC'), []):
            if not row.enabled or row.fee is None:
                continue
            suspension_reason = is_suspended(exchange, 'BTC', row.network_label)
            if suspension_reason:
                disabled_paths.append({'korean_exchange': exchange, 'transfer_coin': 'BTC', 'network': row.network_label, 'reason': suspension_reason})
                continue

            trading_fee_krw = round(amount_krw * korean_taker)
            btc_bought = (amount_krw - trading_fee_krw) / korean_btc_price_krw
            btc_received = btc_bought - row.fee
            if btc_received <= 0:
                continue

            withdrawal_fee_krw = int(round(row.fee_krw)) if row.fee_krw is not None else round(row.fee * korean_btc_price_krw)
            total_fee_krw = trading_fee_krw + withdrawal_fee_krw
            paths.append({
                'korean_exchange': exchange,
                'transfer_coin': 'BTC',
                'network': row.network_label,
                'btc_received': round(btc_received, 8),
                'btc_received_usd': round(btc_received * global_btc_price_usd, 2),
                'total_fee_krw': total_fee_krw,
                'fee_pct': round(total_fee_krw / amount_krw * 100, 4),
                'breakdown': {
                    'components': [
                        fee_component('국내 매수 수수료', trading_fee_krw, rate_pct=korean_taker * 100),
                        fee_component('BTC 출금 수수료', withdrawal_fee_krw, amount_text=f'{row.fee} BTC', source_url=get_withdrawal_source_url(exchange, 'BTC', row.network_label)),
                    ],
                    'total_fee_krw': total_fee_krw,
                },
            })

        for row in withdrawals_by_key.get((exchange, 'USDT'), []):
            if not row.enabled or row.fee is None:
                continue
            suspension_reason = is_suspended(exchange, 'USDT', row.network_label)
            if suspension_reason:
                disabled_paths.append({'korean_exchange': exchange, 'transfer_coin': 'USDT', 'network': row.network_label, 'reason': suspension_reason})
                continue

            trading_fee_krw = round(amount_krw * korean_taker)
            usdt_bought = (amount_krw - trading_fee_krw) / usd_krw_rate
            usdt_after_withdrawal = usdt_bought - row.fee
            if usdt_after_withdrawal <= 0:
                continue

            global_trading_fee_usdt = usdt_after_withdrawal * global_taker
            usdt_for_btc = usdt_after_withdrawal - global_trading_fee_usdt
            btc_at_global = usdt_for_btc / global_btc_price_usd
            withdrawal_fee_krw = int(round(row.fee_krw)) if row.fee_krw is not None else round(row.fee * usd_krw_rate)
            global_trading_fee_krw = round(global_trading_fee_usdt * usd_krw_rate)
            # 글로벌 거래소 BTC on-chain 출금 수수료 포함 (playground 모델과 동일)
            if global_onchain_wd_fee is not None:
                btc_received = btc_at_global - global_onchain_wd_fee
                total_fee_krw = trading_fee_krw + withdrawal_fee_krw + global_trading_fee_krw + global_onchain_wd_fee_krw
                wd_components = [
                    fee_component('국내 매수 수수료', trading_fee_krw, rate_pct=korean_taker * 100),
                    fee_component('USDT 출금 수수료', withdrawal_fee_krw, amount_text=f'{row.fee} USDT', source_url=get_withdrawal_source_url(exchange, 'USDT', row.network_label)),
                    fee_component('해외 BTC 매수 수수료', global_trading_fee_krw, rate_pct=global_taker * 100, amount_text=f'{round(global_trading_fee_usdt, 8)} USDT'),
                    fee_component(f'해외 BTC 출금 수수료 ({global_exchange})', global_onchain_wd_fee_krw, amount_text=f'{global_onchain_wd_fee} BTC'),
                ]
            else:
                btc_received = btc_at_global
                total_fee_krw = trading_fee_krw + withdrawal_fee_krw + global_trading_fee_krw
                wd_components = [
                    fee_component('국내 매수 수수료', trading_fee_krw, rate_pct=korean_taker * 100),
                    fee_component('USDT 출금 수수료', withdrawal_fee_krw, amount_text=f'{row.fee} USDT', source_url=get_withdrawal_source_url(exchange, 'USDT', row.network_label)),
                    fee_component('해외 BTC 매수 수수료', global_trading_fee_krw, rate_pct=global_taker * 100, amount_text=f'{round(global_trading_fee_usdt, 8)} USDT'),
                ]
            if btc_received <= 0:
                continue
            paths.append({
                'korean_exchange': exchange,
                'transfer_coin': 'USDT',
                'network': row.network_label,
                'btc_received': round(btc_received, 8),
                'btc_received_usd': round(btc_received * global_btc_price_usd, 2),
                'total_fee_krw': total_fee_krw,
                'fee_pct': round(total_fee_krw / amount_krw * 100, 4),
                'breakdown': {
                    'components': wd_components,
                    'total_fee_krw': total_fee_krw,
                },
            })

    # Lightning exit 경로 추가 (온체인 BTC → Lightning 스왑 서비스 → 개인 Lightning 지갑)
    if lightning_swap_rows:
        active_swaps = [s for s in lightning_swap_rows if s.enabled and s.fee_pct is not None]

        # 글로벌 거래소 BTC 출금 수수료 조회 (USDT 경유 경로에 필요)
        global_btc_withdrawals = withdrawals_by_key.get((global_exchange, 'BTC'), [])

        # Lightning Network 출금 수수료 (Lightning exit 경로 B 전용)
        global_ln_wd_row = None
        for wd_row in global_btc_withdrawals:
            if wd_row.enabled and wd_row.fee is not None and 'lightning' in (wd_row.network_label or '').lower():
                global_ln_wd_row = wd_row
                break

        global_ln_wd_fee = global_ln_wd_row.fee if global_ln_wd_row else None
        global_ln_wd_fee_krw = (
            int(round(global_ln_wd_row.fee_krw)) if global_ln_wd_row and global_ln_wd_row.fee_krw is not None
            else round(global_ln_wd_row.fee * global_btc_price_usd * float(usd_krw_rate)) if global_ln_wd_row
            else 0
        )

        for swap in active_swaps:
            fee_pct = swap.fee_pct / 100  # % → 소수
            fee_fixed_btc = (swap.fee_fixed_sat or 0) / 1e8  # sat → BTC

            min_btc = (swap.min_amount_sat or 0) / 1e8
            max_btc = (swap.max_amount_sat or float('inf')) / 1e8

            for exchange in GROUPS['korea']:
                ticker_row = ticker_by_exchange.get(exchange)
                if ticker_row is None:
                    continue
                korean_btc_price_krw = float(ticker_row.price)
                korean_taker = (ticker_row.taker_fee_pct / 100) if ticker_row.taker_fee_pct is not None else TRADING_FEES[exchange]['taker']

                # ------ Lightning 경로 A: 한국 거래소 BTC 직접 → Lightning swap ------
                for row in withdrawals_by_key.get((exchange, 'BTC'), []):
                    if not row.enabled or row.fee is None:
                        continue
                    suspension_reason = is_suspended(exchange, 'BTC', row.network_label)
                    if suspension_reason:
                        continue

                    trading_fee_krw = round(amount_krw * korean_taker)
                    btc_bought = (amount_krw - trading_fee_krw) / korean_btc_price_krw
                    btc_after_wd = btc_bought - row.fee
                    if btc_after_wd <= 0:
                        continue
                    if not (min_btc <= btc_after_wd <= max_btc):
                        continue

                    # Lightning 스왑 수수료
                    ln_swap_fee_btc = btc_after_wd * fee_pct + fee_fixed_btc
                    btc_received = btc_after_wd - ln_swap_fee_btc
                    if btc_received <= 0:
                        continue

                    withdrawal_fee_krw = int(round(row.fee_krw)) if row.fee_krw is not None else round(row.fee * korean_btc_price_krw)
                    ln_swap_fee_krw = round(ln_swap_fee_btc * korean_btc_price_krw)
                    total_fee_krw = trading_fee_krw + withdrawal_fee_krw + ln_swap_fee_krw

                    paths.append({
                        'korean_exchange': exchange,
                        'transfer_coin': 'BTC',
                        'network': row.network_label,
                        'path_type': 'lightning_exit',
                        'swap_service': swap.service_name,
                        'btc_received': round(btc_received, 8),
                        'btc_received_usd': round(btc_received * global_btc_price_usd, 2),
                        'total_fee_krw': total_fee_krw,
                        'fee_pct': round(total_fee_krw / amount_krw * 100, 4),
                        'lightning_swap_fee_krw': ln_swap_fee_krw,
                        'breakdown': {
                            'components': [
                                fee_component('국내 매수 수수료', trading_fee_krw, rate_pct=korean_taker * 100),
                                fee_component('BTC 출금 수수료', withdrawal_fee_krw, amount_text=f'{row.fee} BTC', source_url=get_withdrawal_source_url(exchange, 'BTC', row.network_label)),
                                fee_component(f'라이트닝 스왑 수수료 ({swap.service_name})', ln_swap_fee_krw, rate_pct=swap.fee_pct, amount_text=f'{round(ln_swap_fee_btc, 8)} BTC'),
                            ],
                            'total_fee_krw': total_fee_krw,
                        },
                    })

                # ------ Lightning 경로 B: 한국→USDT→글로벌→BTC→Lightning swap ------
                for row in withdrawals_by_key.get((exchange, 'USDT'), []):
                    if not row.enabled or row.fee is None:
                        continue
                    suspension_reason = is_suspended(exchange, 'USDT', row.network_label)
                    if suspension_reason:
                        continue

                    trading_fee_krw = round(amount_krw * korean_taker)
                    usdt_bought = (amount_krw - trading_fee_krw) / float(usd_krw_rate)
                    usdt_after_wd = usdt_bought - row.fee
                    if usdt_after_wd <= 0:
                        continue

                    global_trading_fee_usdt = usdt_after_wd * global_taker
                    usdt_for_btc = usdt_after_wd - global_trading_fee_usdt
                    btc_at_global = usdt_for_btc / global_btc_price_usd

                    # 글로벌 거래소 BTC Lightning 출금 (Lightning exit 경로에는 LN 출금 필수)
                    if global_ln_wd_fee is None:
                        continue
                    btc_after_global_wd = btc_at_global - global_ln_wd_fee
                    if btc_after_global_wd <= 0:
                        continue
                    if not (min_btc <= btc_after_global_wd <= max_btc):
                        continue

                    # Lightning 스왑 수수료
                    ln_swap_fee_btc = btc_after_global_wd * fee_pct + fee_fixed_btc
                    btc_received = btc_after_global_wd - ln_swap_fee_btc
                    if btc_received <= 0:
                        continue

                    withdrawal_fee_krw = int(round(row.fee_krw)) if row.fee_krw is not None else round(row.fee * float(usd_krw_rate))
                    global_trading_fee_krw = round(global_trading_fee_usdt * float(usd_krw_rate))
                    ln_swap_fee_krw = round(ln_swap_fee_btc * global_btc_price_usd * float(usd_krw_rate))
                    total_fee_krw = trading_fee_krw + withdrawal_fee_krw + global_trading_fee_krw + global_ln_wd_fee_krw + ln_swap_fee_krw

                    components = [
                        fee_component('국내 매수 수수료', trading_fee_krw, rate_pct=korean_taker * 100),
                        fee_component('USDT 출금 수수료', withdrawal_fee_krw, amount_text=f'{row.fee} USDT', source_url=get_withdrawal_source_url(exchange, 'USDT', row.network_label)),
                        fee_component('해외 BTC 매수 수수료', global_trading_fee_krw, rate_pct=global_taker * 100, amount_text=f'{round(global_trading_fee_usdt, 8)} USDT'),
                        fee_component(f'해외 BTC 라이트닝 출금 수수료 ({global_exchange})', global_ln_wd_fee_krw, amount_text=f'{global_ln_wd_fee} BTC'),
                    ]
                    components.append(fee_component(f'라이트닝 스왑 수수료 ({swap.service_name})', ln_swap_fee_krw, rate_pct=swap.fee_pct, amount_text=f'{round(ln_swap_fee_btc, 8)} BTC'))

                    paths.append({
                        'korean_exchange': exchange,
                        'transfer_coin': 'USDT',
                        'network': row.network_label,
                        'path_type': 'lightning_exit',
                        'swap_service': swap.service_name,
                        'btc_received': round(btc_received, 8),
                        'btc_received_usd': round(btc_received * global_btc_price_usd, 2),
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
    lightning_services = sorted({s.service_name for s in (lightning_swap_rows or []) if s.enabled and s.fee_pct is not None})
    return {
        'amount_krw': amount_krw,
        'global_exchange': global_exchange,
        'global_btc_price_usd': global_btc_price_usd,
        'usd_krw_rate': round(float(usd_krw_rate)),
        'total_paths_evaluated': len(paths),
        'best_path': paths[0] if paths else None,
        'top5': paths[:5],
        'all_paths': paths,
        'disabled_paths': disabled_paths,
        'maintenance_checked_at': maintenance_checked_at,
        'data_source': 'latest_snapshot',
        'latest_scraping_time': latest_run.completed_at.isoformat() if latest_run.completed_at else None,
        'lightning_swap_services': lightning_services,
        'last_run': {
            'id': latest_run.id,
            'status': latest_run.status,
            'completed_at': latest_run.completed_at.isoformat() if latest_run.completed_at else None,
        },
    }


def get_network_status(exchange: str = 'all') -> dict:
    if exchange == 'all':
        targets = GROUPS['korea']
    elif exchange.lower() in GROUPS['korea']:
        targets = [exchange.lower()]
    else:
        return {'error': f'지원하지 않는 거래소: {exchange}. 한국 거래소만 지원 (upbit, bithumb, korbit, coinone, gopax)'}

    try:
        maintenance = check_maintenance_status(targets)
        checked_at = datetime.now().isoformat()
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
