"""sell 경로 계산 — find_cheapest_sell_path_from_snapshot_rows."""
from __future__ import annotations

import logging
import math
import time

import requests

from backend.app.domain.korea_deposit_policy import (
    personal_wallet_gate,
    third_party_deposit_gate,
    usdt_deposit_network_gate,
    vasp_gate,
)
from backend.app.domain.market_core import GROUPS, TRADING_FEES, get_withdrawal_source_url
from backend.app.domain.path_graph import (
    Blocked,
    global_sell_leg,
    korea_sell_leg,
    swap_leg,
    withdraw_leg,
)
from backend.app.domain.path_helpers import (
    _build_path_id,
    exchange_fee_promo_note,
    fee_component,
    is_bitcoin_native_network,
    is_suspended,
    korean_usdt_taker_rate,
    normalize_usdt_network,
)
from backend.app.domain.paths_context import SnapshotContext, build_snapshot_context
from backend.app.domain.paths_buy import _build_available_filters

logger = logging.getLogger(__name__)

MEMPOOL_RECOMMENDED_FEES_URL = 'https://mempool.space/api/v1/fees/recommended'
P2WPKH_INPUT_VBYTES = 68
P2WPKH_OUTPUT_VBYTES = 31
P2WPKH_BASE_TX_VBYTES = 10.5
DEFAULT_SELL_TX_OUTPUT_COUNT = 2

_mempool_cache: dict[str, dict] = {}
_MEMPOOL_CACHE_TTL = 30  # seconds


def _estimate_native_segwit_tx_vbytes(utxo_count: int, output_count: int = DEFAULT_SELL_TX_OUTPUT_COUNT) -> int:
    if utxo_count <= 0:
        raise ValueError('wallet_utxo_count는 1 이상이어야 합니다.')
    if output_count <= 0:
        raise ValueError('output_count는 1 이상이어야 합니다.')
    return math.ceil(P2WPKH_BASE_TX_VBYTES + (P2WPKH_INPUT_VBYTES * utxo_count) + (P2WPKH_OUTPUT_VBYTES * output_count))


def _fetch_mempool_recommended_fees() -> dict:
    cached = _mempool_cache.get('fees')
    if cached and time.time() - cached['ts'] < _MEMPOOL_CACHE_TTL:
        data = cached['data']
    else:
        try:
            response = requests.get(MEMPOOL_RECOMMENDED_FEES_URL, timeout=10, headers={'Accept': 'application/json'})
            response.raise_for_status()
            data = response.json()
            _mempool_cache['fees'] = {'data': data, 'ts': time.time()}
        except Exception as exc:  # pragma: no cover - network dependency
            raise ValueError(f'mempool.space 수수료 조회 실패: {exc}') from exc

    medium_fee_rate = data.get('halfHourFee') or data.get('hourFee') or data.get('fastestFee')
    if medium_fee_rate is None:
        raise ValueError('mempool.space 응답에 halfHourFee/hourFee/fastestFee가 없습니다.')

    return {
        'source': 'mempool.space',
        'source_url': MEMPOOL_RECOMMENDED_FEES_URL,
        'fee_target': 'medium',
        'medium_fee_rate_sat_vb': float(medium_fee_rate),
        'fastest_fee_sat_vb': float(data.get('fastestFee')) if data.get('fastestFee') is not None else None,
        'hour_fee_sat_vb': float(data.get('hourFee')) if data.get('hourFee') is not None else None,
        'economy_fee_sat_vb': float(data.get('economyFee')) if data.get('economyFee') is not None else None,
        'minimum_fee_sat_vb': float(data.get('minimumFee')) if data.get('minimumFee') is not None else None,
    }


