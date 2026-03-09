#!/usr/bin/env python3
"""
Multi-Exchange Fee Checker
Binance, OKX, Coinbase, Kraken, Bitget + Upbit, Bithumb, Korbit, Coinone, Gopax
BTC/USDT 실시간 시세, 거래 수수료, 네트워크별 출금 수수료 조회
"""

import argparse
import asyncio
import json
import os
import sys
import threading
from datetime import datetime, timedelta
from typing import Optional

import requests

# ─── 공통 헤더 ────────────────────────────────────────────────
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
}
TIMEOUT = 10

# ─── 거래 수수료 (기본/표준 등급) ───────────────────────────────
TRADING_FEES = {
    # 한국 거래소
    "upbit":   {"maker": 0.0005, "taker": 0.0005},
    "bithumb": {"maker": 0.0004, "taker": 0.0004},
    "korbit":  {"maker": 0.0015, "taker": 0.0020},
    "coinone": {"maker": 0.0010, "taker": 0.0010},
    "gopax":   {"maker": 0.0010, "taker": 0.0020},
    # 글로벌 거래소
    "binance":  {"spot": {"maker": 0.0010, "taker": 0.0010},
                 "perpetual": {"maker": 0.0002, "taker": 0.0005}},
    "okx":      {"spot": {"maker": 0.0008, "taker": 0.0010},
                 "perpetual": {"maker": 0.0002, "taker": 0.0005}},
    "coinbase": {"maker": 0.0040, "taker": 0.0060},
    "kraken":   {"maker": 0.0016, "taker": 0.0026},
    "bitget":   {"maker": 0.0010, "taker": 0.0010},
}

# ─── 출금 수수료 (문서 기준값 – 공개 API 없는 거래소) ─────────────
# None = 공개 API로 실시간 조회 / str = 안내 메시지
# 마지막 Playwright 스크래핑: 2026-03-09
STATIC_WITHDRAWAL = {
    "upbit": {
        "btc": [
            # 공식 공지 #5311 직접 확인: 0.0008 → 0.0002 BTC (2025-07-10 21:00 KST)
            {"label": "Bitcoin (On-chain)", "fee": 0.0002, "note": "공식 공지 기준 (2025-07-10 인하)"},
            {"label": "USDT (TRC20)",       "fee": None,   "note": "미지원"},
        ],
        "usdt": [
            {"label": "ERC20",  "fee": 10.0, "note": "공식 문서 기준"},
            {"label": "TRC20",  "fee": 1.0,  "note": "공식 문서 기준"},
        ],
    },
    "bithumb": {
        "btc": [
            # feed.bithumb.com 접근 차단 – 2024-05 인하 공지 기준 0.0008 BTC
            {"label": "Bitcoin (On-chain)", "fee": 0.0008, "note": "공식 공지 기준 (2024-05, 최신 확인 권장)"},
        ],
        "usdt": [
            {"label": "ERC20",  "fee": 10.0, "note": "공식 문서 기준"},
            {"label": "TRC20",  "fee": 2.0,  "note": "공식 문서 기준"},
        ],
    },
    "korbit": {
        "btc": [
            # korbit.co.kr FAQ 직접 확인 (업데이트: 2026-02-02)
            {"label": "Bitcoin (On-chain)", "fee": 0.0008, "note": "공식 FAQ 기준 (2026-02-02 확인)"},
        ],
        "usdt": [
            {"label": "ERC20", "fee": None, "note": "미지원"},
        ],
    },
    "coinone": {
        "btc": [
            # coinone.co.kr/support/fee-guide 직접 확인 + 공지 #3588 (2024-11-28 인하)
            {"label": "Bitcoin (On-chain)", "fee": 0.0008, "note": "공식 수수료 안내 기준 (2024-11-28 인하)"},
        ],
        "usdt": [
            {"label": "ERC20", "fee": 10.0, "note": "공식 문서 기준"},
            {"label": "TRC20", "fee": 3.0,  "note": "공식 문서 기준"},
        ],
    },
    "kraken": {
        "btc": [
            # bitdegree.org Playwright 스크래핑 기준 (2025-12-15 확인)
            {"label": "Bitcoin (On-chain)", "fee": 0.0002,  "note": "스크래핑 기준 (2025-12-15)"},
            {"label": "Lightning Network",  "fee": 0.0001,  "note": "공식 문서 기준"},
        ],
        "usdt": [
            {"label": "ERC20",  "fee": 2.5,  "note": "공식 문서 기준"},
            {"label": "TRC20",  "fee": 2.5,  "note": "공식 문서 기준"},
        ],
    },
    "coinbase": {
        "btc": [
            {"label": "Bitcoin (On-chain)", "fee": None, "note": "네트워크 혼잡도에 따라 동적 결정"},
        ],
        "usdt": [
            {"label": "ERC20",  "fee": None, "note": "네트워크 혼잡도에 따라 동적 결정"},
        ],
    },
}

