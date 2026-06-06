"""국내 거래소 안정성·신뢰도·출금한도·슬리피지 레지스트리.

출처:
- CCData 글로벌 거래소 안전성 평가 (2025)
- Forbes 2025 '가장 신뢰할 수 있는 가상자산 사업자'
- 각 거래소 공시 및 언론 보도 (2025~2026)
- 거래소별 출금 정책 페이지 (공개 기준)

⚠️ 출금 한도는 KYC 등급·거래 이력에 따라 다름. 실제 한도는 각 거래소 확인 필요.
"""
from __future__ import annotations
from dataclasses import dataclass, field


# ── 슬리피지 추정 ────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class SlippageProfile:
    """시장가 매수 시 예상 슬리피지 (거래량 기반 추정)."""
    exchange: str
    estimated_pct: float        # 추정 슬리피지 % (소액 기준)
    large_order_pct: float      # 100만원↑ 대형 주문 추정 슬리피지 %
    note: str                   # 비고


SLIPPAGE_PROFILES: dict[str, SlippageProfile] = {
    'upbit':   SlippageProfile('upbit',   0.00, 0.01,  '국내 최대 유동성, 실질 슬리피지 무시 가능'),
    'bithumb': SlippageProfile('bithumb', 0.01, 0.03,  '2위 거래소, BTC 유동성 충분'),
    'coinone': SlippageProfile('coinone', 0.05, 0.10,  '중소 거래소, BTC 호가 얇을 수 있음'),
    'korbit':  SlippageProfile('korbit',  0.05, 0.15,  '소규모 거래소, 100만원↑ 주의'),
    'gopax':   SlippageProfile('gopax',   0.20, 0.50,  '⚠️ 극저유동성: 표시 시세 ≠ 실제 체결가'),
}


# ── 출금 한도 ────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class WithdrawalLimits:
    """거래소 출금 한도 (KYC 등급별 일일 한도, 공개 정보 기준 추정)."""
    exchange: str
    # BTC 출금
    btc_per_tx_max: float | None        # 1회 최대 BTC (None = 무제한)
    btc_daily_basic: float | None       # 기본 KYC 일일 한도
    btc_daily_verified: float | None    # 인증 완료 일일 한도
    # KRW 환산 출금 (USDT 등 포함)
    krw_daily_basic: int | None
    krw_daily_verified: int | None
    # 개인 지갑 1회 KRW 출금 제한 (트래블룰/AML 정책)
    # 이 금액 이상 출금 시 여러 트랜잭션으로 분할 필요
    krw_per_tx_limit: int | None        # 1회 KRW 제한 (None = 제한 없음)
    # 트래블룰 개인지갑 출금 요건
    personal_wallet_req: str            # 개인지갑 출금 요건
    source_note: str                    # 데이터 출처/신뢰도


WITHDRAWAL_LIMITS: dict[str, WithdrawalLimits] = {
    'upbit': WithdrawalLimits(
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
    'bithumb': WithdrawalLimits(
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
    'coinone': WithdrawalLimits(
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
    'korbit': WithdrawalLimits(
        exchange='korbit',
        btc_per_tx_max=5.0,
        btc_daily_basic=0.5,
        btc_daily_verified=10.0,
        krw_daily_basic=5_000_000,
        krw_daily_verified=100_000_000,
        krw_per_tx_limit=None,          # 코빗은 1회 KRW 제한 없음 (확인 필요)
        personal_wallet_req='코빗 앱 → 출금 → 지갑 추가 (KYC 완료 필요)',
        source_note='코빗: 1회 KRW 제한 없음으로 추정 (확인 권장)',
    ),
    'gopax': WithdrawalLimits(
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
}


# ── 안정성 레지스트리 ─────────────────────────────────────────────────────────

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


KOREA_EXCHANGE_RISKS: dict[str, ExchangeRisk] = {
    'upbit': ExchangeRisk(
        exchange='upbit', display_name='업비트',
        risk_level='LOW', risk_emoji='🟢',
        market_share_pct=63.7, bank_partner='케이뱅크', ccdata_rank=14,
        warnings=[],
        notes='국내 1위, Forbes 2025 신뢰도 국내 1위·글로벌 7위',
    ),
    'bithumb': ExchangeRisk(
        exchange='bithumb', display_name='빗썸',
        risk_level='MEDIUM', risk_emoji='🟡',
        market_share_pct=26.1, bank_partner='KB국민은행', ccdata_rank=43,
        warnings=[
            '2026.02 대규모 BTC 오배포 사고 (시스템 리스크 노출)',
            'Q1 2026 거래량 31.3% 급감',
        ],
        notes='국내 2위, 유동성 양호하나 시스템 오류 이력 있음',
    ),
    'coinone': ExchangeRisk(
        exchange='coinone', display_name='코인원',
        risk_level='LOW', risk_emoji='🟢',
        market_share_pct=6.8, bank_partner='카카오뱅크', ccdata_rank=41,
        warnings=[],
        notes='설립 이후 해킹 사고 0건, 보안 최우선 정책',
    ),
    'korbit': ExchangeRisk(
        exchange='korbit', display_name='코빗',
        risk_level='LOW', risk_emoji='🟢',
        market_share_pct=3.2, bank_partner='신한은행', ccdata_rank=36,
        warnings=['거래량 낮음 — BTC 매수 시 슬리피지 주의'],
        notes='NXC(넥슨) 계열, CCData 국내 최고(36위), 소량 거래 권장',
    ),
    'gopax': ExchangeRisk(
        exchange='gopax', display_name='고팍스',
        risk_level='HIGH', risk_emoji='🔴',
        market_share_pct=0.2, bank_partner='전북은행', ccdata_rank=None,
        warnings=[
            '고파이 사태: 1,479억원 미지급 (피해자 상환 진행 중)',
            '바이낸스 인수 완료, 상환 일정 불투명',
            '거래량 극히 낮음 — 표시 시세 ≠ 실제 체결가 (슬리피지 위험)',
            '시세 신뢰도 낮음 — 호가창 얇아 100만원도 불리한 가격 체결 가능',
        ],
        notes='⚠️ 이론상 유리하나 실거래 위험 높음 — 사용 전 주의 필수',
    ),
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
    # 일일 한도 (인증 기준) 체크
    daily = lim.btc_daily_verified
    if daily and amount_btc > daily:
        return (f"   ⛔ 일일 BTC 출금 한도 초과 가능 "
                f"({amount_btc:.4f} BTC > {daily} BTC/일, 인증 기준)")
    # KRW 환산 한도 체크
    daily_krw = lim.krw_daily_verified
    if daily_krw and amount_krw > daily_krw:
        return (f"   ⛔ 일일 KRW 출금 한도 초과 가능 "
                f"({amount_krw:,}원 > {daily_krw:,}원/일, 인증 기준)")
    return None