def _estimate_wallet_btc_network_fee(*, wallet_utxo_count: int = 1) -> dict:
    fee_data = _fetch_mempool_recommended_fees()
    tx_vbytes = _estimate_native_segwit_tx_vbytes(wallet_utxo_count)
    fee_sats = max(math.ceil(fee_data['medium_fee_rate_sat_vb'] * tx_vbytes), 1)
    fee_btc = round(fee_sats / 100_000_000, 8)
    return {
        **fee_data,
        'address_type': 'p2wpkh',
        'utxo_count': wallet_utxo_count,
        'output_count': DEFAULT_SELL_TX_OUTPUT_COUNT,
        'estimated_tx_vbytes': tx_vbytes,
        'fee_sats': fee_sats,
        'fee_btc': fee_btc,
    }


def _estimate_wallet_btc_network_fee_btc(wallet_utxo_count: int = 1) -> float:
    return _estimate_wallet_btc_network_fee(wallet_utxo_count=wallet_utxo_count)['fee_btc']


def find_cheapest_sell_path_from_snapshot_rows(
    amount_btc: float,
    global_exchange: str,
    latest_run,
    ticker_rows: list,
    withdrawal_rows: list,
    network_rows: list,
    lightning_swap_rows: list | None = None,
    exchange_capability_rows: list | None = None,
    wallet_utxo_count: int = 1,
    deposit_status_rows: list | None = None,
    usdt_krw_rate: float | None = None,
) -> dict:
    global_exchange = global_exchange.lower()
    if global_exchange not in GROUPS['global']:
        return {'error': f"지원하지 않는 글로벌 거래소: {global_exchange}. {GROUPS['global']} 중 선택"}
    if latest_run is None:
        return {'error': '최신 수집 결과가 없습니다. 먼저 수동 크롤링을 실행하세요.'}
    if amount_btc <= 0:
        return {'error': 'amount_btc는 0보다 커야 합니다.'}
    if wallet_utxo_count <= 0:
        return {'error': 'wallet_utxo_count는 1 이상이어야 합니다.'}

    def build_entry(
        *,
        route_variant: str,
        korean_exchange: str,
        transfer_coin: str,
        domestic_withdrawal_network: str,
        global_exit_mode: str,
        global_exit_network: str,
        lightning_exit_provider: str | None,
        krw_received: int,
        total_fee_krw: int,
        breakdown_components: list[dict],
        deposit_gates: list[dict],
    ) -> dict:
        gross_krw = krw_received + total_fee_krw
        fee_pct = round(total_fee_krw / gross_krw * 100, 4) if gross_krw > 0 else 0
        return {
            'route_variant': route_variant,
            'korean_exchange': korean_exchange,
            'transfer_coin': transfer_coin,
            'network': domestic_withdrawal_network,
            # 해외 거래소마다 같은 체인을 다르게 표기한다('Tron (TRC20)'/'TRC20'). 화면이 망 단위로
            # 묶거나 거를 때 표기 차이에 흔들리지 않도록 정규화 키를 함께 준다.
            'network_key': normalize_usdt_network(domestic_withdrawal_network) if transfer_coin == 'USDT' else None,
            'domestic_withdrawal_network': domestic_withdrawal_network,
            'global_exit_mode': global_exit_mode,
            'global_exit_network': global_exit_network,
            'lightning_exit_provider': lightning_exit_provider,
            'path_id': _build_path_id(
                global_exchange=global_exchange,
                korean_exchange=korean_exchange,
                transfer_coin=transfer_coin,
                domestic_withdrawal_network=domestic_withdrawal_network,
                global_exit_mode=global_exit_mode,
                global_exit_network=global_exit_network,
                lightning_exit_provider=lightning_exit_provider,
            ),
            'krw_received': krw_received,
            'total_fee_krw': total_fee_krw,
            'fee_pct': fee_pct,
            # 국내 거래소가 이 입금을 받아주는지에 걸리는 관문.
            # 수수료로는 드러나지 않지만 경로를 실제로 실행할 수 있는지를 가른다.
            'deposit_gates': [g for g in deposit_gates if g is not None],
            'breakdown': {
                'components': breakdown_components,
                'total_fee_krw': total_fee_krw,
            },
        }

    try:
        wallet_fee_estimate = _estimate_wallet_btc_network_fee(wallet_utxo_count=wallet_utxo_count)
    except ValueError as exc:
        return {'error': str(exc)}

    ctx_or_err = build_snapshot_context(
        global_exchange, latest_run, ticker_rows, withdrawal_rows, network_rows, usdt_krw_rate=usdt_krw_rate,
    )
    if isinstance(ctx_or_err, dict):
        return ctx_or_err
    ctx: SnapshotContext = ctx_or_err

    # 국내 거래소에서 USDT 를 팔 때 받는 값은 포렉스 환율이 아니라 국내 USDT/KRW 시세다.
    # 필드 이름은 매수 쪽에서 붙었지만 같은 시세(주입되지 않으면 포렉스 폴백)를 가리킨다.
    usdt_krw = ctx.usdt_buy_krw_rate
    # 해외에서 파는 경로에서 BTC 1개가 결국 몇 원이 되는지. 수수료를 원화로 평가하는 기준이다.
    global_btc_krw = ctx.global_btc_price_usd * usdt_krw

    wallet_network_fee_btc = wallet_fee_estimate['fee_btc']
    wallet_network_fee_krw = round(wallet_network_fee_btc * ctx.global_btc_price_usd * ctx.usd_krw_rate)
    wallet_fee_estimate = {
        **wallet_fee_estimate,
        'fee_krw': wallet_network_fee_krw,
    }
    def btc_fee_krw(fee_btc: float, btc_price_krw: float) -> int:
        # BTC 로 떼이는 수수료는 그 경로에서 BTC 가 최종적으로 팔리는 시세로 평가한다.
        # 국내에서 파는 경로를 해외 시세로 평가하면 실수령액과 수수료의 합이 김프만큼 어긋난다.
        return round(fee_btc * btc_price_krw)

    wallet_fee_amount_text = (
        f"{wallet_fee_estimate['fee_sats']} sats · {wallet_fee_estimate['estimated_tx_vbytes']} vB @ "
        f"{wallet_fee_estimate['medium_fee_rate_sat_vb']:g} sat/vB"
    )

    capability_by_exchange: dict[str, object] = {
        row.exchange: row for row in (exchange_capability_rows or [])
    }

    # 국내 거래소가 지금 그 체인으로 입금을 받는지. 거래소마다 같은 체인을 다르게 표기해서
    # (빗썸 'TRC20' 대 OKX 'Tron (TRC20)') 정규화 키로 맞춘다. 수집원이 없는 거래소는
    # 키가 아예 없고, 그때 조회 결과인 None 이 '모름'을 뜻한다.
    deposit_enabled_by_key: dict[tuple[str, str, str], bool] = {
        (row.exchange, row.coin, normalize_usdt_network(row.network_label)): row.enabled
        for row in (deposit_status_rows or [])
    }

    def _deposit_enabled(korean_exchange: str, coin: str, network_label: str) -> bool | None:
        return deposit_enabled_by_key.get(
            (korean_exchange, coin, normalize_usdt_network(network_label))
        )

    paths: list[dict] = []
    disabled_paths: list[dict] = []
    # disabled_paths 중복 제거용 키 세트
    _disabled_keys: set[tuple] = set()

    def _add_disabled(*, korean_exchange: str, transfer_coin: str, network: str, reason: str) -> None:
        # 국내 거래소를 키에 포함한다. 출금 정지처럼 글로벌 거래소에서 비롯된 사유는 국내
        # 거래소와 무관하지만, 입금망 제약은 거래소마다 다르기 때문이다. 거래소를 빼면 먼저
        # 기록된 거래소의 행 하나만 남고, 화면이 korean_exchange 로 걸러 읽으므로 나머지
        # 거래소에서는 그 네트워크가 사유 없이 사라진다.
        key = (korean_exchange, transfer_coin, network, reason)
        if key not in _disabled_keys:
            _disabled_keys.add(key)
            disabled_paths.append({
                'korean_exchange': korean_exchange,
                'transfer_coin': transfer_coin,
                'network': network,
                'reason': reason,
            })

    def usdt_tail(
        *,
        exchange: str,
        row,
        btc_at_global: float,
        korean_taker_usdt: float,
        usdt_voucher_note: str | None,
    ) -> dict | None:
        """해외 BTC 매도 → USDT 출금 → 국내 USDT 매도. 경로 2·4 가 공유하는 뒷부분.

        막히면 비활성 사유를 남기고 None 을 돌려준다.
        """
        # 글로벌 거래소가 이 체인으로 출금할 수 있다는 사실과, 국내 거래소가 이 체인으로
        # 입금을 받는다는 사실은 별개다. 받는 쪽이 확인되지 않은 경로는 만들지 않는다.
        network_gate = usdt_deposit_network_gate(
            exchange, row.network_label, _deposit_enabled(exchange, 'USDT', row.network_label),
        )
        if network_gate is not None:
            _add_disabled(korean_exchange=exchange, transfer_coin='USDT', network=row.network_label, reason=network_gate['label'])
            return None

        gsell = global_sell_leg(btc_at_global, ctx.global_taker, ctx.global_btc_price_usd, usdt_krw)
        source_url = get_withdrawal_source_url(global_exchange, 'USDT', row.network_label)
        wd = withdraw_leg(
            row,
            gsell.amount_out,
            coin='USDT',
            price_krw=usdt_krw,
            usd_krw=usdt_krw,
            source_url=source_url,
            maintenance_status=ctx.maintenance_status,
            exchange=global_exchange,
        )
        if isinstance(wd, Blocked):
            _add_disabled(korean_exchange=exchange, transfer_coin='USDT', network=row.network_label, reason=wd.reason)
            return None
        usdt_at_korean = wd.amount_out
        if usdt_at_korean <= 0:
            return None

        ksell = korea_sell_leg(usdt_at_korean, korean_taker_usdt, 0.0, 'USDT', usdt_krw, note=usdt_voucher_note)
        return {
            'krw_received': ksell.amount_out,
            'fee_krw': gsell.fee_krw + wd.fee_krw + ksell.fee_krw,
            # 국내 거래소로 들어오는 마지막 구간의 송신인이 해외 거래소다.
            # 기준 금액은 입금되는 USDT 의 원화 환산가로 따진다.
            'deposit_gate': vasp_gate(exchange, global_exchange, usdt_at_korean * usdt_krw),
            'components': [
                gsell.components[0],
                fee_component('USDT 전송 수수료', wd.fee_krw, amount_text=f'{row.fee} USDT', source_url=source_url),
                fee_component('국내 KRW 전환 수수료', ksell.fee_krw, rate_pct=korean_taker_usdt * 100, amount_text=f'{round(usdt_at_korean * korean_taker_usdt, 8)} USDT', note=usdt_voucher_note),
            ],
        }

    btc_after_network = amount_btc - wallet_network_fee_btc

    for exchange in GROUPS['korea']:
        ticker_row = ctx.ticker_by_exchange.get(exchange)
        if ticker_row is None:
            continue
        if btc_after_network <= 0:
            break

        korean_btc_price_krw = float(ticker_row.price)
        korean_taker = (ticker_row.taker_fee_pct / 100) if ticker_row.taker_fee_pct is not None else TRADING_FEES[exchange]['taker']
        # 거래소당 1회만 조회 (파일 캐시라 경로마다 부르면 디스크를 반복해서 읽는다)
        voucher_note = exchange_fee_promo_note(exchange)
        # 업비트 USDT/KRW 등 원화마켓 스테이블코인 페어 한정 이벤트 — BTC 레그(korean_taker/voucher_note)에는
        # 적용되지 않으므로 USDT 레그(경로 2) 전용 변수를 따로 둔다.
        korean_taker_usdt = korean_usdt_taker_rate(exchange, korean_taker)
        usdt_voucher_note = exchange_fee_promo_note(exchange, coin='USDT')

        # ----- 경로 1: BTC 직접 (개인지갑 BTC → 온체인 → 국내 BTC 매도) -----
        for row in ctx.withdrawals_by_key.get((exchange, 'BTC'), []):
            # 이 루프는 국내 거래소가 지원하는 BTC 망 이름을 얻으려고 돈다. 파는 방향에서 이
            # 구간은 거래소로 보내는 '입금'이라 출금 수수료도, 출금 가능 여부도 쓰지 않는다.
            # 개인 비트코인 지갑이 보낼 수 있는 곳은 온체인 주소뿐이라 라이트닝·래핑 BTC 망은
            # 후보가 아니다. 후보가 아닌 망은 비활성 목록에도 올리지 않는다.
            if not is_bitcoin_native_network((row.network_label or '').lower()):
                continue
            # 입금 상태를 모르면(수집원 없음) 예전처럼 망이 있다는 사실만으로 경로를 만든다.
            btc_deposit_enabled = _deposit_enabled(exchange, 'BTC', row.network_label)
            if btc_deposit_enabled is False:
                _add_disabled(
                    korean_exchange=exchange, transfer_coin='BTC', network=row.network_label,
                    reason='거래소 점검으로 입금 중단',
                )
                continue
            suspension_reason = is_suspended(ctx.maintenance_status, exchange, 'BTC', row.network_label)
            if suspension_reason:
                _add_disabled(korean_exchange=exchange, transfer_coin='BTC', network=row.network_label, reason=suspension_reason)
                continue

            sell = korea_sell_leg(btc_after_network, korean_taker, korean_btc_price_krw, 'BTC', ctx.usd_krw_rate, note=voucher_note)
            wallet_fee_krw = btc_fee_krw(wallet_network_fee_btc, korean_btc_price_krw)
            # 국내 거래소가 받는 쪽이고 보내는 쪽이 개인 지갑이다.
            # 기준 금액은 '입금되는 금액'으로 따지므로 매도 후 원화가 아니라 입금 시점 평가액을 쓴다.
            deposit_value_krw = btc_after_network * korean_btc_price_krw
            paths.append(build_entry(
                route_variant='btc_direct',
                deposit_gates=[personal_wallet_gate(exchange, deposit_value_krw)],
                korean_exchange=exchange,
                transfer_coin='BTC',
                domestic_withdrawal_network=row.network_label,
                global_exit_mode='onchain',
                global_exit_network=row.network_label,
                lightning_exit_provider=None,
                krw_received=sell.amount_out,
                total_fee_krw=wallet_fee_krw + sell.fee_krw,
                breakdown_components=[
                    fee_component('개인지갑 BTC 네트워크 수수료', wallet_fee_krw, amount_text=wallet_fee_amount_text, source_url=wallet_fee_estimate['source_url']),
                    fee_component('국내 BTC 매도 수수료', sell.fee_krw, rate_pct=korean_taker * 100, amount_text=f'{round(btc_after_network * korean_taker, 8)} BTC', note=voucher_note),
                ],
            ))

        # ----- 경로 2: USDT via global (개인지갑 BTC → 글로벌 BTC 매도 → USDT 출금 → 국내 USDT→KRW) -----
        wallet_fee_krw_global = btc_fee_krw(wallet_network_fee_btc, global_btc_krw)
        for row in ctx.withdrawals_by_key.get((global_exchange, 'USDT'), []):
            suspension_reason = is_suspended(ctx.maintenance_status, global_exchange, 'USDT', row.network_label)
            if suspension_reason:
                _add_disabled(korean_exchange=exchange, transfer_coin='USDT', network=row.network_label, reason=suspension_reason)
                continue

            tail = usdt_tail(
                exchange=exchange, row=row, btc_at_global=btc_after_network,
                korean_taker_usdt=korean_taker_usdt, usdt_voucher_note=usdt_voucher_note,
            )
            if tail is None:
                continue
            paths.append(build_entry(
                route_variant='usdt_via_global',
                deposit_gates=[tail['deposit_gate']],
                korean_exchange=exchange,
                transfer_coin='USDT',
                domestic_withdrawal_network=row.network_label,
                global_exit_mode='onchain',
                global_exit_network='Bitcoin',
                lightning_exit_provider=None,
                krw_received=tail['krw_received'],
                total_fee_krw=wallet_fee_krw_global + tail['fee_krw'],
                breakdown_components=[
                    fee_component('개인지갑 BTC 네트워크 수수료', wallet_fee_krw_global, amount_text=wallet_fee_amount_text, source_url=wallet_fee_estimate['source_url']),
                    *tail['components'],
                ],
            ))

    if lightning_swap_rows and btc_after_network > 0:
        # sell 모드: 개인 온체인 지갑 → onchain_to_ln 스왑 → Lightning → 거래소 입금.
        # 라이트닝을 받는 쪽이 경로마다 다르다. 경로 3 은 국내 거래소, 경로 4 는 해외 거래소다.
        def _supports_ln_deposit(ex: str) -> bool:
            cap = capability_by_exchange.get(ex)
            return bool(cap.supports_lightning_deposit) if cap is not None else False

        global_has_lightning = _supports_ln_deposit(global_exchange)
        active_swaps = [
            s for s in lightning_swap_rows
            if s.enabled and s.fee_pct is not None and getattr(s, 'direction', None) == 'onchain_to_ln'
        ]
        for swap in active_swaps:
            sl = swap_leg(swap, btc_after_network, ctx.global_btc_price_usd, ctx.usd_krw_rate)
            if isinstance(sl, Blocked):
                continue
            btc_after_swap = sl.amount_out
            if btc_after_swap <= 0:
                continue
            swap_fee_btc = btc_after_network - btc_after_swap

            for exchange in GROUPS['korea']:
                ticker_row = ctx.ticker_by_exchange.get(exchange)
                if ticker_row is None:
                    continue
                korean_btc_price_krw = float(ticker_row.price)
                korean_taker = (ticker_row.taker_fee_pct / 100) if ticker_row.taker_fee_pct is not None else TRADING_FEES[exchange]['taker']
                voucher_note = exchange_fee_promo_note(exchange)
                # 경로 4(lightning_via_global)의 USDT 레그 전용 — 경로 3(BTC 직접)에는 적용 안 함
                korean_taker_usdt = korean_usdt_taker_rate(exchange, korean_taker)
                usdt_voucher_note = exchange_fee_promo_note(exchange, coin='USDT')

                # ----- 경로 3: lightning_direct (LN → 국내 BTC 매도) -----
                if _supports_ln_deposit(exchange):
                    sell = korea_sell_leg(btc_after_swap, korean_taker, korean_btc_price_krw, 'BTC', ctx.usd_krw_rate, note=voucher_note)
                    wallet_fee_krw = btc_fee_krw(wallet_network_fee_btc, korean_btc_price_krw)
                    swap_fee_krw = btc_fee_krw(swap_fee_btc, korean_btc_price_krw)
                    paths.append(build_entry(
                        route_variant='lightning_direct',
                        # 라이트닝 스왑 서비스가 국내 거래소로 보내므로 송신인이 회원 본인이 아니다.
                        deposit_gates=[third_party_deposit_gate(exchange)],
                        korean_exchange=exchange,
                        transfer_coin='BTC',
                        domestic_withdrawal_network='Lightning Network',
                        global_exit_mode='lightning',
                        global_exit_network='Lightning Network',
                        lightning_exit_provider=swap.service_name,
                        krw_received=sell.amount_out,
                        total_fee_krw=wallet_fee_krw + swap_fee_krw + sell.fee_krw,
                        breakdown_components=[
                            fee_component('개인지갑 BTC 네트워크 수수료', wallet_fee_krw, amount_text=wallet_fee_amount_text, source_url=wallet_fee_estimate['source_url']),
                            fee_component(f'라이트닝 스왑 수수료 ({swap.service_name})', swap_fee_krw, rate_pct=swap.fee_pct, amount_text=f'{round(swap_fee_btc, 8)} BTC'),
                            fee_component('국내 BTC 매도 수수료', sell.fee_krw, rate_pct=korean_taker * 100, amount_text=f'{round(btc_after_swap * korean_taker, 8)} BTC', note=voucher_note),
                        ],
                    ))

                # ----- 경로 4: lightning_via_global (LN → 글로벌 BTC 매도 → USDT 출금 → 국내 KRW) -----
                if not global_has_lightning:
                    continue
                wallet_fee_krw_global = btc_fee_krw(wallet_network_fee_btc, global_btc_krw)
                swap_fee_krw_global = btc_fee_krw(swap_fee_btc, global_btc_krw)
                for row in ctx.withdrawals_by_key.get((global_exchange, 'USDT'), []):
                    # 출금 정지 사유는 경로 2 가 이미 비활성 목록에 남겼다.
                    if is_suspended(ctx.maintenance_status, global_exchange, 'USDT', row.network_label):
                        continue
                    # 스왑을 거쳐도 국내 거래소로 들어오는 마지막 구간은 같은 USDT 입금이다.
                    tail = usdt_tail(
                        exchange=exchange, row=row, btc_at_global=btc_after_swap,
                        korean_taker_usdt=korean_taker_usdt, usdt_voucher_note=usdt_voucher_note,
                    )
                    if tail is None:
                        continue
                    paths.append(build_entry(
                        route_variant='lightning_via_global',
                        deposit_gates=[tail['deposit_gate']],
                        korean_exchange=exchange,
                        transfer_coin='USDT',
                        domestic_withdrawal_network=row.network_label,
                        global_exit_mode='lightning',
                        global_exit_network='Lightning Network',
                        lightning_exit_provider=swap.service_name,
                        krw_received=tail['krw_received'],
                        total_fee_krw=wallet_fee_krw_global + swap_fee_krw_global + tail['fee_krw'],
                        breakdown_components=[
                            fee_component('개인지갑 BTC 네트워크 수수료', wallet_fee_krw_global, amount_text=wallet_fee_amount_text, source_url=wallet_fee_estimate['source_url']),
                            fee_component(f'라이트닝 스왑 수수료 ({swap.service_name})', swap_fee_krw_global, rate_pct=swap.fee_pct, amount_text=f'{round(swap_fee_btc, 8)} BTC'),
                            *tail['components'],
                        ],
                    ))

    paths.sort(key=lambda item: (-item['krw_received'], item['total_fee_krw']))
    lightning_services = sorted({
        s.service_name for s in (lightning_swap_rows or [])
        if s.enabled and s.fee_pct is not None
        and getattr(s, 'direction', None) == 'onchain_to_ln'
    })
    return {
        'mode': 'sell',
        'amount_btc': amount_btc,
        'wallet_fee_estimate': wallet_fee_estimate,
        'global_exchange': global_exchange,
        'global_btc_price_usd': ctx.global_btc_price_usd,
        'usd_krw_rate': round(ctx.usd_krw_rate),
        # USDT → 원화 전환에 쓴 국내 USDT/KRW 시세(주입되지 않으면 포렉스와 같다).
        'usdt_krw_rate': round(float(usdt_krw), 2),
        'total_paths_evaluated': len(paths),
        'best_path': paths[0] if paths else None,
        'top5': paths[:5],
        'all_paths': paths,
        'disabled_paths': disabled_paths,
        'available_filters': _build_available_filters(paths),
        'maintenance_checked_at': ctx.maintenance_checked_at,
        'data_source': 'latest_snapshot',
        'latest_scraping_time': ctx.last_run['completed_at'],
        'lightning_swap_services': lightning_services,
        'last_run': ctx.last_run,
    }
