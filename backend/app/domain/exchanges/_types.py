"""거래소 메타데이터 공통 타입 정의.

이 모듈은 순수 dataclass만 정의한다. 외부 의존성 없음.
기존 korea_exchange_registry.py, carf_registry.py에서 이 타입들을 import한다.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal


@dataclass(frozen=True)
class SlippageProfile:
    """시장가 매수 시 예상 슬리피지 (거래량 기반 추정)."""
    exchange: str
    estimated_pct: float
    large_order_pct: float
    note: str


@dataclass(frozen=True)
class WithdrawalLimits:
    """거래소 출금 한도 (KYC 등급별 일일 한도, 공개 정보 기준 추정)."""
    exchange: str
    btc_per_tx_max: float | None
    btc_daily_basic: float | None
    btc_daily_verified: float | None
    krw_daily_basic: int | None
    krw_daily_verified: int | None
    krw_per_tx_limit: int | None
    personal_wallet_req: str
    source_note: str


@dataclass(frozen=True)
class ExchangeRisk:
    exchange: str
    display_name: str
    risk_level: str
    risk_emoji: str
    market_share_pct: float
    bank_partner: str
    ccdata_rank: int | None
    warnings: list[str] = field(default_factory=list)
    notes: str = ''


@dataclass(frozen=True)
class JurisdictionCarf:
    country: str
    flag: str
    carf_first_exchange_year: int | None
    carf_status: str
    note: str = ""


@dataclass(frozen=True)
class ExchangeProfile:
    """거래소별 정적 메타데이터 통합 레코드.

    fee_checker.py의 TRADING_FEES/GROUPS/fetcher 함수는 여기에 포함하지 않는다.
    (root-level 의존성 문제 + 코드 참조라 분리 불가).
    kyc_registry는 DB-backed이므로 제외.
    """
    id: str
    group: Literal['korea', 'global']
    min_order_krw: int | None
    withdrawal_limits: WithdrawalLimits | None
    slippage: SlippageProfile | None
    risk: ExchangeRisk | None
    carf_jurisdiction: JurisdictionCarf | None
