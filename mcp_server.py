#!/usr/bin/env python3
"""
Exchange Fee MCP Server
Binance, OKX, Coinbase, Kraken, Bitget + Upbit, Bithumb, Korbit, Coinone, Gopax
실시간 BTC/USDT 시세 및 네트워크별 출금 수수료를 MCP 도구로 제공
"""

import os
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

from fastmcp import FastMCP

# fee_checker.py의 함수들을 재사용
sys.path.insert(0, os.path.dirname(__file__))

from backend.app.services.lightning_scraper import get_all_lightning_swap_fees  # noqa: E402

from fee_checker import (  # noqa: E402
    ALL_EXCHANGES,
    GROUPS,
    TRADING_FEES,
    check_maintenance_status,
    fetch_binance_perp,
    fetch_binance_spot,
    fetch_binance_withdrawal,
    fetch_bitget,
    fetch_bitget_withdrawal,
    fetch_bithumb,
    fetch_bithumb_withdrawal,
    fetch_coinbase,
    fetch_coinone,
    fetch_gopax,
    fetch_gopax_withdrawal,
    fetch_korbit,
    fetch_kraken,
    fetch_okx_perp,
    fetch_okx_spot,
    fetch_okx_withdrawal,
    fetch_upbit,
    fetch_usd_krw_rate,
    get_scraped_withdrawal,
)

get_static_withdrawal = get_scraped_withdrawal

mcp = FastMCP(
    name="exchange-fee",
    instructions=(
        "한국/글로벌 암호화폐 거래소의 BTC/USDT 실시간 시세와 "
        "네트워크별 출금 수수료를 조회하는 도구입니다."
    ),
)

# ─── 내부 헬퍼 ────────────────────────────────────────────────

KOREA_FETCHERS = {
    "upbit":   fetch_upbit,
    "bithumb": fetch_bithumb,
    "korbit":  fetch_korbit,
    "coinone": fetch_coinone,
    "gopax":   fetch_gopax,
}

GLOBAL_FETCHERS = {
    "binance":  {"spot": fetch_binance_spot, "perpetual": fetch_binance_perp},
    "okx":      {"spot": fetch_okx_spot,     "perpetual": fetch_okx_perp},
    "coinbase": {"spot": fetch_coinbase},
    "kraken":   {"spot": fetch_kraken},
    "bitget":   {"spot": fetch_bitget},
}

WITHDRAWAL_FETCHERS = {
    "bithumb":  fetch_bithumb_withdrawal,
    "binance":  fetch_binance_withdrawal,
    "okx":      fetch_okx_withdrawal,
    "gopax":    fetch_gopax_withdrawal,
    "bitget":   fetch_bitget_withdrawal,
}


def _get_ticker_data(exchange: str) -> dict:
    """거래소별 티커 데이터 반환 (내부용)"""
    if exchange in KOREA_FETCHERS:
        ticker = KOREA_FETCHERS[exchange]()
        fees = TRADING_FEES[exchange]
        return {
            "exchange": exchange,
            "pair": f"BTC/{ticker.get('currency', 'KRW')}",
            "market_type": "spot",
            "price": ticker["price"],
            "high_24h": ticker.get("high"),
            "low_24h": ticker.get("low"),
            "volume_24h_btc": ticker.get("volume"),
            "currency": ticker.get("currency", "KRW"),
            "maker_fee_pct": fees["maker"] * 100,
            "taker_fee_pct": fees["taker"] * 100,
        }
    elif exchange in GLOBAL_FETCHERS:
        results = []
        for mtype, fn in GLOBAL_FETCHERS[exchange].items():
            ticker = fn()
            fees_entry = TRADING_FEES[exchange]
            if isinstance(fees_entry.get("spot"), dict):
                fees = fees_entry[mtype]
            else:
                fees = fees_entry
            results.append({
                "exchange": exchange,
                "pair": f"BTC/{ticker.get('currency', 'USD')}",
                "market_type": mtype,
                "price": ticker["price"],
                "high_24h": ticker.get("high"),
                "low_24h": ticker.get("low"),
                "volume_24h_btc": ticker.get("volume"),
                "currency": ticker.get("currency", "USD"),
                "maker_fee_pct": fees["maker"] * 100,
                "taker_fee_pct": fees["taker"] * 100,
            })
        return results[0] if len(results) == 1 else results
    else:
        raise ValueError(f"알 수 없는 거래소: {exchange}")