# ─── 거래소 그룹 ────────────────────────────────────────────────
GROUPS = {
    "korea":  ["upbit", "bithumb", "korbit", "coinone", "gopax"],
    "global": ["binance", "okx", "coinbase", "kraken", "bitget"],
}
ALL_EXCHANGES = GROUPS["korea"] + GROUPS["global"]


# ══════════════════════════════════════════════════════════════
# 티커 fetch 함수
# ══════════════════════════════════════════════════════════════

def _get(url: str, **kwargs) -> requests.Response:
    resp = requests.get(url, headers=HEADERS, timeout=TIMEOUT, **kwargs)
    return resp


def fetch_usd_krw_rate() -> float:
    """USD/KRW 실시간 환율 조회 (open.er-api.com 무료 API)"""
    r = _get("https://open.er-api.com/v6/latest/USD")
    if r.status_code != 200:
        raise ValueError(f"환율 조회 오류: {r.status_code}")
    d = r.json()
    if d.get("result") != "success":
        raise ValueError("환율 조회 실패")
    return float(d["rates"]["KRW"])


def fetch_upbit(symbol: str = "BTC") -> dict:
    market = f"KRW-{symbol}"
    r = _get(f"https://api.upbit.com/v1/ticker?markets={market}")
    if r.status_code != 200:
        raise ValueError(f"Upbit 오류: {r.status_code}")
    d = r.json()[0]
    return {
        "price": float(d["trade_price"]),
        "high":  float(d["high_price"]),
        "low":   float(d["low_price"]),
        "volume": float(d["acc_trade_volume_24h"]),
        "currency": "KRW",
    }


def fetch_bithumb(symbol: str = "BTC") -> dict:
    r = _get(f"https://api.bithumb.com/public/ticker/{symbol}_KRW")
    if r.status_code != 200:
        raise ValueError(f"Bithumb 오류: {r.status_code}")
    d = r.json()
    if d.get("status") != "0000":
        raise ValueError(f"Bithumb 오류: {d.get('message')}")
    data = d["data"]
    return {
        "price":  float(data["closing_price"]),
        "high":   float(data["max_price"]),
        "low":    float(data["min_price"]),
        "volume": float(data["units_traded"]),
        "currency": "KRW",
    }


def fetch_korbit(symbol: str = "BTC") -> dict:
    pair = f"{symbol.lower()}_krw"
    r = _get(f"https://api.korbit.co.kr/v1/ticker/detailed?currency_pair={pair}")
    if r.status_code != 200:
        raise ValueError(f"Korbit 오류: {r.status_code}")
    d = r.json()
    return {
        "price":  float(d["last"]),
        "high":   float(d["high"]),
        "low":    float(d["low"]),
        "volume": float(d["volume"]),
        "currency": "KRW",
    }


def fetch_coinone(symbol: str = "BTC") -> dict:
    r = _get(f"https://api.coinone.co.kr/public/v2/ticker/KRW/{symbol}")
    if r.status_code != 200:
        raise ValueError(f"Coinone 오류: {r.status_code}")
    d = r.json()
    if d.get("result") != "success":
        raise ValueError(f"Coinone 오류: {d.get('errorCode')}")
    data = d["data"]
    return {
        "price":  float(data["close_24h"]),
        "high":   float(data["high_24h"]),
        "low":    float(data["low_24h"]),
        "volume": float(data["volume_24h"]),
        "currency": "KRW",
    }


def fetch_gopax(symbol: str = "BTC") -> dict:
    r = _get(f"https://api.gopax.co.kr/trading-pairs/{symbol}-KRW/ticker")
    if r.status_code != 200:
        raise ValueError(f"Gopax 오류: {r.status_code}")
    d = r.json()
    return {
        "price":  float(d["price"]),
        "high":   None,
        "low":    None,
        "volume": float(d["volume"]),
        "currency": "KRW",
    }


def fetch_binance_spot(symbol: str = "BTC") -> dict:
    r = _get("https://api.binance.com/api/v3/ticker/24hr", params={"symbol": f"{symbol}USDT"})
    if r.status_code != 200:
        raise ValueError(r.json().get("msg", "Binance 오류"))
    d = r.json()
    return {"price": float(d["lastPrice"]), "high": float(d["highPrice"]),
            "low": float(d["lowPrice"]), "volume": float(d["volume"]), "currency": "USD"}


def fetch_binance_perp(symbol: str = "BTC") -> dict:
    r = _get("https://fapi.binance.com/fapi/v1/ticker/24hr", params={"symbol": f"{symbol}USDT"})
    if r.status_code != 200:
        raise ValueError(r.json().get("msg", "Binance Perp 오류"))
    d = r.json()
    return {"price": float(d["lastPrice"]), "high": float(d["highPrice"]),
            "low": float(d["lowPrice"]), "volume": float(d["volume"]), "currency": "USD"}


