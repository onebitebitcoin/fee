"""거래소 정적 메타데이터 통합 레지스트리 (SSoT).

새 거래소 추가 시 이 파일에만 엔트리를 추가한다.
기존 레지스트리 파일들(korea_exchange_registry, min_order_registry, carf_registry)은
이 프로필에서 데이터를 읽는 thin wrapper다.

포함 범위:
- 출금 한도 (WithdrawalLimits)
- 슬리피지 프로필 (SlippageProfile)
- 리스크 정보 (ExchangeRisk)
- 최소 주문 금액 (min_order_krw)
- CARF 관할권 (JurisdictionCarf)

미포함 (별도 관리):
- 거래 수수료, 거래소 그룹 → fee_checker.py (root-level, CLI 겸용)
- KYC 상태 → kyc_registry.py (DB-backed, 동적)
- 출금 API fetcher → market_core.py / fee_checker.py
"""
from __future__ import annotations

from backend.app.domain.exchanges._types import (
    ExchangeProfile,
    ExchangeRisk,
    JurisdictionCarf,
    SlippageProfile,
    WithdrawalLimits,
)

# ══════════════════════════════════════════════════════════════════════════════
# 거래소 프로필 정의 (알파벳순)
# ══════════════════════════════════════════════════════════════════════════════