def _enrich_ticker_fees(data: dict, usd_krw_rate: float) -> None:
    """ticker 응답에 maker/taker 설명과 USD/KRW 수수료 금액을 추가한다."""
    price = data.get("price", 0)
    currency = data.get("currency", "USD")
    price_usd = price / usd_krw_rate if currency == "KRW" else price

    maker_usd = round(price_usd * data.get("maker_fee_pct", 0) / 100, 2)
    taker_usd = round(price_usd * data.get("taker_fee_pct", 0) / 100, 2)

    data["maker_role"] = "지정가 매도 (Limit Sell)"
    data["taker_role"] = "시장가 매수 (Market Buy)"
    data["maker_fee_usd"] = maker_usd
    data["maker_fee_krw"] = round(maker_usd * usd_krw_rate)
    data["taker_fee_usd"] = taker_usd
    data["taker_fee_krw"] = round(taker_usd * usd_krw_rate)
    data["usd_krw_rate"] = round(usd_krw_rate)


def _get_withdrawal_data(exchange: str, coin: str) -> list:
    """거래소별 출금 수수료 반환 (내부용)"""
    coin = coin.upper()
    if exchange in WITHDRAWAL_FETCHERS:
        return WITHDRAWAL_FETCHERS[exchange](coin)
    else:
        return get_static_withdrawal(exchange, coin)


# ══════════════════════════════════════════════════════════════
# MCP 도구 정의
# ══════════════════════════════════════════════════════════════

@mcp.tool()
def list_exchanges() -> dict:
    """
    사용 가능한 거래소 목록을 반환합니다.

    Returns:
        한국 거래소 목록과 글로벌 거래소 목록
    """
    return {
        "korea": GROUPS["korea"],
        "global": GROUPS["global"],
        "all": ALL_EXCHANGES,
        "total": len(ALL_EXCHANGES),
    }


@mcp.tool()
def get_ticker(exchange: str) -> dict:
    """
    특정 거래소의 BTC 실시간 시세를 조회합니다.

    Args:
        exchange: 거래소 이름 (upbit, bithumb, korbit, coinone, gopax,
                  binance, okx, coinbase, kraken, bitget)

    Returns:
        가격, 24h 고/저/거래량, 거래 수수료 정보
    """
    exchange = exchange.lower()
    if exchange not in ALL_EXCHANGES:
        return {"error": f"지원하지 않는 거래소: {exchange}. list_exchanges()로 목록 확인"}
    try:
        data = _get_ticker_data(exchange)
        usd_krw_rate = fetch_usd_krw_rate()
        if isinstance(data, list):
            for item in data:
                _enrich_ticker_fees(item, usd_krw_rate)
            return {"markets": data}
        else:
            _enrich_ticker_fees(data, usd_krw_rate)
            return data
    except Exception as e:
        return {"error": str(e), "exchange": exchange}


@mcp.tool()
def get_withdrawal_fees(exchange: str, coin: str = "BTC") -> dict:
    """
    특정 거래소의 BTC 또는 USDT 네트워크별 출금 수수료를 조회합니다.

    Args:
        exchange: 거래소 이름 (upbit, bithumb, korbit, coinone, gopax,
                  binance, okx, coinbase, kraken, bitget)
        coin: 코인 종류 ("BTC" 또는 "USDT", 기본값: "BTC")

    Returns:
        네트워크별 출금 수수료 목록
    """
    exchange = exchange.lower()
    coin = coin.upper()
    if exchange not in ALL_EXCHANGES:
        return {"error": f"지원하지 않는 거래소: {exchange}"}
    if coin not in ("BTC", "USDT"):
        return {"error": "coin은 'BTC' 또는 'USDT'만 지원합니다"}
    try:
        networks = _get_withdrawal_data(exchange, coin)
        result = {
            "exchange": exchange,
            "coin": coin,
            "source": "realtime_api" if exchange in WITHDRAWAL_FETCHERS else "scraped_page",
            "networks": networks,
        }
        if coin == "BTC":
            try:
                btc_price_usd = fetch_kraken()["price"]
                usd_krw_rate = fetch_usd_krw_rate()
                for net in networks:
                    fee = net.get("fee")
                    if fee is not None:
                        fee_usd = round(fee * btc_price_usd, 2)
                        net["fee_usd"] = fee_usd
                        net["fee_krw"] = round(fee_usd * usd_krw_rate)
                    else:
                        net["fee_usd"] = None
                        net["fee_krw"] = None
                result["btc_price_usd"] = btc_price_usd
                result["usd_krw_rate"] = round(usd_krw_rate)
            except Exception:
                pass
        elif coin == "USDT":
            try:
                usd_krw_rate = fetch_usd_krw_rate()
                for net in networks:
                    fee = net.get("fee")
                    if fee is not None:
                        net["fee_usd"] = round(fee, 4)
                        net["fee_krw"] = round(fee * usd_krw_rate)
                    else:
                        net["fee_usd"] = None
                        net["fee_krw"] = None
                result["usd_krw_rate"] = round(usd_krw_rate)
            except Exception:
                pass
        return result
    except Exception as e:
        return {"error": str(e), "exchange": exchange, "coin": coin}


