"""CARF (Crypto-Asset Reporting Framework) 거래소별 적용 현황 레지스트리.

Sources:
  - OECD 2025 Monitoring Update: https://www.oecd.org/content/dam/oecd/en/networks/global-forum-tax-transparency/crypto-asset-reporting-framework-monitoring-implementation-update-2025.pdf
  - OECD Commitments PDF: https://www.oecd.org/content/dam/oecd/en/networks/global-forum-tax-transparency/commitments-carf.pdf
  - Korea implementation: data collection from 2026-01-01, first exchange 2027
  - 2026-01-01부터 거래 데이터 수집 시작, 2027년에 첫 정보 교환

관할권 데이터는 backend/app/domain/exchanges/profiles.py 에서 관리.
이 파일은 CARF 상태 계산 로직 + 기존 호출 인터페이스를 유지하는 thin wrapper다.
"""
from __future__ import annotations

from backend.app.domain.exchanges._types import JurisdictionCarf  # noqa: F401 (re-export)
from backend.app.domain.exchanges.profiles import EXCHANGE_PROFILES

# ── 거래소별 주요 관할권 ─────────────────────────────────────────────────────
# profiles.py 에서 파생. carf_jurisdiction이 있는 거래소만 포함.

EXCHANGE_JURISDICTIONS: dict[str, JurisdictionCarf] = {
    exchange_id: profile.carf_jurisdiction
    for exchange_id, profile in EXCHANGE_PROFILES.items()
    if profile.carf_jurisdiction is not None
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
