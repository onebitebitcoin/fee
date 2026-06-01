"""Bitcoin mempool 혼잡도 및 권장 수수료 조회.

출처: mempool.space 공개 API
"""
from __future__ import annotations
import logging
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta

import httpx

logger = logging.getLogger(__name__)

_MEMPOOL_FEES_URL = 'https://mempool.space/api/v1/fees/recommended'
_MEMPOOL_BLOCKS_URL = 'https://mempool.space/api/v1/fees/mempool-blocks'

# 일반 BTC 출금 트랜잭션 크기 (1 input 1 output SegWit 기준)
_TX_VBYTES = 141

KST = timezone(timedelta(hours=9))


@dataclass
class MempoolFees:
    fastest_sat_vb: int       # ~10분 이내 체결
    half_hour_sat_vb: int     # ~30분
    hour_sat_vb: int          # ~1시간
    economy_sat_vb: int       # 저렴, 수 시간
    minimum_sat_vb: int       # 최저

    # 현재 거래소 출금 수수료와 비교
    congestion_level: str     # LOW / MEDIUM / HIGH / EXTREME
    congestion_emoji: str

    # 계산값
    fastest_fee_sats: int     # 트랜잭션 총 수수료 (sats)
    economy_fee_sats: int
    fetched_at: str


def _congestion_level(fastest: int) -> tuple[str, str]:
    if fastest <= 5:
        return 'LOW', '🟢'
    if fastest <= 20:
        return 'MEDIUM', '🟡'
    if fastest <= 50:
        return 'HIGH', '🟠'
    return 'EXTREME', '🔴'


def fetch_mempool_fees() -> MempoolFees | None:
    """mempool.space에서 권장 수수료 조회."""
    try:
        with httpx.Client(timeout=5) as client:
            r = client.get(_MEMPOOL_FEES_URL)
            r.raise_for_status()
            d = r.json()

        fastest = int(d.get('fastestFee', 10))
        half = int(d.get('halfHourFee', 5))
        hour = int(d.get('hourFee', 3))
        economy = int(d.get('economyFee', 2))
        minimum = int(d.get('minimumFee', 1))

        level, emoji = _congestion_level(fastest)
        now_kst = datetime.now(KST).strftime('%H:%M KST')

        return MempoolFees(
            fastest_sat_vb=fastest,
            half_hour_sat_vb=half,
            hour_sat_vb=hour,
            economy_sat_vb=economy,
            minimum_sat_vb=minimum,
            congestion_level=level,
            congestion_emoji=emoji,
            fastest_fee_sats=fastest * _TX_VBYTES,
            economy_fee_sats=economy * _TX_VBYTES,
            fetched_at=now_kst,
        )
    except Exception as exc:
        logger.warning('mempool 수수료 조회 실패: %s', exc)
        return None


def mempool_summary_line(fees: MempoolFees, btc_price_krw: int) -> str:
    """텔레그램 표시용 한 줄 요약."""
    fastest_krw = round(fees.fastest_fee_sats * btc_price_krw / 1e8)
    economy_krw = round(fees.economy_fee_sats * btc_price_krw / 1e8)
    return (
        f"<b>BTC 네트워크</b>: {fees.congestion_emoji} {fees.congestion_level} "
        f"| 권장 {fees.fastest_sat_vb} sat/vB ({fees.fastest_fee_sats:,} sats ≈ {fastest_krw:,}원) "
        f"| 절약 {fees.economy_sat_vb} sat/vB ({economy_krw:,}원) "
        f"| 조회 {fees.fetched_at}"
    )


def exchange_fee_vs_mempool(
    exchange_wd_fee_btc: float,
    fees: MempoolFees,
    btc_price_krw: int,
) -> str:
    """거래소 출금 수수료 vs 권장 수수료 비교."""
    wd_sats = round(exchange_wd_fee_btc * 1e8)
    fastest_sats = fees.fastest_fee_sats
    economy_sats = fees.economy_fee_sats

    if wd_sats >= fastest_sats:
        verdict = f'✅ 여유 ({wd_sats:,} sats ≥ 권장 최속 {fastest_sats:,} sats)'
    elif wd_sats >= economy_sats:
        verdict = f'✅ 보통 ({wd_sats:,} sats, 1시간 내 체결 예상)'
    else:
        verdict = (f'⚠️ 낮음 ({wd_sats:,} sats < 절약 {economy_sats:,} sats, '
                   f'지연 가능)')
    return f'      네트워크 수수료: {verdict}'