@mcp.tool()
def compare_btc_prices(exchanges: str = "all") -> dict:
    """
    여러 거래소의 BTC 가격을 비교합니다.

    Args:
        exchanges: 비교할 거래소 그룹 ("all", "korea", "global") 또는
                   콤마로 구분된 거래소 목록 (예: "upbit,binance,kraken")

    Returns:
        거래소별 BTC 가격 비교 및 최저/최고가 정보
    """
    if exchanges == "all":
        targets = ALL_EXCHANGES
    elif exchanges in GROUPS:
        targets = GROUPS[exchanges]
    else:
        targets = [e.strip().lower() for e in exchanges.split(",")]
        invalid = [e for e in targets if e not in ALL_EXCHANGES]
        if invalid:
            return {"error": f"지원하지 않는 거래소: {invalid}"}

    results = []
    errors = []
    for exchange in targets:
        try:
            data = _get_ticker_data(exchange)
            # 배열인 경우 (binance, okx) spot만 취함
            if isinstance(data, list):
                data = next((d for d in data if d["market_type"] == "spot"), data[0])
            results.append({
                "exchange": exchange,
                "price": data["price"],
                "currency": data["currency"],
                "pair": data["pair"],
            })
        except Exception as e:
            errors.append({"exchange": exchange, "error": str(e)})

    # KRW와 USD 분리
    krw_results = sorted([r for r in results if r["currency"] == "KRW"],
                         key=lambda x: x["price"])
    usd_results = sorted([r for r in results if r["currency"] == "USD"],
                         key=lambda x: x["price"])

    summary = {"results": results, "errors": errors}
    if krw_results:
        summary["krw"] = {
            "lowest":  krw_results[0],
            "highest": krw_results[-1],
            "spread_krw": krw_results[-1]["price"] - krw_results[0]["price"],
        }
    if usd_results:
        summary["usd"] = {
            "lowest":  usd_results[0],
            "highest": usd_results[-1],
            "spread_usd": round(usd_results[-1]["price"] - usd_results[0]["price"], 2),
        }
    return summary


@mcp.tool()
def get_exchange_summary(exchange: str) -> dict:
    """
    특정 거래소의 전체 정보를 한 번에 조회합니다.
    (시세 + 거래 수수료 + BTC 출금 수수료 + USDT 출금 수수료)

    Args:
        exchange: 거래소 이름

    Returns:
        시세, 거래 수수료, 출금 수수료 통합 정보
    """
    exchange = exchange.lower()
    if exchange not in ALL_EXCHANGES:
        return {"error": f"지원하지 않는 거래소: {exchange}"}

    result = {"exchange": exchange}

    # 티커
    try:
        result["ticker"] = _get_ticker_data(exchange)
    except Exception as e:
        result["ticker_error"] = str(e)

    # 출금 수수료
    for coin in ["BTC", "USDT"]:
        try:
            result[f"withdrawal_{coin.lower()}"] = _get_withdrawal_data(exchange, coin)
        except Exception as e:
            result[f"withdrawal_{coin.lower()}_error"] = str(e)

    return result