def fetch_okx_spot() -> dict:
    r = _get("https://www.okx.com/api/v5/market/ticker", params={"instId": "BTC-USDT"})
    d = r.json()
    if d.get("code") != "0":
        raise ValueError(d.get("msg", "OKX 오류"))
    t = d["data"][0]
    return {"price": float(t["last"]), "high": float(t["high24h"]),
            "low": float(t["low24h"]), "volume": float(t["vol24h"]), "currency": "USD"}


def fetch_okx_perp() -> dict:
    r = _get("https://www.okx.com/api/v5/market/ticker", params={"instId": "BTC-USDT-SWAP"})
    d = r.json()
    if d.get("code") != "0":
        raise ValueError(d.get("msg", "OKX Perp 오류"))
    t = d["data"][0]
    return {"price": float(t["last"]), "high": float(t["high24h"]),
            "low": float(t["low24h"]), "volume": float(t["vol24h"]), "currency": "USD"}


def fetch_coinbase() -> dict:
    r = _get("https://api.coinbase.com/api/v3/brokerage/market/products/BTC-USD")
    if r.status_code != 200:
        raise ValueError(f"Coinbase 오류: {r.status_code}")
    d = r.json()
    return {
        "price":  float(d["price"]),
        "high":   None,
        "low":    None,
        "volume": float(d["volume_24h"]),
        "currency": "USD",
    }


def fetch_kraken() -> dict:
    r = _get("https://api.kraken.com/0/public/Ticker?pair=XBTUSD")
    if r.status_code != 200:
        raise ValueError(f"Kraken 오류: {r.status_code}")
    d = r.json()
    if d.get("error"):
        raise ValueError(f"Kraken 오류: {d['error']}")
    t = d["result"]["XXBTZUSD"]
    return {
        "price":  float(t["c"][0]),
        "high":   float(t["h"][1]),
        "low":    float(t["l"][1]),
        "volume": float(t["v"][1]),
        "currency": "USD",
    }


def fetch_bitget() -> dict:
    r = _get("https://api.bitget.com/api/v2/spot/market/tickers?symbol=BTCUSDT")
    if r.status_code != 200:
        raise ValueError(f"Bitget 오류: {r.status_code}")
    d = r.json()
    if d.get("code") != "00000":
        raise ValueError(d.get("msg", "Bitget 오류"))
    t = d["data"][0]
    return {
        "price":  float(t["lastPr"]),
        "high":   float(t["high24h"]),
        "low":    float(t["low24h"]),
        "volume": float(t["baseVolume"]),
        "currency": "USD",
    }


# ══════════════════════════════════════════════════════════════
# 출금 수수료 fetch 함수
# ══════════════════════════════════════════════════════════════

def fetch_binance_withdrawal(coin: str) -> list:
    r = _get("https://www.binance.com/bapi/capital/v1/public/capital/getNetworkCoinAll")
    if not r.json().get("success"):
        raise ValueError("Binance 출금 API 오류")
    for item in r.json()["data"]:
        if item["coin"] == coin:
            return [
                {
                    "label":   net["name"],
                    "fee":     float(net["withdrawFee"]),
                    "min":     float(net["withdrawMin"]),
                    "enabled": net.get("withdrawEnable", False),
                }
                for net in item.get("networkList", [])
            ]
    return []


def fetch_okx_withdrawal(coin: str) -> list:
    r = _get("https://www.okx.com/v2/asset/withdraw/fee-amount-infos")
    for item in r.json().get("data", []):
        if item.get("symbol") == coin:
            result = [
                {"label": name, "fee": float(fee), "min": float(amt), "enabled": True}
                for name, fee, amt in zip(
                    item.get("networkName", []),
                    item.get("minFee", []),
                    item.get("minAmount", []),
                )
            ]
            if coin == "BTC":
                result.append({
                    "label": "Lightning Network",
                    "fee": None,
                    "note": "Invoice 방식 (인증 필요)",
                })
            return result
    return []


def fetch_gopax_withdrawal(coin: str) -> list:
    r = _get("https://api.gopax.co.kr/assets")
    for item in r.json():
        if item["id"] == coin:
            return [{
                "label":   item.get("networkName", coin),
                "fee":     float(item["withdrawalFee"]),
                "min":     float(item["withdrawalAmountMin"]),
                "enabled": True,
            }]
    return []


def fetch_bitget_withdrawal(coin: str) -> list:
    r = _get(f"https://api.bitget.com/api/v2/spot/public/coins?coin={coin}")
    d = r.json()
    if d.get("code") != "00000" or not d.get("data"):
        return []
    result = []
    for chain in d["data"][0].get("chains", []):
        if chain.get("withdrawable") == "true":
            result.append({
                "label":   chain["chain"],
                "fee":     float(chain["withdrawFee"]),
                "min":     float(chain["minWithdrawAmount"]),
                "enabled": True,
            })
    return result


