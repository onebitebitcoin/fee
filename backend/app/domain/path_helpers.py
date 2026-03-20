"""Path calculation helper utilities shared across market_paths.py functions."""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)


def build_ticker_by_exchange(ticker_rows: list, korea_exchanges: list) -> dict:
    """한국 거래소별 spot KRW 티커 행을 딕셔너리로 반환."""
    return {
        row.exchange: row
        for row in ticker_rows
        if row.exchange in korea_exchanges and row.market_type == 'spot' and row.currency == 'KRW'
    }


def build_withdrawals_by_key(withdrawal_rows: list) -> dict:
    """(exchange, coin) 키별 출금 행 리스트를 딕셔너리로 반환."""
    result: dict[tuple[str, str], list] = {}
    for row in withdrawal_rows:
        result.setdefault((row.exchange, row.coin), []).append(row)
    return result


def build_maintenance_status(network_rows: list) -> dict:
    """네트워크 행에서 점검/정지 상태 딕셔너리를 빌드."""
    status: dict[str, list[dict]] = {}
    for row in network_rows:
        if row.status == 'ok':
            continue
        status.setdefault(row.exchange, []).append({
            'coin': row.coin or '',
            'network': row.network or '',
            'reason': row.reason or row.status,
        })
    return status


def resolve_global_onchain_wd_fee(
    withdrawals_by_key: dict,
    global_exchange: str,
    global_btc_price_usd: float,
    usd_krw_rate: float,
) -> tuple[float | None, int, str | None]:
    """글로벌 거래소 BTC 온체인 출금 수수료를 (fee_btc, fee_krw, network_label) 형태로 반환.

    찾지 못하면 (None, 0, None) 반환.
    """
    for wd in withdrawals_by_key.get((global_exchange, 'BTC'), []):
        label_lower = (wd.network_label or '').lower()
        if wd.enabled and wd.fee is not None and is_bitcoin_native_network(label_lower):
            fee_btc = wd.fee
            fee_krw = int(round(wd.fee_krw)) if wd.fee_krw is not None else round(wd.fee * global_btc_price_usd * usd_krw_rate)
            return fee_btc, fee_krw, wd.network_label
    return None, 0, None


def _slug_path_part(value: str | None) -> str:
    raw = (value or 'na').strip().lower()
    parts = []
    prev_dash = False
    for char in raw:
        if char.isalnum():
            parts.append(char)
            prev_dash = False
        elif not prev_dash:
            parts.append('-')
            prev_dash = True
    return ''.join(parts).strip('-') or 'na'


def _build_path_id(
    *,
    global_exchange: str,
    korean_exchange: str,
    transfer_coin: str,
    domestic_withdrawal_network: str | None,
    global_exit_mode: str | None,
    global_exit_network: str | None,
    lightning_exit_provider: str | None,
) -> str:
    return '__'.join([
        _slug_path_part(global_exchange),
        _slug_path_part(korean_exchange),
        _slug_path_part(transfer_coin),
        _slug_path_part(domestic_withdrawal_network),
        _slug_path_part(global_exit_mode),
        _slug_path_part(global_exit_network),
        _slug_path_part(lightning_exit_provider or 'none'),
    ])


def is_bitcoin_native_network(label_lower: str) -> bool:
    """BTC 온체인 네트워크인지 판별. Lightning 및 EVM 체인 제외."""
    is_bitcoin_native = ('bitcoin' in label_lower or 'btc' in label_lower) and 'lightning' not in label_lower
    is_non_btc_chain = any(x in label_lower for x in ('bep20', 'erc20', 'trc20', 'solana', 'aptos', 'sui', 'x layer', 'bnb'))
    return is_bitcoin_native and not is_non_btc_chain


def is_suspended(maintenance_status: dict, exchange: str, coin: str, network_label: str) -> str | None:
    """점검/정지 상태 확인. 정지 중이면 이유 문자열 반환, 아니면 None."""
    for item in maintenance_status.get(exchange, []):
        if item.get('coin', '').upper() == coin.upper() and item.get('network', '').lower() in network_label.lower():
            return item.get('reason', '점검 중')
    return None


def fee_component(label: str, amount_krw: int, *, rate_pct: float | None = None, amount_text: str | None = None, source_url: str | None = None) -> dict:
    """수수료 구성요소 딕셔너리 생성."""
    return {
        'label': label,
        'amount_krw': amount_krw,
        'rate_pct': round(rate_pct, 4) if rate_pct is not None else None,
        'amount_text': amount_text,
        'source_url': source_url,
    }