@mcp.tool()
def calculate_btc_purchase_cost(
    amount_krw: int = 1000000,
    korean_exchange: str = "upbit",
    global_exchange: str = "binance",
    transfer_coin: str = "BTC",
    network: str = "",
) -> dict:
    """
    한국 거래소에서 BTC를 매수하고 글로벌 지갑으로 출금할 때의 총비용을 계산합니다.
    김치 프리미엄(한국-글로벌 가격 차이)도 함께 계산합니다. 모든 금액은 KRW 기준.

    Args:
        amount_krw: 투자 금액 (KRW, 기본값: 1,000,000원)
        korean_exchange: 한국 거래소 (upbit, bithumb, korbit, coinone, gopax, 기본값: upbit)
        global_exchange: 글로벌 거래소 (binance, okx, coinbase, kraken, bitget, 기본값: binance)
        transfer_coin: 전송 코인 ("BTC" 또는 "USDT", 기본값: BTC)
        network: 출금 네트워크 (BTC경로: "Bitcoin"/"Lightning Network",
                 USDT경로: "TRC20"/"ERC20", 비어있으면 기본 네트워크 자동 선택)

    Returns:
        김치 프리미엄, 비용 항목별 KRW 금액, 최종 수령 BTC 수량, 실효 BTC 단가
    """
    korean_exchange = korean_exchange.lower()
    global_exchange = global_exchange.lower()
    transfer_coin = transfer_coin.upper()

    if korean_exchange not in GROUPS["korea"]:
        return {"error": f"지원하지 않는 한국 거래소: {korean_exchange}. {GROUPS['korea']} 중 선택"}
    if global_exchange not in GROUPS["global"]:
        return {"error": f"지원하지 않는 글로벌 거래소: {global_exchange}. {GROUPS['global']} 중 선택"}
    if transfer_coin not in ("BTC", "USDT"):
        return {"error": "transfer_coin은 'BTC' 또는 'USDT'만 지원합니다"}

    try:
        # ── 1. 시세 및 환율 조회 ─────────────────────────────────
        usd_krw_rate = fetch_usd_krw_rate()
        korean_btc_price_krw = float(KOREA_FETCHERS[korean_exchange]()["price"])

        # 글로벌 거래소 BTC USD 가격
        global_fetcher = GLOBAL_FETCHERS[global_exchange]
        if isinstance(global_fetcher, dict):
            global_btc_price_usd = float(global_fetcher["spot"]()["price"])
        else:
            global_btc_price_usd = float(global_fetcher()["price"])
        global_btc_price_krw = round(global_btc_price_usd * usd_krw_rate)

        # ── 2. 김치 프리미엄 계산 ────────────────────────────────
        kimchi_premium_pct = round(
            (korean_btc_price_krw - global_btc_price_krw) / global_btc_price_krw * 100, 4
        )

        # ── 3. 거래 수수료율 조회 ────────────────────────────────
        korean_fees = TRADING_FEES[korean_exchange]
        korean_taker = korean_fees["taker"]

        global_fees_entry = TRADING_FEES[global_exchange]
        if isinstance(global_fees_entry.get("spot"), dict):
            global_taker = global_fees_entry["spot"]["taker"]
        else:
            global_taker = global_fees_entry["taker"]

        # ── 4. 출금 수수료 조회 ──────────────────────────────────
        withdrawal_networks = _get_withdrawal_data(korean_exchange, transfer_coin)

        # 기본 네트워크 결정
        default_networks = {
            "BTC":  ["Bitcoin", "Bitcoin (On-chain)"],
            "USDT": ["TRC20"],
        }
        chosen_network_label = network.strip() if network.strip() else None

        withdrawal_fee_coin = None
        withdrawal_fee_note = ""
        for net in withdrawal_networks:
            label = net.get("label", "")
            if chosen_network_label:
                if chosen_network_label.lower() not in label.lower():
                    continue
            else:
                if not any(d.lower() in label.lower() for d in default_networks[transfer_coin]):
                    continue
            if net.get("enabled", True) is False:
                continue
            withdrawal_fee_coin = net.get("fee")
            withdrawal_fee_note = net.get("note", label)
            chosen_network_label = label
            break

        if withdrawal_fee_coin is None and chosen_network_label is None:
            # 첫 번째 활성 네트워크 사용
            for net in withdrawal_networks:
                if net.get("enabled", True) is not False and net.get("fee") is not None:
                    withdrawal_fee_coin = net["fee"]
                    chosen_network_label = net["label"]
                    withdrawal_fee_note = net.get("note", chosen_network_label)
                    break

        # ── 5. 경로별 비용 계산 (KRW 기준) ──────────────────────
        if transfer_coin == "BTC":
            # 한국 거래소에서 BTC 매수
            korean_trading_fee_krw = round(amount_krw * korean_taker)
            btc_bought = (amount_krw - korean_trading_fee_krw) / korean_btc_price_krw

            # BTC 출금 수수료
            if withdrawal_fee_coin is not None:
                withdrawal_fee_krw = round(withdrawal_fee_coin * korean_btc_price_krw)
                btc_received = btc_bought - withdrawal_fee_coin
            else:
                withdrawal_fee_krw = None
                btc_received = None

            global_trading_fee_krw = 0

            cost_breakdown = {
                "korean_trading_fee_krw": korean_trading_fee_krw,
                "korean_trading_fee_pct": round(korean_taker * 100, 4),
                "withdrawal_fee_krw": withdrawal_fee_krw,
                "withdrawal_fee_coin": withdrawal_fee_coin,
                "withdrawal_coin": transfer_coin,
                "withdrawal_network": chosen_network_label or "N/A",
                "withdrawal_note": withdrawal_fee_note,
                "global_trading_fee_krw": global_trading_fee_krw,
                "total_fee_krw": (
                    korean_trading_fee_krw + (withdrawal_fee_krw or 0)
                    if withdrawal_fee_krw is not None else None
                ),
            }

        else:  # USDT 경로
            # 한국 거래소에서 USDT 매수 (USDT ≈ usd_krw_rate KRW)
            korean_trading_fee_krw = round(amount_krw * korean_taker)
            usdt_bought = (amount_krw - korean_trading_fee_krw) / usd_krw_rate

            # USDT 출금 수수료 (USDT 단위)
            if withdrawal_fee_coin is not None:
                withdrawal_fee_krw = round(withdrawal_fee_coin * usd_krw_rate)
                usdt_after_withdrawal = usdt_bought - withdrawal_fee_coin
            else:
                withdrawal_fee_krw = None
                usdt_after_withdrawal = usdt_bought

            # 글로벌 거래소에서 USDT → BTC 매수
            if usdt_after_withdrawal is not None:
                global_trading_fee_usdt = usdt_after_withdrawal * global_taker
                global_trading_fee_krw = round(global_trading_fee_usdt * usd_krw_rate)
                usdt_for_btc = usdt_after_withdrawal - global_trading_fee_usdt
                btc_received = usdt_for_btc / global_btc_price_usd
            else:
                global_trading_fee_krw = None
                btc_received = None

            cost_breakdown = {
                "korean_trading_fee_krw": korean_trading_fee_krw,
                "korean_trading_fee_pct": round(korean_taker * 100, 4),
                "withdrawal_fee_krw": withdrawal_fee_krw,
                "withdrawal_fee_coin": withdrawal_fee_coin,
                "withdrawal_coin": transfer_coin,
                "withdrawal_network": chosen_network_label or "N/A",
                "withdrawal_note": withdrawal_fee_note,
                "global_trading_fee_krw": global_trading_fee_krw,
                "global_trading_fee_pct": round(global_taker * 100, 4),
                "total_fee_krw": (
                    korean_trading_fee_krw
                    + (withdrawal_fee_krw or 0)
                    + (global_trading_fee_krw or 0)
                    if withdrawal_fee_krw is not None and global_trading_fee_krw is not None
                    else None
                ),
            }

        # ── 6. 실효 BTC 단가 ─────────────────────────────────────
        effective_btc_price_krw = (
            round(amount_krw / btc_received) if btc_received and btc_received > 0 else None
        )

        return {
            "amount_krw": amount_krw,
            "korean_exchange": korean_exchange,
            "global_exchange": global_exchange,
            "transfer_coin": transfer_coin,
            "kimchi_premium_pct": kimchi_premium_pct,
            "kimchi_direction": (
                "한국이 글로벌보다 비쌈 (프리미엄)" if kimchi_premium_pct > 0
                else "한국이 글로벌보다 저렴 (역프리미엄)"
            ),
            "korean_btc_price_krw": korean_btc_price_krw,
            "global_btc_price_krw": global_btc_price_krw,
            "global_btc_price_usd": global_btc_price_usd,
            "usd_krw_rate": round(usd_krw_rate),
            "cost_breakdown": cost_breakdown,
            "btc_received": round(btc_received, 8) if btc_received is not None else None,
            "effective_btc_price_krw": effective_btc_price_krw,
            "net_amount_krw": (
                amount_krw - cost_breakdown["total_fee_krw"]
                if cost_breakdown.get("total_fee_krw") is not None else None
            ),
        }

    except Exception as e:
        return {"error": str(e), "korean_exchange": korean_exchange,
                "global_exchange": global_exchange}


