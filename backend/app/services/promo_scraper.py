"""동적 프로모션 스크래퍼 — Binance 실시간 수수료 오버라이드 데이터 수집.

전략:
  1. FDUSD/USDT 스프레드  → Binance 공개 API (bookTicker) 실시간 조회
  2. 프로모션 활성 여부   → 알려진 프로모션 레지스트리 + BTCFDUSD 거래량 proxy 검증
     (Binance는 프로모션을 공개 REST API로 노출하지 않음)
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

import httpx

logger = logging.getLogger(__name__)

_BINANCE_BOOK_TICKER_URL = "https://api.binance.com/api/v3/ticker/bookTicker"
_BINANCE_TRADING_DAY_URL = "https://api.binance.com/api/v3/ticker/tradingDay"

# ── 알려진 프로모션 레지스트리 ──────────────────────────────────
# source: https://www.binance.com/en/support/announcement/detail/4856a6d4e4014d4e8a5a29ec5fb44857
# 2026-01-29 업데이트: maker 0% 유지, taker 표준 복귀, 종료일 미정
KNOWN_PROMOTIONS: list[dict] = [
    # ── Binance: BTC/FDUSD maker 0% ────────────────────────────
    # 2026-01-29: maker 0% 유지, taker 표준(0.1%) 복귀, 종료일 미정
    # Ref: https://www.binance.com/en/support/announcement/detail/4856a6d4e4014d4e8a5a29ec5fb44857
    {
        "exchange": "binance",
        "quote_coin": "FDUSD",
        "pairs": ["BTCFDUSD", "BNBFDUSD", "ETHFDUSD", "SOLFDUSD", "XRPFDUSD", "DOGEFDUSD"],
        "maker_fee_pct": 0.0,
        "taker_fee_pct": 0.1,
        "effective_from": "2026-01-29",
        "end_date": None,
        "source_url": "https://www.binance.com/en/support/announcement/detail/4856a6d4e4014d4e8a5a29ec5fb44857",
        "verification_proxy": "BTCFDUSD_volume",
    },
    # ── OKX: BTC/USDT 표준 수수료 (프로모션 없음) ────────────────
    # maker 0.08% / taker 0.10% — stablecoin 페어만 0% (DAI, PYUSD, USDC, USDG)
    # BTC/USDT zero-fee 종료: 해당 없음 (원래 없었음)
    # Ref: https://www.okx.com/help/zero-fee-pairs-changes
    # → 별도 오버라이드 없음. TRADING_FEES 기본값 사용.

    # ── Bybit: BTC/USDT 표준 수수료 (프로모션 없음) ─────────────
    # maker 0.10% / taker 0.10% — EUR 페어만 0%, BTC/USDT 프로모션 없음
    # Ref: https://www.bybit.com/en/announcement-info/fee-rate/
    # → 별도 오버라이드 없음. TRADING_FEES 기본값 사용.

    # ── Coinbase: 고정 고수수료 ──────────────────────────────────
    # maker 0.40% / taker 0.60% — 프로모션 없음
    # → 별도 오버라이드 없음.
]

# 거래소별 프로모션 부재 메모 (정보성)
NO_PROMO_NOTES: dict[str, str] = {
    "okx":      "OKX: BTC/USDT 표준 maker 0.08% / taker 0.10% (stablecoin 페어만 0%)",
    "bybit":    "Bybit: BTC/USDT 표준 0.10% / 0.10% (EUR 페어만 0%, BTC 해당 없음)",
    "coinbase": "Coinbase: maker 0.40% / taker 0.60% (프로모션 없음)",
    "kraken":   "Kraken: maker 0.16% / taker 0.26% (프로모션 없음)",
    "bitget":   "Bitget: maker 0.10% / taker 0.10% (BTC/USDT 프로모션 미확인)",
}

# 24h 거래량이 이 BTC 이하면 시장 비활성(프로모션 종료 가능성) 경고
_MIN_ACTIVE_VOLUME_BTC = 1.0


@dataclass(frozen=True)
class FeeOverride:
    exchange: str
    quote_coin: str
    order_type: str      # "maker" | "taker" | "all"
    fee_pct: float
    source: str
    confirmed: bool


@dataclass(frozen=True)
class ConvertSpread:
    from_coin: str
    to_coin: str
    spread_pct: float
    bid_price: float
    ask_price: float
    source: str


@dataclass
class SourceDetail:
    label: str        # 표시 이름 (예: "FDUSD maker 수수료")
    value: str        # 값 (예: "0%")
    source: str       # 출처 설명 (예: "Binance 공지 2026-01-29")
    url: str = ""     # 참조 URL


@dataclass
class PromoContext:
    fee_overrides: list[FeeOverride] = field(default_factory=list)
    convert_spreads: list[ConvertSpread] = field(default_factory=list)
    source_details: list[SourceDetail] = field(default_factory=list)
    fetched_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def get_global_taker(self, exchange: str, quote_coin: str) -> float | None:
        for o in self.fee_overrides:
            if o.exchange == exchange and o.quote_coin == quote_coin and o.order_type in ("taker", "all") and o.confirmed:
                return o.fee_pct / 100
        return None

    def get_global_maker(self, exchange: str, quote_coin: str) -> float | None:
        for o in self.fee_overrides:
            if o.exchange == exchange and o.quote_coin == quote_coin and o.order_type in ("maker", "all") and o.confirmed:
                return o.fee_pct / 100
        return None

    def get_convert_spread(self, from_coin: str, to_coin: str) -> float | None:
        for s in self.convert_spreads:
            if s.from_coin == from_coin and s.to_coin == to_coin:
                return s.spread_pct
        return None


def _fetch_fdusd_usdt_spread(client: httpx.Client) -> ConvertSpread | None:
    """Binance bookTicker로 FDUSD/USDT 실시간 스프레드 조회."""
    try:
        resp = client.get(_BINANCE_BOOK_TICKER_URL, params={"symbol": "FDUSDUSDT"}, timeout=5)
        resp.raise_for_status()
        d = resp.json()
        bid = float(d["bidPrice"])
        ask = float(d["askPrice"])
        mid = (bid + ask) / 2
        spread_pct = (ask - bid) / mid if mid > 0 else 0.0
        logger.info("FDUSD/USDT spread: bid=%.5f ask=%.5f spread=%.5f%%", bid, ask, spread_pct * 100)
        return ConvertSpread(
            from_coin="USDT",
            to_coin="FDUSD",
            spread_pct=round(spread_pct, 6),
            bid_price=bid,
            ask_price=ask,
            source="binance_book_ticker_live",
        )
    except Exception as exc:
        logger.warning("FDUSD/USDT 스프레드 조회 실패: %s", exc)
        return None


def _verify_promo_via_volume(client: httpx.Client, symbol: str) -> tuple[bool, str]:
    """BTCFDUSD 거래량으로 프로모션 활성 여부 proxy 검증."""
    try:
        resp = client.get(_BINANCE_TRADING_DAY_URL, params={"symbol": symbol}, timeout=5)
        resp.raise_for_status()
        d = resp.json()
        volume = float(d.get("volume", 0))
        logger.info("%s 24h volume: %.4f BTC", symbol, volume)
        if volume < _MIN_ACTIVE_VOLUME_BTC:
            return False, f"{symbol} 거래량 낮음 ({volume:.4f} BTC) — 프로모션 종료 가능성"
        return True, f"{symbol} 거래 활성 확인 (volume={volume:.2f} BTC)"
    except Exception as exc:
        logger.warning("%s 거래량 조회 실패: %s", symbol, exc)
        return True, f"{symbol} 거래량 조회 실패 → 활성으로 간주"


def _is_promo_expired(promo: dict) -> bool:
    """end_date가 지났으면 True."""
    end = promo.get("end_date")
    if end is None:
        return False
    try:
        end_dt = datetime.fromisoformat(end).replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc) > end_dt
    except Exception:
        return False


def fetch_promo_context() -> PromoContext:
    """전체 프로모션 컨텍스트 실시간 수집."""
    ctx = PromoContext()

    with httpx.Client() as client:
        # 1. FDUSD/USDT 실시간 스프레드
        spread = _fetch_fdusd_usdt_spread(client)
        if spread:
            ctx.convert_spreads.append(spread)
            ctx.source_details.append(SourceDetail(
                label="USDT→FDUSD 전환 스프레드",
                value=f"{spread.spread_pct * 100:.4f}% (bid={spread.bid_price} / ask={spread.ask_price})",
                source="Binance 실시간 호가창 (bookTicker API)",
                url="https://api.binance.com/api/v3/ticker/bookTicker?symbol=FDUSDUSDT",
            ))
        else:
            ctx.convert_spreads.append(ConvertSpread(
                from_coin="USDT", to_coin="FDUSD",
                spread_pct=0.0005, bid_price=0.9997, ask_price=1.0003,
                source="fallback_default_0.05pct",
            ))
            ctx.source_details.append(SourceDetail(
                label="USDT→FDUSD 전환 스프레드",
                value="0.05% (fallback)",
                source="API 조회 실패 — 기본값 사용",
            ))
            ctx.errors.append("FDUSD/USDT 스프레드 실시간 조회 실패 → fallback 0.05%")

        # 2. 알려진 프로모션 레지스트리 순회 + 활성 검증
        for promo in KNOWN_PROMOTIONS:
            exchange = promo["exchange"]
            quote_coin = promo["quote_coin"]
            maker_fee = promo["maker_fee_pct"]
            taker_fee = promo["taker_fee_pct"]

            # 종료일 경과 여부
            if _is_promo_expired(promo):
                ctx.warnings.append(
                    f"{exchange} {quote_coin} 프로모션 종료일({promo['end_date']}) 경과"
                )
                continue

            # proxy 검증 (거래량)
            proxy = promo.get("verification_proxy", "")
            if proxy.endswith("_volume"):
                symbol = proxy.replace("_volume", "")
                active, reason = _verify_promo_via_volume(client, symbol)
            else:
                active, reason = True, "proxy 없음 → 활성 간주"

            confirmed = active
            source = (
                f"known_promo+volume_verified({reason})"
                if active
                else f"known_promo+volume_warning({reason})"
            )
            if not active:
                ctx.warnings.append(reason)

            ctx.fee_overrides.append(FeeOverride(
                exchange=exchange, quote_coin=quote_coin,
                order_type="maker", fee_pct=maker_fee,
                source=source, confirmed=confirmed,
            ))
            ctx.fee_overrides.append(FeeOverride(
                exchange=exchange, quote_coin=quote_coin,
                order_type="taker", fee_pct=taker_fee,
                source="binance_standard_taker", confirmed=True,
            ))

            # 출처 상세 기록
            effective_from = promo.get("effective_from", "알 수 없음")
            end_date = promo.get("end_date") or "미정"
            pairs_str = ", ".join(promo.get("pairs", []))
            ctx.source_details.append(SourceDetail(
                label="BTC/FDUSD maker 수수료",
                value=f"{maker_fee}% (taker: {taker_fee}%)",
                source=f"Binance 공지 (적용일: {effective_from} / 종료일: {end_date}) — BTCFDUSD 24h 거래량으로 활성 검증",
                url=promo.get("source_url", ""),
            ))
            ctx.source_details.append(SourceDetail(
                label="대상 페어",
                value=pairs_str,
                source="Binance 공지 원문",
                url=promo.get("source_url", ""),
            ))

            logger.info(
                "프로모션 적용: %s %s maker=%.2f%% taker=%.2f%% confirmed=%s",
                exchange, quote_coin, maker_fee, taker_fee, confirmed,
            )

    logger.info(
        "PromoContext 완료: overrides=%d spreads=%d errors=%d warnings=%d",
        len(ctx.fee_overrides), len(ctx.convert_spreads),
        len(ctx.errors), len(ctx.warnings),
    )
    return ctx
