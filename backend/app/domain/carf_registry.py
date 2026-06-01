"""CARF (Crypto-Asset Reporting Framework) 거래소별 적용 현황 레지스트리.

Sources:
  - OECD 2025 Monitoring Update: https://www.oecd.org/content/dam/oecd/en/networks/global-forum-tax-transparency/crypto-asset-reporting-framework-monitoring-implementation-update-2025.pdf
  - OECD Commitments PDF: https://www.oecd.org/content/dam/oecd/en/networks/global-forum-tax-transparency/commitments-carf.pdf
  - Korea implementation: data collection from 2026-01-01, first exchange 2027
  - 2026-01-01부터 거래 데이터 수집 시작, 2027년에 첫 정보 교환
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class JurisdictionCarf:
    country: str
    flag: str
    carf_first_exchange_year: int | None   # None = 미확정/미가입
    carf_status: str                        # "confirmed_2027" | "confirmed_2028" | "unknown"
    note: str = ""


# ── 거래소별 주요 관할권 (CARF 보고 기준 등록 법인 소재) ──────────────
EXCHANGE_JURISDICTIONS: dict[str, JurisdictionCarf] = {
    # 한국 거래소 (source)
    "upbit":   JurisdictionCarf("대한민국", "🇰🇷", 2027, "confirmed_2027",
                                 "52개국 2027 첫 교환 그룹. 2026년부터 데이터 수집."),
    "bithumb": JurisdictionCarf("대한민국", "🇰🇷", 2027, "confirmed_2027",
                                 "52개국 2027 첫 교환 그룹. 2026년부터 데이터 수집."),
    "korbit":  JurisdictionCarf("대한민국", "🇰🇷", 2027, "confirmed_2027",
                                 "52개국 2027 첫 교환 그룹. 2026년부터 데이터 수집."),
    "coinone": JurisdictionCarf("대한민국", "🇰🇷", 2027, "confirmed_2027",
                                 "52개국 2027 첫 교환 그룹. 2026년부터 데이터 수집."),
    "gopax":   JurisdictionCarf("대한민국", "🇰🇷", 2027, "confirmed_2027",
                                 "52개국 2027 첫 교환 그룹. 2026년부터 데이터 수집."),

    # 글로벌 거래소 (dest) — 등록 법인 기준
    "binance": JurisdictionCarf("아랍에미리트 (Abu Dhabi)", "🇦🇪", 2028, "confirmed_2028",
                                 "2025-12-07 Abu Dhabi Global Market(ADGM) 이전 발표, 2026-01-05 운영 시작. "
                                 "등록 법인: Nest Exchange Ltd. (ADGM). UAE는 2028 그룹."),
    "okx":     JurisdictionCarf("세이셸", "🇸🇨", 2028, "confirmed_2028",
                                 "Aux Cayes FinTech Co. Ltd 등록지. 세이셸은 2028 그룹."),
    "coinbase":JurisdictionCarf("미국", "🇺🇸", 2028, "confirmed_2028",
                                 "Coinbase Inc. 미국 법인. 미국은 2028 그룹."),
    "kraken":  JurisdictionCarf("미국", "🇺🇸", 2028, "confirmed_2028",
                                 "Payward Inc. 미국 법인. 미국은 2028 그룹."),
    "bitget":  JurisdictionCarf("세이셸", "🇸🇨", 2028, "confirmed_2028",
                                 "Bitget Limited 등록지. 세이셸은 2028 그룹."),
    "bybit":   JurisdictionCarf("아랍에미리트 / BVI", "🇦🇪", 2028, "confirmed_2028",
                                 "Bybit Fintech Ltd(BVI 등록) + Dubai 운영. UAE·BVI 모두 2028 그룹."),
}


def get_carf_exchange_status(
    source_exchange: str,
    dest_exchange: str,
) -> dict:
    """
    source → dest 경로의 CARF 자동 정보 교환 여부 판단.

    규칙 (사용자 정의):
      - dest CARF 연도 == source CARF 연도  → ✅ 자동 교환 (동시 시작)
      - dest CARF 연도 < source CARF 연도   → ✅ 자동 교환 (dest가 먼저 시작)
      - dest CARF 연도 > source CARF 연도   → ⏳ 미교환 (dest가 아직 미가입)
      - 어느 한쪽 미확정                     → ❓ 불확실
    """
    src = EXCHANGE_JURISDICTIONS.get(source_exchange.lower())
    dst = EXCHANGE_JURISDICTIONS.get(dest_exchange.lower())

    if src is None or dst is None:
        return {
            "status": "unknown",
            "emoji": "❓",
            "label": "CARF 정보 없음",
            "detail": "",
        }

    src_year = src.carf_first_exchange_year
    dst_year = dst.carf_first_exchange_year

    if src_year is None or dst_year is None:
        return {
            "status": "unknown",
            "emoji": "❓",
            "label": "CARF 미확정",
            "detail": f"src={src_year or '?'} / dst={dst_year or '?'}",
            "src": src,
            "dst": dst,
        }

    if dst_year <= src_year:
        return {
            "status": "auto_exchange",
            "emoji": "🔴",
            "label": f"자동 교환 ({src_year}~)",
            "detail": (
                f"{src.flag} {src.country}({src_year}) ↔ {dst.flag} {dst.country}({dst_year}) "
                f"— {'동시 시작' if dst_year == src_year else 'dest가 먼저 시작'}"
            ),
            "src": src,
            "dst": dst,
        }
    else:
        gap = dst_year - src_year
        return {
            "status": "not_yet",
            "emoji": "🟡",
            "label": f"미교환 ({dst_year}년 시작 예정)",
            "detail": (
                f"{src.flag} {src.country}({src_year}) → {dst.flag} {dst.country}({dst_year}) "
                f"— dest가 {gap}년 늦게 가입"
            ),
            "src": src,
            "dst": dst,
        }
