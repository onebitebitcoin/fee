"""CoinGecko 거래소 거래량 조회 서비스.

크롤링 파이프라인(하루 1회)에서 호출되어 DB에 저장한다.
API는 DB에서 읽으므로 CoinGecko 요청 횟수를 최소화한다.
"""
from __future__ import annotations

import logging
import httpx

logger = logging.getLogger(__name__)

# CoinGecko 거래소 ID 매핑 (our_id → coingecko_id)
COINGECKO_IDS: dict[str, str] = {
    'upbit':    'upbit',
    'bithumb':  'bithumb',
    'korbit':   'korbit',
    'coinone':  'coinone',
    'gopax':    'gopax',
    'binance':  'binance',
    'okx':      'okx',
    'bybit':    'bybit',
    'bitget':   'bitget',
    'kraken':   'kraken',
    'coinbase': 'gdax',
}

_COINGECKO_BASE = 'https://api.coingecko.com/api/v3'
_TIMEOUT = 15.0


def fetch_exchange_volumes(btc_price_usd: float | None = None) -> list[dict]:
    """CoinGecko /exchanges 에서 거래소 목록을 페이지 순회하며 24H 거래량 수집.

    Returns:
        list of {exchange, volume_24h_btc, volume_24h_usd, trust_score, trust_rank}
    """
    target_cg_ids = set(COINGECKO_IDS.values())
    reverse = {v: k for k, v in COINGECKO_IDS.items()}
    collected: dict[str, dict] = {}

    try:
        with httpx.Client(timeout=_TIMEOUT) as client:
            for page in range(1, 5):  # 최대 4페이지(400개)까지만 조회
                resp = client.get(
                    f'{_COINGECKO_BASE}/exchanges',
                    params={'per_page': 100, 'page': page},
                    headers={'Accept': 'application/json'},
                )
                resp.raise_for_status()
                data: list[dict] = resp.json()
                if not data:
                    break

                for ex in data:
                    cg_id = ex.get('id', '')
                    if cg_id not in target_cg_ids:
                        continue
                    our_id = reverse[cg_id]
                    vol_btc = float(ex.get('trade_volume_24h_btc') or 0)
                    vol_usd = round(vol_btc * btc_price_usd) if btc_price_usd and vol_btc else None
                    collected[our_id] = {
                        'exchange': our_id,
                        'volume_24h_btc': round(vol_btc, 2),
                        'volume_24h_usd': vol_usd,
                        'trust_score': ex.get('trust_score'),
                        'trust_rank': ex.get('trust_score_rank'),
                    }

                if len(collected) >= len(target_cg_ids) or len(data) < 100:
                    break

    except Exception as exc:
        logger.warning('CoinGecko 거래량 조회 실패: %s', exc)

    return list(collected.values())