EXCHANGE_PROFILES: dict[str, ExchangeProfile] = {

    # ── 한국 거래소 ──────────────────────────────────────────────────────────

    'upbit': ExchangeProfile(
        id='upbit',
        group='korea',
        min_order_krw=5000,
        withdrawal_limits=WithdrawalLimits(
            exchange='upbit',
            btc_per_tx_max=None,
            btc_daily_basic=1.0,
            btc_daily_verified=100.0,
            krw_daily_basic=5_000_000,
            krw_daily_verified=500_000_000,
            krw_per_tx_limit=1_000_000,
            personal_wallet_req='업비트 앱 → 출금관리 → 외부지갑 등록 (화이트리스트)',
            source_note='업비트 고객센터 공개 정보 기준 (레벨별 상이)',
        ),
        slippage=SlippageProfile(
            exchange='upbit',
            estimated_pct=0.00,
            large_order_pct=0.01,
            note='국내 최대 유동성, 실질 슬리피지 무시 가능',
        ),
        risk=ExchangeRisk(
            exchange='upbit',
            display_name='업비트',
            risk_level='LOW',
            risk_emoji='🟢',
            market_share_pct=63.7,
            bank_partner='케이뱅크',
            ccdata_rank=14,
            warnings=[],
            notes='국내 1위, Forbes 2025 신뢰도 국내 1위·글로벌 7위',
        ),
        carf_jurisdiction=JurisdictionCarf(
            country='대한민국',
            flag='🇰🇷',
            carf_first_exchange_year=2027,
            carf_status='confirmed_2027',
            note='52개국 2027 첫 교환 그룹. 2026년부터 데이터 수집.',
        ),
    ),

    'bithumb': ExchangeProfile(
        id='bithumb',
        group='korea',
        min_order_krw=1000,
        withdrawal_limits=WithdrawalLimits(
            exchange='bithumb',
            btc_per_tx_max=16.0,
            btc_daily_basic=1.0,
            btc_daily_verified=16.0,
            krw_daily_basic=5_000_000,
            krw_daily_verified=500_000_000,
            krw_per_tx_limit=1_000_000,
            personal_wallet_req='빗썸 앱 → 출금 → 개인지갑 사전 등록',
            source_note='빗썸 공식 영문 고객지원 기준 (en.bithumb.com) — 1일 16 BTC 한도',
        ),
        slippage=SlippageProfile(
            exchange='bithumb',
            estimated_pct=0.01,
            large_order_pct=0.03,
            note='2위 거래소, BTC 유동성 충분',
        ),
        risk=ExchangeRisk(
            exchange='bithumb',
            display_name='빗썸',
            risk_level='MEDIUM',
            risk_emoji='🟡',
            market_share_pct=26.1,
            bank_partner='KB국민은행',
            ccdata_rank=43,
            warnings=[
                '2026.02 대규모 BTC 오배포 사고 (시스템 리스크 노출)',
                'Q1 2026 거래량 31.3% 급감',
            ],
            notes='국내 2위, 유동성 양호하나 시스템 오류 이력 있음',
        ),
        carf_jurisdiction=JurisdictionCarf(
            country='대한민국',
            flag='🇰🇷',
            carf_first_exchange_year=2027,
            carf_status='confirmed_2027',
            note='52개국 2027 첫 교환 그룹. 2026년부터 데이터 수집.',
        ),
    ),

    'coinone': ExchangeProfile(
        id='coinone',
        group='korea',
        min_order_krw=1000,
        withdrawal_limits=WithdrawalLimits(
            exchange='coinone',
            btc_per_tx_max=None,
            btc_daily_basic=0.5,
            btc_daily_verified=50.0,
            krw_daily_basic=5_000_000,
            krw_daily_verified=200_000_000,
            krw_per_tx_limit=1_000_000,
            personal_wallet_req='코인원 앱 → 자산 → 출금 → 주소록 등록',
            source_note='코인원 공개 정보 기준 (추정, 실제 확인 권장)',
        ),
        slippage=SlippageProfile(
            exchange='coinone',
            estimated_pct=0.05,
            large_order_pct=0.10,
            note='중소 거래소, BTC 호가 얇을 수 있음',
        ),
        risk=ExchangeRisk(
            exchange='coinone',
            display_name='코인원',
            risk_level='LOW',
            risk_emoji='🟢',
            market_share_pct=6.8,
            bank_partner='카카오뱅크',
            ccdata_rank=41,
            warnings=[],
            notes='설립 이후 해킹 사고 0건, 보안 최우선 정책',
        ),
        carf_jurisdiction=JurisdictionCarf(
            country='대한민국',
            flag='🇰🇷',
            carf_first_exchange_year=2027,
            carf_status='confirmed_2027',
            note='52개국 2027 첫 교환 그룹. 2026년부터 데이터 수집.',
        ),
    ),

    'korbit': ExchangeProfile(
        id='korbit',
        group='korea',
        min_order_krw=1000,
        withdrawal_limits=WithdrawalLimits(
            exchange='korbit',
            btc_per_tx_max=5.0,
            btc_daily_basic=0.5,
            btc_daily_verified=10.0,
            krw_daily_basic=5_000_000,
            krw_daily_verified=100_000_000,
            krw_per_tx_limit=None,
            personal_wallet_req='코빗 앱 → 출금 → 지갑 추가 (KYC 완료 필요)',
            source_note='코빗: 1회 KRW 제한 없음으로 추정 (확인 권장)',
        ),
        slippage=SlippageProfile(
            exchange='korbit',
            estimated_pct=0.05,
            large_order_pct=0.15,
            note='소규모 거래소, 100만원↑ 주의',
        ),
        risk=ExchangeRisk(
            exchange='korbit',
            display_name='코빗',
            risk_level='LOW',
            risk_emoji='🟢',
            market_share_pct=3.2,
            bank_partner='신한은행',
            ccdata_rank=36,
            warnings=['거래량 낮음 — BTC 매수 시 슬리피지 주의'],
            notes='NXC(넥슨) 계열, CCData 국내 최고(36위), 소량 거래 권장',
        ),
        carf_jurisdiction=JurisdictionCarf(
            country='대한민국',
            flag='🇰🇷',
            carf_first_exchange_year=2027,
            carf_status='confirmed_2027',
            note='52개국 2027 첫 교환 그룹. 2026년부터 데이터 수집.',
        ),
    ),

    'gopax': ExchangeProfile(
        id='gopax',
        group='korea',
        min_order_krw=1000,
        withdrawal_limits=WithdrawalLimits(
            exchange='gopax',
            btc_per_tx_max=2.0,
            btc_daily_basic=0.1,
            btc_daily_verified=5.0,
            krw_daily_basic=1_000_000,
            krw_daily_verified=50_000_000,
            krw_per_tx_limit=1_000_000,
            personal_wallet_req='고팍스 고객센터 확인 필요 (정책 불분명)',
            source_note='⚠️ 추정치 — 고파이 사태 이후 정책 변동 가능, 반드시 확인',
        ),
        slippage=SlippageProfile(
            exchange='gopax',
            estimated_pct=0.20,
            large_order_pct=0.50,
            note='⚠️ 극저유동성: 표시 시세 ≠ 실제 체결가',
        ),
        risk=ExchangeRisk(
            exchange='gopax',
            display_name='고팍스',
            risk_level='HIGH',
            risk_emoji='🔴',
            market_share_pct=0.2,
            bank_partner='전북은행',
            ccdata_rank=None,
            warnings=[
                '고파이 사태: 1,479억원 미지급 (피해자 상환 진행 중)',
                '바이낸스 인수 완료, 상환 일정 불투명',
                '거래량 극히 낮음 — 표시 시세 ≠ 실제 체결가 (슬리피지 위험)',
                '시세 신뢰도 낮음 — 호가창 얇아 100만원도 불리한 가격 체결 가능',
            ],
            notes='⚠️ 이론상 유리하나 실거래 위험 높음 — 사용 전 주의 필수',
        ),
        carf_jurisdiction=JurisdictionCarf(
            country='대한민국',
            flag='🇰🇷',
            carf_first_exchange_year=2027,
            carf_status='confirmed_2027',
            note='52개국 2027 첫 교환 그룹. 2026년부터 데이터 수집.',
        ),
    ),

    # ── 글로벌 거래소 ─────────────────────────────────────────────────────────

    'binance': ExchangeProfile(
        id='binance',
        group='global',
        min_order_krw=None,
        withdrawal_limits=None,
        slippage=None,
        risk=None,
        carf_jurisdiction=JurisdictionCarf(
            country='아랍에미리트 (Abu Dhabi)',
            flag='🇦🇪',
            carf_first_exchange_year=2028,
            carf_status='confirmed_2028',
            note=(
                '2025-12-07 Abu Dhabi Global Market(ADGM) 이전 발표, 2026-01-05 운영 시작. '
                '등록 법인: Nest Exchange Ltd. (ADGM). UAE는 2028 그룹.'
            ),
        ),
    ),

    'okx': ExchangeProfile(
        id='okx',
        group='global',
        min_order_krw=None,
        withdrawal_limits=None,
        slippage=None,
        risk=None,
        carf_jurisdiction=JurisdictionCarf(
            country='세이셸',
            flag='🇸🇨',
            carf_first_exchange_year=2028,
            carf_status='confirmed_2028',
            note='Aux Cayes FinTech Co. Ltd 등록지. 세이셸은 2028 그룹.',
        ),
    ),

    'coinbase': ExchangeProfile(
        id='coinbase',
        group='global',
        min_order_krw=None,
        withdrawal_limits=None,
        slippage=None,
        risk=None,
        carf_jurisdiction=JurisdictionCarf(
            country='미국',
            flag='🇺🇸',
            carf_first_exchange_year=2028,
            carf_status='confirmed_2028',
            note='Coinbase Inc. 미국 법인. 미국은 2028 그룹.',
        ),
    ),

    'kraken': ExchangeProfile(
        id='kraken',
        group='global',
        min_order_krw=None,
        withdrawal_limits=None,
        slippage=None,
        risk=None,
        carf_jurisdiction=JurisdictionCarf(
            country='미국',
            flag='🇺🇸',
            carf_first_exchange_year=2028,
            carf_status='confirmed_2028',
            note='Payward Inc. 미국 법인. 미국은 2028 그룹.',
        ),
    ),

    'bitget': ExchangeProfile(
        id='bitget',
        group='global',
        min_order_krw=None,
        withdrawal_limits=None,
        slippage=None,
        risk=None,
        carf_jurisdiction=JurisdictionCarf(
            country='세이셸',
            flag='🇸🇨',
            carf_first_exchange_year=2028,
            carf_status='confirmed_2028',
            note='Bitget Limited 등록지. 세이셸은 2028 그룹.',
        ),
    ),

    'bybit': ExchangeProfile(
        id='bybit',
        group='global',
        min_order_krw=None,
        withdrawal_limits=None,
        slippage=None,
        risk=None,
        carf_jurisdiction=JurisdictionCarf(
            country='아랍에미리트 / BVI',
            flag='🇦🇪',
            carf_first_exchange_year=2028,
            carf_status='confirmed_2028',
            note='Bybit Fintech Ltd(BVI 등록) + Dubai 운영. UAE·BVI 모두 2028 그룹.',
        ),
    ),

    'gate': ExchangeProfile(
        id='gate',
        group='global',
        min_order_krw=None,
        withdrawal_limits=None,
        slippage=None,
        risk=None,
        carf_jurisdiction=None,  # CARF 관할권 미확인
    ),
}


# ── 접근자 함수 ───────────────────────────────────────────────────────────────

def get_profile(exchange: str) -> ExchangeProfile | None:
    """거래소 ID로 프로필 조회. 미등록 거래소는 None."""
    return EXCHANGE_PROFILES.get(exchange.lower())


def get_korea_profiles() -> list[ExchangeProfile]:
    """한국 거래소 프로필 목록."""
    return [p for p in EXCHANGE_PROFILES.values() if p.group == 'korea']


def get_global_profiles() -> list[ExchangeProfile]:
    """글로벌 거래소 프로필 목록."""
    return [p for p in EXCHANGE_PROFILES.values() if p.group == 'global']