# ══════════════════════════════════════════════════════════════
# Playwright 캐시 기반 출금 수수료 스크래핑 (24h TTL)
# ══════════════════════════════════════════════════════════════

CACHE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".withdrawal_cache.json")
CACHE_TTL_HOURS = 24
# Playwright 스크래핑 가능 거래소 (Bithumb/Coinbase는 Cloudflare 차단 또는 동적 수수료)
SCRAPE_EXCHANGES = {"upbit", "korbit", "coinone", "kraken"}


def _load_cache() -> dict:
    try:
        with open(CACHE_FILE, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"last_updated": None, "fees": {}}


def _save_cache(data: dict) -> None:
    try:
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


def _is_cache_valid(cache: dict) -> bool:
    try:
        lu = cache.get("last_updated")
        if not lu:
            return False
        return datetime.now() - datetime.fromisoformat(lu) < timedelta(hours=CACHE_TTL_HOURS)
    except Exception:
        return False


# ── Playwright 스크래퍼 (async) ──────────────────────────────

async def _pw_scrape_upbit(browser) -> tuple:
    import re
    page = await browser.new_page()
    try:
        await page.goto(
            "https://upbit.com/service_center/notice?id=5311",
            wait_until="domcontentloaded", timeout=20000,
        )
        await page.wait_for_timeout(4000)
        text = await page.inner_text("body")
        m = re.search(r'변경 출금 수수료.*?([\d.]+)\s*BTC', text)
        return ("upbit_btc", float(m.group(1))) if m else ("upbit_btc", None)
    except Exception:
        return ("upbit_btc", None)
    finally:
        await page.close()


async def _pw_scrape_korbit(browser) -> tuple:
    import re
    page = await browser.new_page()
    try:
        await page.goto(
            "https://lightning.korbit.co.kr/faq/list/?article=5SrSC3yggkWhcSL0O1KSz4",
            wait_until="domcontentloaded", timeout=20000,
        )
        await page.wait_for_timeout(5000)
        text = await page.inner_text("body")
        m = re.search(r'BTC\(비트코인\).*?무료\s+([\d.]+)', text, re.DOTALL)
        return ("korbit_btc", float(m.group(1))) if m else ("korbit_btc", None)
    except Exception:
        return ("korbit_btc", None)
    finally:
        await page.close()


async def _pw_scrape_coinone(browser) -> tuple:
    import re
    page = await browser.new_page()
    try:
        await page.goto(
            "https://coinone.co.kr/support/fee-guide",
            wait_until="domcontentloaded", timeout=20000,
        )
        await page.wait_for_timeout(5000)
        text = await page.inner_text("body")
        # 실제 행 형식: "BTC\tBitcoin\t0.00000001\t0 BTC\t0.0001\t0.0008 BTC"
        m = re.search(r'^BTC\tBitcoin\t[\d.]+\t0 BTC\t[\d.]+\t([\d.]+)\s*BTC', text, re.MULTILINE)
        if m:
            return ("coinone_btc", float(m.group(1)))
        return ("coinone_btc", None)
    except Exception:
        return ("coinone_btc", None)
    finally:
        await page.close()


async def _pw_scrape_kraken(browser) -> tuple:
    """Kraken BTC 출금 수수료: 공식 사이트 Cloudflare 차단 → bitdegree 아티클에서 스크래핑"""
    import re
    page = await browser.new_page()
    try:
        await page.goto(
            "https://www.bitdegree.org/crypto/tutorials/kraken-fees",
            wait_until="domcontentloaded", timeout=20000,
        )
        await page.wait_for_timeout(4000)
        text = await page.inner_text("body")
        # "the withdrawal fee is 0.0002 BTC" 형식
        m = re.search(r'withdrawal fee is (0\.0+\d+)\s*BTC', text)
        if m:
            return ("kraken_btc", float(m.group(1)))
        # 폴백: BTC 맥락에서 수수료 숫자 탐색
        m = re.search(r'Bitcoin.{0,120}?(0\.000\d+)', text, re.DOTALL)
        if m:
            return ("kraken_btc", float(m.group(1)))
        return ("kraken_btc", None)
    except Exception:
        return ("kraken_btc", None)
    finally:
        await page.close()


async def _scrape_all_async() -> dict:
    """Playwright로 거래소 BTC 출금 수수료 병렬 스크래핑"""
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        return {}

    fees = {}
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        results = await asyncio.gather(
            _pw_scrape_upbit(browser),
            _pw_scrape_korbit(browser),
            _pw_scrape_coinone(browser),
            _pw_scrape_kraken(browser),
            return_exceptions=True,
        )
        await browser.close()

    for result in results:
        if isinstance(result, tuple) and result[1] is not None:
            fees[result[0]] = result[1]
    return fees


