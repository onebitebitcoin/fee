"""엣지 파이프라인 엔진 — 경로 계산의 공통 엣지 함수.

각 엣지 함수는 성공 시 Leg, 제약 위반 시 Blocked를 반환한다.
모든 출금이 withdraw_leg를 통과하므로 enabled/min/max/suspension 검증이 통일된다.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

from backend.app.domain.path_helpers import (
    fee_component,
    is_suspended,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Leg:
    """엣지 성공 결과. 다음 구간으로 전달할 수량과 이 구간 수수료."""
    amount_out: float        # 다음 구간 입력 코인 수량
    fee_krw: int             # 이 구간 수수료(원화)
    components: list[dict]   # fee_component() dict 목록

    def __post_init__(self):
        # frozen dataclass이므로 list는 tuple이 아닌 list로 유지(하지만 내부 요소 불변)
        object.__setattr__(self, 'components', list(self.components))


@dataclass(frozen=True)
class Blocked:
    """엣지 제약 위반 결과."""
    reason: str


def korea_buy_leg(
    amount_krw: int,
    korean_taker: float,
    korean_price: float,
    target_asset: str,
    usd_krw_rate: float,
) -> Leg:
    """KRW → BTC 또는 USDT 매수 엣지.

    target_asset: 'BTC' 이면 한국 KRW 시세 기준, 'USDT'면 usd_krw_rate 기준.
    Returns Leg(amount_out=구매한 코인 수량, fee_krw=거래 수수료)
    """
    trading_fee_krw = round(amount_krw * korean_taker)
    after_fee_krw = amount_krw - trading_fee_krw

    if target_asset == 'BTC':
        amount_out = after_fee_krw / korean_price
    else:  # USDT
        amount_out = after_fee_krw / usd_krw_rate

    comp = fee_component(
        '국내 매수 수수료',
        trading_fee_krw,
        rate_pct=korean_taker * 100,
        is_fixed=False,
    )
    return Leg(amount_out=amount_out, fee_krw=trading_fee_krw, components=[comp])


def withdraw_leg(
    row,
    amount_coin: float,
    *,
    coin: str,
    price_krw: float,
    usd_krw: float,
    num_txs: int = 1,
    source_url: str | None = None,
    label_override: str | None = None,
    maintenance_status: dict | None = None,
    exchange: str | None = None,
) -> Leg | Blocked:
    """모든 출금이 통과하는 핵심 엣지.

    검증 순서:
    1. enabled 확인
    2. suspension (is_suspended) 확인
    3. min_withdrawal 확인 (amount_coin < min → Blocked)
    4. max_withdrawal 확인 (amount_coin > max → Blocked)
    5. 통과 시 수수료 차감 후 Leg 반환

    getattr로 min/max를 안전 접근 → 기존 테스트 픽스처 호환.
    """
    if not row.enabled:
        reason = getattr(row, 'suspension_reason', None) or 'disabled'
        return Blocked(reason=reason)

    # suspension 검증 (maintenance 테이블 기반)
    if maintenance_status and exchange:
        susp = is_suspended(maintenance_status, exchange, coin, row.network_label)
        if susp:
            return Blocked(reason=susp)

    if row.fee is None:
        return Blocked(reason='출금 수수료 미수집')

    # min/max 제약 — getattr로 안전 접근 (기존 픽스처에 필드 없을 수 있음)
    min_wd = getattr(row, 'min_withdrawal', None)
    max_wd = getattr(row, 'max_withdrawal', None)

    if min_wd is not None and amount_coin < min_wd:
        return Blocked(reason='출금 최소 한도 미달')
    if max_wd is not None and amount_coin > max_wd:
        return Blocked(reason='출금 1회 최대 한도 초과')

    # 수수료 계산
    single_fee = row.fee
    total_fee_coin = single_fee * num_txs

    # KRW 환산
    if row.fee_krw is not None:
        single_fee_krw = int(round(row.fee_krw))
    else:
        single_fee_krw = round(single_fee * price_krw)
    total_fee_krw = single_fee_krw * num_txs

    amount_out = amount_coin - total_fee_coin

    # label 결정
    if label_override:
        wd_label = label_override
        wd_amount_text = None
    elif num_txs > 1:
        wd_label = f'{coin} 출금 수수료 ({num_txs}회 × {single_fee} {coin})'
        wd_amount_text = f'{round(total_fee_coin, 8)} {coin} ({num_txs}회)'
    else:
        wd_label = f'{coin} 출금 수수료'
        wd_amount_text = f'{single_fee} {coin}'

    comp = fee_component(
        wd_label,
        total_fee_krw,
        amount_text=wd_amount_text,
        source_url=source_url,
        is_fixed=True,
    )
    return Leg(amount_out=amount_out, fee_krw=total_fee_krw, components=[comp])


def global_buy_leg(
    usdt_in: float,
    global_taker: float,
    btc_usd: float,
    usd_krw: float,
) -> Leg:
    """글로벌 거래소 USDT → BTC 매수 엣지."""
    global_trading_fee_usdt = usdt_in * global_taker
    usdt_for_btc = usdt_in - global_trading_fee_usdt
    btc_out = usdt_for_btc / btc_usd
    fee_krw = round(global_trading_fee_usdt * usd_krw)

    comp = fee_component(
        '해외 BTC 매수 수수료',
        fee_krw,
        rate_pct=global_taker * 100,
        amount_text=f'{round(global_trading_fee_usdt, 8)} USDT',
        is_fixed=False,
    )
    return Leg(amount_out=btc_out, fee_krw=fee_krw, components=[comp])


def swap_leg(
    swap,
    btc_in: float,
    btc_usd: float,
    usd_krw: float,
) -> Leg | Blocked:
    """라이트닝 스왑 엣지 (ln_to_onchain).

    min_amount_sat / max_amount_sat 검증 후 수수료 계산.
    """
    fee_pct = swap.fee_pct / 100
    fee_fixed_btc = (getattr(swap, 'fee_fixed_sat', 0) or 0) / 1e8

    min_btc = (getattr(swap, 'min_amount_sat', 0) or 0) / 1e8
    max_btc_sat = getattr(swap, 'max_amount_sat', None)
    max_btc = max_btc_sat / 1e8 if max_btc_sat is not None else float('inf')

    if btc_in < min_btc:
        return Blocked(reason=f'스왑 최소 금액 미달 ({swap.service_name})')
    if btc_in > max_btc:
        return Blocked(reason=f'스왑 최대 금액 초과 ({swap.service_name})')

    ln_swap_fee_btc = btc_in * fee_pct + fee_fixed_btc
    btc_out = btc_in - ln_swap_fee_btc
    fee_krw = round(ln_swap_fee_btc * btc_usd * usd_krw)

    comp = fee_component(
        f'라이트닝 스왑 수수료 ({swap.service_name})',
        fee_krw,
        rate_pct=swap.fee_pct,
        amount_text=f'{round(ln_swap_fee_btc, 8)} BTC',
        is_fixed=False,
    )
    return Leg(amount_out=btc_out, fee_krw=fee_krw, components=[comp])