@mcp.tool()
def find_cheapest_path(
    amount_krw: int = 1000000,
    global_exchange: str = "binance",
) -> dict:
    """
    모든 한국 거래소 × 모든 출금 코인(BTC/USDT) × 모든 네트워크를 병렬 탐색하여
    개인지갑 최종 도달 기준 최저비용 경로를 찾습니다.

    경로 유형:
      - BTC 직접: 한국 거래소에서 BTC 매수 → BTC 온체인 출금 → 개인지갑 도착
      - USDT 경유 (온체인): 한국 USDT 매수 → 출금 → 글로벌 거래소 BTC 매수 → 온체인 출금 → 개인지갑
      - USDT 경유 (라이트닝): 한국 USDT 매수 → 출금 → 글로벌 거래소 BTC 매수 → Lightning 출금 → 개인지갑

    모든 경로의 total_fee_krw는 개인지갑 도달까지의 총비용입니다.

    Args:
        amount_krw: 투자 금액 (KRW, 기본값: 1,000,000원)
        global_exchange: 경유 글로벌 거래소 (binance, okx, coinbase, kraken, bitget)

    Returns:
        전체 경로 비교 결과 및 최적 경로 TOP 5 (총수수료 오름차순)
    """
    global_exchange = global_exchange.lower()
    if global_exchange not in GROUPS["global"]:
        return {"error": f"지원하지 않는 글로벌 거래소: {global_exchange}. {GROUPS['global']} 중 선택"}

    try:
        # ── 1. 병렬로 모든 데이터 수집 ───────────────────────────────
        global_fn = (
            GLOBAL_FETCHERS[global_exchange]["spot"]
            if isinstance(GLOBAL_FETCHERS[global_exchange], dict)
            else GLOBAL_FETCHERS[global_exchange]
        )

        with ThreadPoolExecutor(max_workers=16) as executor:
            fut_rate = executor.submit(fetch_usd_krw_rate)
            fut_global = executor.submit(global_fn)
            fut_tickers = {ex: executor.submit(fn) for ex, fn in KOREA_FETCHERS.items()}
            fut_withdrawals = {
                (ex, coin): executor.submit(_get_withdrawal_data, ex, coin)
                for ex in GROUPS["korea"]
                for coin in ["BTC", "USDT"]
            }
            fut_global_btc_wd = executor.submit(_get_withdrawal_data, global_exchange, "BTC")
            fut_lightning_swaps = executor.submit(get_all_lightning_swap_fees)

        usd_krw_rate = fut_rate.result()
        global_btc_price_usd = float(fut_global.result()["price"])

        global_fees_entry = TRADING_FEES[global_exchange]
        global_taker = (
            global_fees_entry["spot"]["taker"]
            if isinstance(global_fees_entry.get("spot"), dict)
            else global_fees_entry["taker"]
        )

        # ── 0-a. 글로벌 거래소 BTC 출금 수수료 (개인지갑 최종 도달 비용) ─────
        global_onchain_wd_fee_btc: float | None = None
        global_onchain_wd_fee_krw: int = 0
        global_onchain_wd_network_label: str = "Bitcoin"
        global_ln_wd_fee_btc: float | None = None
        global_ln_wd_fee_krw: int = 0
        try:
            global_btc_networks = fut_global_btc_wd.result()
            for _net in global_btc_networks:
                label_lower = (_net.get("label") or "").lower()
                is_bitcoin_native = ("bitcoin" in label_lower or "btc" in label_lower) and "lightning" not in label_lower
                is_non_btc_chain = any(x in label_lower for x in ("bep20", "erc20", "trc20", "solana", "aptos", "sui", "bnb"))
                if _net.get("enabled", True) and _net.get("fee") is not None and is_bitcoin_native and not is_non_btc_chain:
                    if global_onchain_wd_fee_btc is None:
                        global_onchain_wd_fee_btc = _net["fee"]
                        fee_krw_val = _net.get("fee_krw")
                        global_onchain_wd_fee_krw = int(round(fee_krw_val)) if fee_krw_val is not None else round(_net["fee"] * global_btc_price_usd * usd_krw_rate)
                        global_onchain_wd_network_label = _net.get("label", "Bitcoin")
                elif "lightning" in label_lower and _net.get("enabled", True) and _net.get("fee") is not None:
                    if global_ln_wd_fee_btc is None:
                        global_ln_wd_fee_btc = _net["fee"]
                        fee_krw_val = _net.get("fee_krw")
                        global_ln_wd_fee_krw = int(round(fee_krw_val)) if fee_krw_val is not None else round(_net["fee"] * global_btc_price_usd * usd_krw_rate)
        except Exception:
            pass

        # ── 0-b. Lightning 스왑 서비스 (ln_to_onchain) 수수료 조회 ───────
        try:
            lightning_swap_data = fut_lightning_swaps.result()
            ln_to_onchain_swaps = [
                s for s in lightning_swap_data
                if s.get("direction") == "ln_to_onchain"
                and s.get("enabled")
                and s.get("fee_pct") is not None
            ]
        except Exception:
            ln_to_onchain_swaps = []

        # ── 0. 점검 중인 네트워크 조회 ─────────────────────────────────────
        try:
            maintenance_status = check_maintenance_status(list(GROUPS["korea"]))
            maintenance_checked_at = datetime.now().isoformat()
        except Exception:
            maintenance_status = {}
            maintenance_checked_at = None

        def _is_suspended(exchange: str, coin: str, network_label: str) -> str | None:
            """점검 중이면 reason 반환, 아니면 None"""
            for item in maintenance_status.get(exchange, []):
                if (item.get("coin", "").upper() == coin.upper() and
                    item.get("network", "").lower() in network_label.lower()):
                    return item.get("reason", "점검 중")
            return None

        # ── 2. 경로별 비용 계산 ───────────────────────────────────────
        paths = []
        disabled_paths = []

        for ex in GROUPS["korea"]:
            try:
                korean_btc_price_krw = float(fut_tickers[ex].result()["price"])
            except Exception:
                continue

            korean_taker = TRADING_FEES[ex]["taker"]

            # Path A: BTC 직접 출금
            try:
                btc_networks = fut_withdrawals[(ex, "BTC")].result()
                for net in btc_networks:
                    if not net.get("enabled", True) or net.get("fee") is None:
                        continue
                    # 점검 중인 네트워크 건너뜀
                    suspension_reason = _is_suspended(ex, "BTC", net["label"])
                    if suspension_reason:
                        disabled_paths.append({
                            "korean_exchange": ex,
                            "transfer_coin": "BTC",
                            "network": net["label"],
                            "reason": suspension_reason,
                        })
                        continue
                    withdrawal_fee_btc = net["fee"]
                    trading_fee_krw = round(amount_krw * korean_taker)
                    btc_bought = (amount_krw - trading_fee_krw) / korean_btc_price_krw
                    btc_received = btc_bought - withdrawal_fee_btc
                    if btc_received <= 0:
                        continue
                    withdrawal_fee_krw = round(withdrawal_fee_btc * korean_btc_price_krw)
                    total_fee_krw = trading_fee_krw + withdrawal_fee_krw
                    paths.append({
                        "korean_exchange": ex,
                        "transfer_coin": "BTC",
                        "network": net["label"],
                        "btc_received": round(btc_received, 8),
                        "btc_received_usd": round(btc_received * global_btc_price_usd, 2),
                        "total_fee_krw": total_fee_krw,
                        "fee_pct": round(total_fee_krw / amount_krw * 100, 4),
                        "breakdown": {
                            "components": [
                                {
                                    "label": "국내 매수 수수료",
                                    "amount_krw": trading_fee_krw,
                                    "rate_pct": round(korean_taker * 100, 4),
                                    "amount_text": None,
                                },
                                {
                                    "label": "BTC 출금 수수료",
                                    "amount_krw": withdrawal_fee_krw,
                                    "rate_pct": None,
                                    "amount_text": f"{withdrawal_fee_btc} BTC",
                                },
                            ],
                            "total_fee_krw": total_fee_krw,
                        },
                    })
            except Exception:
                pass

            # Path B: USDT 경유 출금
            try:
                usdt_networks = fut_withdrawals[(ex, "USDT")].result()
                for net in usdt_networks:
                    if not net.get("enabled", True) or net.get("fee") is None:
                        continue
                    suspension_reason = _is_suspended(ex, "USDT", net["label"])
                    if suspension_reason:
                        disabled_paths.append({
                            "korean_exchange": ex,
                            "transfer_coin": "USDT",
                            "network": net["label"],
                            "reason": suspension_reason,
                        })
                        continue
                    withdrawal_fee_usdt = net["fee"]
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

                    # 온체인 출금 경로 (글로벌 거래소 → 개인지갑)
                    if global_onchain_wd_fee_btc is not None:
                        btc_received = btc_at_global - global_onchain_wd_fee_btc
                        total_fee_krw = trading_fee_krw + withdrawal_fee_krw + global_trading_fee_krw + global_onchain_wd_fee_krw
                        wd_components = [
                            {"label": "국내 매수 수수료", "amount_krw": trading_fee_krw, "rate_pct": round(korean_taker * 100, 4), "amount_text": None},
                            {"label": "USDT 출금 수수료", "amount_krw": withdrawal_fee_krw, "rate_pct": None, "amount_text": f"{withdrawal_fee_usdt} USDT"},
                            {"label": "해외 BTC 매수 수수료", "amount_krw": global_trading_fee_krw, "rate_pct": round(global_taker * 100, 4), "amount_text": f"{round(global_trading_fee_usdt, 8)} USDT"},
                            {"label": f"해외 BTC 출금 수수료 ({global_exchange})", "amount_krw": global_onchain_wd_fee_krw, "rate_pct": None, "amount_text": f"{global_onchain_wd_fee_btc} BTC"},
                        ]
                    else:
                        btc_received = btc_at_global
                        total_fee_krw = trading_fee_krw + withdrawal_fee_krw + global_trading_fee_krw
                        wd_components = [
                            {"label": "국내 매수 수수료", "amount_krw": trading_fee_krw, "rate_pct": round(korean_taker * 100, 4), "amount_text": None},
                            {"label": "USDT 출금 수수료", "amount_krw": withdrawal_fee_krw, "rate_pct": None, "amount_text": f"{withdrawal_fee_usdt} USDT"},
                            {"label": "해외 BTC 매수 수수료", "amount_krw": global_trading_fee_krw, "rate_pct": round(global_taker * 100, 4), "amount_text": f"{round(global_trading_fee_usdt, 8)} USDT"},
                        ]
                    if btc_received <= 0:
                        continue
                    paths.append({
                        "korean_exchange": ex,
                        "transfer_coin": "USDT",
                        "network": net["label"],
                        "global_exit_mode": "onchain",
                        "global_exit_network": global_onchain_wd_network_label,
                        "btc_received": round(btc_received, 8),
                        "btc_received_usd": round(btc_received * global_btc_price_usd, 2),
                        "total_fee_krw": total_fee_krw,
                        "fee_pct": round(total_fee_krw / amount_krw * 100, 4),
                        "breakdown": {"components": wd_components, "total_fee_krw": total_fee_krw},
                    })

                    # ln_to_onchain 스왑 경로용 Lightning 출금 계산 (개인 온체인 지갑 종착 경로만 유지)
                    if global_ln_wd_fee_btc is not None:
                        btc_received_ln = btc_at_global - global_ln_wd_fee_btc
                        if btc_received_ln > 0:
                            total_fee_krw_ln = trading_fee_krw + withdrawal_fee_krw + global_trading_fee_krw + global_ln_wd_fee_krw

                        # ln_to_onchain 스왑 경로 (글로벌 거래소 Lightning 출금 → 스왑 → 개인 온체인 지갑)
                        for swap in ln_to_onchain_swaps:
                            fee_pct_swap = (swap.get("fee_pct") or 0) / 100
                            fee_fixed_btc = (swap.get("fee_fixed_sat") or 0) / 1e8
                            min_btc = (swap.get("min_amount_sat") or 0) / 1e8
                            max_btc_limit = swap.get("max_amount_sat")
                            max_btc = max_btc_limit / 1e8 if max_btc_limit else float("inf")
                            if btc_received_ln < min_btc or btc_received_ln > max_btc:
                                continue
                            swap_fee_btc = btc_received_ln * fee_pct_swap + fee_fixed_btc
                            btc_received_swap = btc_received_ln - swap_fee_btc
                            if btc_received_swap <= 0:
                                continue
                            swap_fee_krw = round(swap_fee_btc * global_btc_price_usd * usd_krw_rate)
                            total_fee_krw_swap = total_fee_krw_ln + swap_fee_krw
                            paths.append({
                                "korean_exchange": ex,
                                "transfer_coin": "USDT",
                                "network": net["label"],
                                "global_exit_mode": "lightning",
                                "global_exit_network": "Lightning Network",
                                "lightning_exit_provider": swap.get("service_name"),
                                "btc_received": round(btc_received_swap, 8),
                                "btc_received_usd": round(btc_received_swap * global_btc_price_usd, 2),
                                "total_fee_krw": total_fee_krw_swap,
                                "fee_pct": round(total_fee_krw_swap / amount_krw * 100, 4),
                                "breakdown": {
                                    "components": [
                                        {"label": "국내 매수 수수료", "amount_krw": trading_fee_krw, "rate_pct": round(korean_taker * 100, 4), "amount_text": None},
                                        {"label": "USDT 출금 수수료", "amount_krw": withdrawal_fee_krw, "rate_pct": None, "amount_text": f"{withdrawal_fee_usdt} USDT"},
                                        {"label": "해외 BTC 매수 수수료", "amount_krw": global_trading_fee_krw, "rate_pct": round(global_taker * 100, 4), "amount_text": f"{round(global_trading_fee_usdt, 8)} USDT"},
                                        {"label": f"해외 BTC Lightning 출금 수수료 ({global_exchange})", "amount_krw": global_ln_wd_fee_krw, "rate_pct": None, "amount_text": f"{global_ln_wd_fee_btc} BTC"},
                                        {"label": f"Lightning 스왑 수수료 ({swap.get('service_name')})", "amount_krw": swap_fee_krw, "rate_pct": swap.get("fee_pct"), "amount_text": f"{round(swap_fee_btc, 8)} BTC"},
                                    ],
                                    "total_fee_krw": total_fee_krw_swap,
                                },
                            })
            except Exception:
                pass

        # ── 3. 총 수수료 오름차순 정렬 (동률이면 수령 BTC 많은 순) ───
        paths.sort(key=lambda x: (x["total_fee_krw"], -x["btc_received"]))

        return {
            "amount_krw": amount_krw,
            "global_exchange": global_exchange,
            "global_btc_price_usd": global_btc_price_usd,
            "usd_krw_rate": round(usd_krw_rate),
            "total_paths_evaluated": len(paths),
            "best_path": paths[0] if paths else None,
            "top5": paths[:5],
            "all_paths": paths,
            "disabled_paths": disabled_paths,
            "maintenance_checked_at": maintenance_checked_at,
        }

    except Exception as e:
        return {"error": str(e)}