def _run_scraping() -> dict:
    """별도 스레드에서 새 이벤트 루프로 스크래핑 실행 (기존 루프 충돌 방지)"""
    container = {}

    def _run():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            container["fees"] = loop.run_until_complete(_scrape_all_async())
        except Exception:
            container["fees"] = {}
        finally:
            loop.close()

    t = threading.Thread(target=_run, daemon=True)
    t.start()
    t.join(timeout=60)
    return container.get("fees", {})


def refresh_withdrawal_cache() -> dict:
    """Playwright 스크래핑 후 캐시 저장. 성공한 거래소만 갱신."""
    fees = _run_scraping()
    cache = _load_cache()
    cache["fees"].update(fees)
    cache["last_updated"] = datetime.now().isoformat()
    cache["scrape_count"] = len(cache["fees"])
    _save_cache(cache)
    return cache


def _get_cached_btc_fee(exchange: str) -> Optional[float]:
    """캐시에서 BTC 출금 수수료 조회. 만료 시 재스크래핑."""
    if exchange not in SCRAPE_EXCHANGES:
        return None
    cache = _load_cache()
    if not _is_cache_valid(cache):
        cache = refresh_withdrawal_cache()
    return cache.get("fees", {}).get(f"{exchange}_btc")


# ══════════════════════════════════════════════════════════════
# 거래소 점검/출금 중단 상태 감지 (1h TTL)
# ══════════════════════════════════════════════════════════════

MAINTENANCE_CACHE_TTL_HOURS = 1

SUSPENSION_KEYWORDS = [
    "점검", "중단", "차단", "서비스 중지", "입출금 중단", "출금 중단",
    "maintenance", "suspended", "blocked", "temporarily unavailable",
]

COIN_PATTERNS = {
    "USDT": ["usdt", "테더", "tether"],
    "BTC":  ["btc", "bitcoin", "비트코인"],
}

NETWORK_PATTERNS = {
    "TRC20":               ["trc20", "trc-20", "트론", "tron"],
    "ERC20":               ["erc20", "erc-20", "이더리움", "ethereum"],
    "Bitcoin (On-chain)":  ["bitcoin", "온체인", "on-chain", "btc"],
    "Lightning Network":   ["lightning", "라이트닝"],
}


def _detect_suspension(text: str, source_url: str) -> list:
    """텍스트에서 점검/중단 공지를 감지하여 리스트 반환"""
    lower = text.lower()
    has_suspension = any(kw.lower() in lower for kw in SUSPENSION_KEYWORDS)
    if not has_suspension:
        return []

    detected_coins = [coin for coin, pats in COIN_PATTERNS.items() if any(p in lower for p in pats)]
    detected_networks = [net for net, pats in NETWORK_PATTERNS.items() if any(p in lower for p in pats)]

    if not detected_coins and not detected_networks:
        return []

    results = []
    coins = detected_coins or ["UNKNOWN"]
    networks = detected_networks or ["UNKNOWN"]
    for coin in coins:
        for network in networks:
            results.append({
                "coin":       coin,
                "network":    network,
                "status":     "suspended",
                "reason":     text[:200].strip(),
                "source_url": source_url,
                "detected_at": datetime.now().isoformat(),
            })
    return results


async def _pw_check_upbit_maintenance(browser) -> tuple:
    """업비트 공지사항 피드에서 출금 중단 공지 감지"""
    page = await browser.new_page()
    url = "https://upbit.com/service_center/notice"
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=20000)
        await page.wait_for_timeout(3000)
        text = await page.inner_text("body")
        suspended = []
        for line in text.splitlines():
            line_lower = line.lower()
            if any(kw.lower() in line_lower for kw in SUSPENSION_KEYWORDS):
                suspended.extend(_detect_suspension(line, url))
        return ("upbit", suspended)
    except Exception:
        return ("upbit", [])
    finally:
        await page.close()


async def _pw_check_bithumb_maintenance(browser) -> tuple:
    """빗썸 공지사항에서 출금 중단 공지 감지"""
    page = await browser.new_page()
    url = "https://www.bithumb.com/react/support/notice"
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=20000)
        await page.wait_for_timeout(3000)
        text = await page.inner_text("body")
        suspended = []
        for line in text.splitlines():
            line_lower = line.lower()
            if any(kw.lower() in line_lower for kw in SUSPENSION_KEYWORDS):
                suspended.extend(_detect_suspension(line, url))
        return ("bithumb", suspended)
    except Exception:
        return ("bithumb", [])
    finally:
        await page.close()


