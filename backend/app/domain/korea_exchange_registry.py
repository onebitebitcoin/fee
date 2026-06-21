"""국내 거래소 안정성·신뢰도·출금한도·슬리피지 레지스트리.

출처:
- CCData 글로벌 거래소 안전성 평가 (2025)
- Forbes 2025 '가장 신뢰할 수 있는 가상자산 사업자'
- 각 거래소 공시 및 언론 보도 (2025~2026)
- 거래소별 출금 정책 페이지 (공개 기준)

⚠️ 출금 한도는 KYC 등급·거래 이력에 따라 다름. 실제 한도는 각 거래소 확인 필요.

데이터는 backend/app/domain/exchanges/profiles.py 에서 관리.
이 파일은 기존 호출 인터페이스를 유지하는 thin wrapper다.
"""
from __future__ import annotations

from backend.app.domain.exchanges._types import (  # noqa: F401 (re-export)
    ExchangeRisk,
    SlippageProfile,
    WithdrawalLimits,
)
from backend.app.domain.exchanges.profiles import get_korea_profiles

# ── 슬리피지 추정 ────────────────────────────────────────────────────────────

SLIPPAGE_PROFILES: dict[str, SlippageProfile] = {
    p.id: p.slippage
    for p in get_korea_profiles()
    if p.slippage is not None
}

# ── 출금 한도 ────────────────────────────────────────────────────────────────

WITHDRAWAL_LIMITS: dict[str, WithdrawalLimits] = {
    p.id: p.withdrawal_limits
    for p in get_korea_profiles()
    if p.withdrawal_limits is not None
}

# ── 안정성 레지스트리 ─────────────────────────────────────────────────────────

KOREA_EXCHANGE_RISKS: dict[str, ExchangeRisk] = {
    p.id: p.risk
    for p in get_korea_profiles()
    if p.risk is not None
}


# ── 조회 헬퍼 ─────────────────────────────────────────────────────────────────

def get_exchange_risk(exchange: str) -> ExchangeRisk | None:
    return KOREA_EXCHANGE_RISKS.get(exchange.lower())


def get_slippage(exchange: str) -> SlippageProfile | None:
    return SLIPPAGE_PROFILES.get(exchange.lower())


def get_withdrawal_limits(exchange: str) -> WithdrawalLimits | None:
    return WITHDRAWAL_LIMITS.get(exchange.lower())


def slippage_adjusted_price(exchange: str, base_price_krw: int, amount_krw: int) -> tuple[int, float]:
    """슬리피지 반영 실효 BTC 매수가 및 슬리피지 % 반환."""
    profile = get_slippage(exchange)
    if profile is None:
        return base_price_krw, 0.0
    pct = profile.large_order_pct if amount_krw >= 1_000_000 else profile.estimated_pct
    adjusted = round(base_price_krw * (1 + pct / 100))
    return adjusted, pct


def risk_warning_lines(exchange: str) -> list[str]:
    info = get_exchange_risk(exchange)
    if not info or not info.warnings:
        return []
    lines = [f"   {info.risk_emoji} <b>[{info.display_name} {info.risk_level}]</b> {info.notes}"]
    for w in info.warnings:
        lines.append(f"      └ ⚠️ {w}")
    return lines


def withdrawal_limit_line(exchange: str, amount_btc: float, amount_krw: int) -> str | None:
    """출금 한도 초과 여부 경고 반환. 문제없으면 None."""
    lim = get_withdrawal_limits(exchange)
    if lim is None:
        return None
    daily = lim.btc_daily_verified
    if daily and amount_btc > daily:
        return (f"   ⛔ 일일 BTC 출금 한도 초과 가능 "
                f"({amount_btc:.4f} BTC > {daily} BTC/일, 인증 기준)")
    daily_krw = lim.krw_daily_verified
    if daily_krw and amount_krw > daily_krw:
        return (f"   ⛔ 일일 KRW 출금 한도 초과 가능 "
                f"({amount_krw:,}원 > {daily_krw:,}원/일, 인증 기준)")
    return None


# 하위 호환 — 직접 profiles 접근이 필요한 경우를 위해 re-export
__all__ = [
    'ExchangeRisk',
    'SlippageProfile',
    'WithdrawalLimits',
    'SLIPPAGE_PROFILES',
    'WITHDRAWAL_LIMITS',
    'KOREA_EXCHANGE_RISKS',
    'get_exchange_risk',
    'get_slippage',
    'get_withdrawal_limits',
    'slippage_adjusted_price',
    'risk_warning_lines',
    'withdrawal_limit_line',
]