@mcp.tool()
def get_network_status(exchange: str = "all") -> dict:
    """
    한국 거래소의 출금 네트워크 점검/중단 상태를 조회합니다.
    점검 공지를 스크래핑하여 현재 사용 불가능한 네트워크를 감지합니다.

    Args:
        exchange: 거래소 이름 또는 "all" (upbit, bithumb, korbit, coinone, gopax, all)

    Returns:
        거래소별 네트워크 점검 상태. suspended_networks가 비어있으면 정상 운영 중.
    """
    if exchange == "all":
        targets = GROUPS["korea"]
    elif exchange.lower() in GROUPS["korea"]:
        targets = [exchange.lower()]
    else:
        return {"error": f"지원하지 않는 거래소: {exchange}. 한국 거래소만 지원 (upbit, bithumb, korbit, coinone, gopax)"}

    try:
        maintenance = check_maintenance_status(targets)
        checked_at = datetime.now().isoformat()

        result = {}
        for ex in targets:
            suspended = maintenance.get(ex, [])
            result[ex] = {
                "status": "maintenance_detected" if suspended else "ok",
                "suspended_networks": suspended,
                "checked_at": checked_at,
            }

        return {
            "exchanges": result,
            "total_suspended": sum(len(v["suspended_networks"]) for v in result.values()),
            "checked_at": checked_at,
        }
    except Exception as e:
        return {"error": str(e)}


if __name__ == "__main__":
    mcp.run()