async def _pw_check_korbit_maintenance(browser) -> tuple:
    """코빗 공지사항에서 출금 중단 공지 감지"""
    page = await browser.new_page()
    url = "https://www.korbit.co.kr/announcement"
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=20000)
        await page.wait_for_timeout(3000)
        text = await page.inner_text("body")
        suspended = []
        for line in text.splitlines():
            line_lower = line.lower()
            if any(kw.lower() in line_lower for kw in SUSPENSION_KEYWORDS):
                suspended.extend(_detect_suspension(line, url))
        return ("korbit", suspended)
    except Exception:
        return ("korbit", [])
    finally:
        await page.close()


async def _pw_check_coinone_maintenance(browser) -> tuple:
    """코인원 공지사항에서 출금 중단 공지 감지"""
    page = await browser.new_page()
    url = "https://coinone.co.kr/support/notice"
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=20000)
        await page.wait_for_timeout(3000)
        text = await page.inner_text("body")
        suspended = []
        for line in text.splitlines():
            line_lower = line.lower()
            if any(kw.lower() in line_lower for kw in SUSPENSION_KEYWORDS):
                suspended.extend(_detect_suspension(line, url))
        return ("coinone", suspended)
    except Exception:
        return ("coinone", [])
    finally:
        await page.close()


async def _scrape_maintenance_async(exchanges: list) -> dict:
    """병렬로 모든 거래소 점검 상태 스크래핑"""
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        return {}

    scraper_map = {
        "upbit":   _pw_check_upbit_maintenance,
        "bithumb": _pw_check_bithumb_maintenance,
        "korbit":  _pw_check_korbit_maintenance,
        "coinone": _pw_check_coinone_maintenance,
    }

    tasks = [scraper_map[ex] for ex in exchanges if ex in scraper_map]
    if not tasks:
        return {}

    results_data = {}
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        results = await asyncio.gather(
            *[fn(browser) for fn in tasks],
            return_exceptions=True,
        )
        await browser.close()

    for result in results:
        if isinstance(result, tuple):
            exchange, suspended = result
            results_data[exchange] = suspended
    return results_data


def _run_maintenance_scraping(exchanges: list) -> dict:
    """별도 스레드에서 새 이벤트 루프로 점검 상태 스크래핑 실행"""
    container = {}

    def _run():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            container["data"] = loop.run_until_complete(
                _scrape_maintenance_async(exchanges)
            )
        except Exception:
            container["data"] = {}
        finally:
            loop.close()

    t = threading.Thread(target=_run, daemon=True)
    t.start()
    t.join(timeout=90)
    return container.get("data", {})


def _is_maintenance_cache_valid(cache: dict) -> bool:
    try:
        checked_at = cache.get("maintenance_checked_at")
        if not checked_at:
            return False
        return datetime.now() - datetime.fromisoformat(checked_at) < timedelta(hours=MAINTENANCE_CACHE_TTL_HOURS)
    except Exception:
        return False


def check_maintenance_status(exchanges=None) -> dict:
    """
    한국 거래소의 출금 네트워크 점검/중단 상태를 조회합니다.
    결과는 1시간 TTL로 캐시됩니다.

    Returns:
        {exchange: [{"coin": "USDT", "network": "TRC20", "status": "suspended",
                     "reason": "...", "source_url": "...", "detected_at": "..."}]}
        점검 중인 네트워크가 없으면 빈 리스트.
    """
    try:
        supported = ["upbit", "bithumb", "korbit", "coinone"]
        if exchanges is None:
            exchanges = supported
        else:
            exchanges = [ex for ex in exchanges if ex in supported]

        if not exchanges:
            return {}

        cache = _load_cache()

        if _is_maintenance_cache_valid(cache):
            cached = cache.get("maintenance", {})
            return {ex: cached.get(ex, []) for ex in exchanges}

        scraped = _run_maintenance_scraping(exchanges)

        existing = cache.get("maintenance", {})
        existing.update(scraped)
        cache["maintenance"] = existing
        cache["maintenance_checked_at"] = datetime.now().isoformat()
        _save_cache(cache)

        return {ex: scraped.get(ex, []) for ex in exchanges}
    except Exception:
        return {}


