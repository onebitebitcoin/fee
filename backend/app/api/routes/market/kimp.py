"""김치 프리미엄(kimp) 라우터 + 실시간 환율/시세 수집.

테스트가 `market.kimp.KOREA_FETCHERS`/`fetch_binance_spot`/`_fetch_usd_krw_realtime`를
monkeypatch한 뒤 `_fetch_kimp_data()`를 호출하므로, 이 심볼들과 호출부가 같은 모듈에 있어야 한다.
"""
from __future__ import annotations

import asyncio
import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests as _requests
from fastapi import APIRouter, HTTPException

from backend.app.domain.market_core import (
    KOREA_FETCHERS,
    fetch_binance_spot,
    fetch_usd_krw_rate,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# Upbit USDT/KRW 실시간 환율 캐시 (30초 TTL)
_usd_krw_cache: dict = {'rate': None, 'ts': 0.0}
_USD_KRW_CACHE_TTL = 30

# 백그라운드 polling으로 갱신되는 kimp 최신 데이터
_kimp_latest: dict | None = None


def _fetch_usd_krw_realtime() -> float:
    """Upbit USDT/KRW 실시간 환율 조회. 30초 캐시 적용.

    Upbit KRW-USDT 체결가를 USD/KRW 기준값으로 사용한다.
    실패 시 Dunamu API → open.er-api.com fallback.
    """
    now = time.time()
    if _usd_krw_cache['rate'] is not None and now - _usd_krw_cache['ts'] < _USD_KRW_CACHE_TTL:
        return float(_usd_krw_cache['rate'])
    try:
        r = _requests.get(
            'https://api.upbit.com/v1/ticker?markets=KRW-USDT',
            timeout=5,
        )
        r.raise_for_status()
        rate = float(r.json()[0]['trade_price'])
    except Exception:
        rate = float(fetch_usd_krw_rate())
    _usd_krw_cache['rate'] = rate
    _usd_krw_cache['ts'] = now
    return rate


def _current_usdt_krw_rate() -> float | None:
    """USDT 매수 leg에 쓸 한국 USDT/KRW 환율(업비트 USDT 체결가).

    김프 평가와 동일한 환율을 경로 계산에 주입해 "테더/원달러 환율 차이"
    아티팩트를 제거한다. 폴링값 우선, 없으면 실시간 조회. 실패 시 None
    (이 경우 컨텍스트가 포렉스 환율로 폴백).
    """
    if _kimp_latest and _kimp_latest.get('usd_krw_rate'):
        return float(_kimp_latest['usd_krw_rate'])
    try:
        return float(_fetch_usd_krw_realtime())
    except Exception:
        return None


def _fetch_kimp_data() -> dict | None:
    """한국 거래소 + Binance 실시간 호출로 kimp 계산. 실패 시 None 반환.

    환율은 Upbit USDT/KRW 실시간 체결가 기준 (30초 TTL 캐시).
    국내 거래소의 USDT/KRW 실거래가를 기준으로 삼으면 거래소별 USDT 수급 차이(역테더 프리미엄)가
    섞여 들어가 "글로벌 시세 대비 국내 시세 괴리"라는 본래 의미가 흐려지므로 채택하지 않는다.
    """
    def _fetch_korea(exchange: str) -> tuple[str, float | None]:
        try:
            btc_price = float(KOREA_FETCHERS[exchange]()['price'])
        except Exception:
            btc_price = None
        return exchange, btc_price

    def _fetch_global() -> tuple[float | None, float | None, float | None]:
        try:
            btc_usd = float(fetch_binance_spot()['price'])
            usd_krw = _fetch_usd_krw_realtime()  # 업비트 USDT/KRW (김프 환율 기준)
            try:
                forex = float(fetch_usd_krw_rate())  # 두나무 원달러 포렉스
            except Exception:
                forex = None
            return btc_usd, usd_krw, forex
        except Exception:
            return None, None, None

    with ThreadPoolExecutor(max_workers=6) as executor:
        korea_futures = {executor.submit(_fetch_korea, ex): ex for ex in KOREA_FETCHERS}
        global_future = executor.submit(_fetch_global)

        korea_btc_prices: dict[str, float] = {}
        for fut in as_completed(korea_futures):
            ex, btc_price = fut.result()
            if btc_price is not None:
                korea_btc_prices[ex] = btc_price

        btc_usd, usd_krw, forex = global_future.result()

    if btc_usd is None or usd_krw is None or not korea_btc_prices:
        return None

    global_btc_price_krw = btc_usd * usd_krw
    kimp: dict[str, float] = {
        ex: round((price / global_btc_price_krw - 1) * 100, 4)
        for ex, price in korea_btc_prices.items()
    }
    # 원달러 프리미엄 = 업비트 USDT/KRW ÷ 두나무 포렉스 − 1 (테더 프리미엄, 단일 시장값)
    usdt_premium = round((usd_krw / forex - 1) * 100, 4) if forex else None
    # 김치 프리미엄(총) = 한국 BTC(KRW) ÷ (글로벌 BTC(USD) × 두나무 포렉스) − 1
    # = (1 + 비트코인 프리미엄)(1 + 테더 프리미엄) − 1. 포렉스 없으면 계산 불가.
    kimchi_premium_total: dict[str, float] = (
        {ex: round((price / (btc_usd * forex) - 1) * 100, 4) for ex, price in korea_btc_prices.items()}
        if forex else {}
    )
    return {
        'kimp': kimp,
        'kimchi_premium_total': kimchi_premium_total,
        'korean_btc_prices': korea_btc_prices,
        'global_btc_price_krw': round(global_btc_price_krw),
        'usd_krw_rate': round(usd_krw, 2),
        'forex_usd_krw_rate': round(forex, 2) if forex else None,
        'usdt_premium': usdt_premium,
        'fetched_at': int(time.time()),
    }


async def kimp_poll_loop(interval: int = 10) -> None:
    """백그라운드에서 주기적으로 kimp 데이터를 갱신한다."""
    global _kimp_latest
    loop = asyncio.get_event_loop()
    while True:
        try:
            result = await loop.run_in_executor(None, _fetch_kimp_data)
            if result is not None:
                _kimp_latest = result
        except Exception as exc:
            logger.warning('kimp poll failed: %s', exc)
        await asyncio.sleep(interval)


@router.get('/kimp/live')
def get_live_kimp() -> dict:
    """백그라운드 polling으로 갱신된 최신 kimp 데이터 반환."""
    if _kimp_latest is None:
        raise HTTPException(status_code=503, detail='kimp 데이터 수집 중입니다. 잠시 후 다시 시도하세요.')
    return _kimp_latest