def get_static_withdrawal(exchange: str, coin: str) -> list:
    """출금 수수료 반환: BTC는 캐시(Playwright) 우선, 만료 시 재스크래핑, fallback은 정적 데이터"""
    coin_lower = coin.lower()

    # BTC + 스크래핑 가능 거래소: 캐시 우선
    if coin_lower == "btc" and exchange in SCRAPE_EXCHANGES:
        cached_fee = _get_cached_btc_fee(exchange)
        if cached_fee is not None:
            last_updated = _load_cache().get("last_updated", "")[:10]
            static_data = STATIC_WITHDRAWAL.get(exchange, {}).get(coin_lower, [])
            result = []
            for item in static_data:
                entry = {"label": item["label"], "enabled": True}
                if item["label"] == "Bitcoin (On-chain)":
                    entry["fee"] = cached_fee
                    entry["min"] = None
                    entry["note"] = f"Playwright 스크래핑 ({last_updated})"
                elif item["fee"] is None:
                    entry["fee"] = None
                    entry["note"] = item.get("note", "N/A")
                else:
                    entry["fee"] = item["fee"]
                    entry["min"] = None
                    entry["note"] = item.get("note", "")
                result.append(entry)
            return result

    # 정적 데이터 fallback
    data = STATIC_WITHDRAWAL.get(exchange, {}).get(coin_lower, [])
    result = []
    for item in data:
        entry = {"label": item["label"], "enabled": True}
        if item["fee"] is None:
            entry["fee"] = None
            entry["note"] = item.get("note", "N/A")
        else:
            entry["fee"] = item["fee"]
            entry["min"] = None
            entry["note"] = item.get("note", "")
        result.append(entry)
    return result


# ══════════════════════════════════════════════════════════════
# 출력 함수
# ══════════════════════════════════════════════════════════════

def _fmt_price(price: Optional[float], currency: str) -> str:
    if price is None:
        return "N/A"
    if currency == "KRW":
        return f"₩{price:>14,.0f}"
    return f"${price:>12,.2f}"


def _fmt_volume(volume: Optional[float], symbol: str) -> str:
    if volume is None:
        return "N/A"
    return f"{volume:>12,.2f} {symbol}"


def print_ticker(exchange: str, label: str, ticker: dict, fees: dict, symbol: str = "BTC") -> None:
    cur = ticker.get("currency", "USD")
    quote = "KRW" if cur == "KRW" else cur
    print(f"\n[{exchange}] {symbol}/{quote} - {label}")
    print(f"  Price     : {_fmt_price(ticker['price'], cur)}")
    print(f"  24h High  : {_fmt_price(ticker.get('high'), cur)}")
    print(f"  24h Low   : {_fmt_price(ticker.get('low'), cur)}")
    print(f"  24h Volume: {_fmt_volume(ticker.get('volume'), symbol)}")
    print(f"  Maker Fee : {fees['maker'] * 100:.4f}% (기본 등급)")
    print(f"  Taker Fee : {fees['taker'] * 100:.4f}% (기본 등급)")


def print_withdrawal(exchange: str, coin: str, networks: list) -> None:
    if not networks:
        print(f"\n[{exchange}] {coin} 출금 수수료: 데이터 없음")
        return
    unit = "KRW" if coin == "KRW" else coin
    print(f"\n[{exchange}] {coin} 네트워크별 출금 수수료")
    for net in networks:
        status = " [출금 중단]" if net.get("enabled") is False else ""
        label = f"{net['label']}{status}"
        if net.get("fee") is None:
            note = net.get("note", "N/A")
            print(f"  {label:<35}: {note}")
        else:
            fee_str = f"{net['fee']:.8f} {unit}" if coin != "USDT" else f"{net['fee']:.4f} USDT"
            min_str = ""
            if net.get("min") is not None:
                min_val = net['min']
                min_str = f"  (최소: {min_val:.8f} {unit})" if coin != "USDT" else f"  (최소: {min_val:.4f} USDT)"
            note = f"  [{net['note']}]" if net.get("note") else ""
            print(f"  {label:<35}: {fee_str}{min_str}{note}")


# ══════════════════════════════════════════════════════════════
# 거래소별 실행 로직
# ══════════════════════════════════════════════════════════════

def run_korea_exchange(name: str, show_withdrawal: bool) -> bool:
    fetchers = {
        "upbit":   fetch_upbit,
        "bithumb": fetch_bithumb,
        "korbit":  fetch_korbit,
        "coinone": fetch_coinone,
        "gopax":   fetch_gopax,
    }
    label_map = {
        "upbit": "Upbit", "bithumb": "Bithumb", "korbit": "Korbit",
        "coinone": "Coinone", "gopax": "Gopax",
    }
    has_error = False
    label = label_map[name]
    fees = TRADING_FEES[name]

    try:
        ticker = fetchers[name]()
        print_ticker(label, "Spot", ticker, fees)
    except Exception as e:
        print(f"\n[{label.upper()}] 티커 오류: {e}", file=sys.stderr)
        has_error = True

    if show_withdrawal:
        # Gopax: 공개 API 사용
        if name == "gopax":
            for coin in ["BTC", "USDT"]:
                try:
                    nets = fetch_gopax_withdrawal(coin)
                    print_withdrawal(label, coin, nets)
                except Exception as e:
                    print(f"\n[{label.upper()}] {coin} 출금 수수료 오류: {e}", file=sys.stderr)
                    has_error = True
        else:
            for coin in ["BTC", "USDT"]:
                nets = get_static_withdrawal(name, coin)
                print_withdrawal(label, coin, nets)

    return has_error


def run_binance(show_withdrawal: bool) -> bool:
    has_error = False
    for mtype, fetcher in [("Spot", fetch_binance_spot), ("Perpetual", fetch_binance_perp)]:
        try:
            ticker = fetcher()
            fees = TRADING_FEES["binance"][mtype.lower()]
            print_ticker("Binance", mtype, ticker, fees)
        except Exception as e:
            print(f"\n[BINANCE] {mtype} 오류: {e}", file=sys.stderr)
            has_error = True

    if show_withdrawal:
        for coin in ["BTC", "USDT"]:
            try:
                nets = fetch_binance_withdrawal(coin)
                print_withdrawal("Binance", coin, nets)
            except Exception as e:
                print(f"\n[BINANCE] {coin} 출금 수수료 오류: {e}", file=sys.stderr)
                has_error = True

    return has_error


def run_okx(show_withdrawal: bool) -> bool:
    has_error = False
    for mtype, fetcher in [("Spot", fetch_okx_spot), ("Perpetual", fetch_okx_perp)]:
        try:
            ticker = fetcher()
            fees = TRADING_FEES["okx"][mtype.lower()]
            print_ticker("OKX", mtype, ticker, fees)
        except Exception as e:
            print(f"\n[OKX] {mtype} 오류: {e}", file=sys.stderr)
            has_error = True

    if show_withdrawal:
        for coin in ["BTC", "USDT"]:
            try:
                nets = fetch_okx_withdrawal(coin)
                print_withdrawal("OKX", coin, nets)
            except Exception as e:
                print(f"\n[OKX] {coin} 출금 수수료 오류: {e}", file=sys.stderr)
                has_error = True

    return has_error


def run_global_exchange(name: str, show_withdrawal: bool) -> bool:
    if name == "binance":
        return run_binance(show_withdrawal)
    if name == "okx":
        return run_okx(show_withdrawal)

    fetchers = {
        "coinbase": (fetch_coinbase, "Coinbase", "BTC-USD"),
        "kraken":   (fetch_kraken,   "Kraken",   "XBT/USD"),
        "bitget":   (fetch_bitget,   "Bitget",   "BTC/USDT"),
    }
    fetcher_fn, label, pair_label = fetchers[name]
    has_error = False
    fees = TRADING_FEES[name]

    try:
        ticker = fetcher_fn()
        print_ticker(label, "Spot", ticker, fees)
    except Exception as e:
        print(f"\n[{label.upper()}] 티커 오류: {e}", file=sys.stderr)
        has_error = True

    if show_withdrawal:
        if name == "bitget":
            for coin in ["BTC", "USDT"]:
                try:
                    nets = fetch_bitget_withdrawal(coin)
                    print_withdrawal(label, coin, nets)
                except Exception as e:
                    print(f"\n[{label.upper()}] {coin} 출금 수수료 오류: {e}", file=sys.stderr)
                    has_error = True
        else:
            for coin in ["BTC", "USDT"]:
                nets = get_static_withdrawal(name, coin)
                print_withdrawal(label, coin, nets)

    return has_error


# ══════════════════════════════════════════════════════════════
# 메인
# ══════════════════════════════════════════════════════════════

def main() -> None:
    valid_exchanges = ALL_EXCHANGES + list(GROUPS.keys())

    parser = argparse.ArgumentParser(
        description="거래소별 BTC/USDT 실시간 시세 및 네트워크별 출금 수수료 조회"
    )
    parser.add_argument(
        "--exchange",
        choices=valid_exchanges,
        default=None,
        metavar="EXCHANGE",
        help=f"거래소 또는 그룹 ({', '.join(valid_exchanges)})",
    )
    parser.add_argument(
        "--group",
        choices=list(GROUPS.keys()),
        default=None,
        help="거래소 그룹 (korea / global)",
    )
    parser.add_argument(
        "--no-withdrawal",
        action="store_true",
        help="출금 수수료 조회 생략",
    )
    args = parser.parse_args()

    # 대상 거래소 결정
    if args.exchange and args.exchange in GROUPS:
        exchanges = GROUPS[args.exchange]
    elif args.exchange:
        exchanges = [args.exchange]
    elif args.group:
        exchanges = GROUPS[args.group]
    else:
        exchanges = ALL_EXCHANGES

    show_withdrawal = not args.no_withdrawal
    has_error = False

    for exchange in exchanges:
        if exchange in GROUPS["korea"]:
            if run_korea_exchange(exchange, show_withdrawal):
                has_error = True
        else:
            if run_global_exchange(exchange, show_withdrawal):
                has_error = True

    print()
    if has_error:
        sys.exit(1)


if __name__ == "__main__":
    main()
