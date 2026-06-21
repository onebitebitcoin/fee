"""buy 경로 빌더 공통 기반 — BuilderContext / BuildResult / 공유 헬퍼.

각 빌더는 BuilderContext(사전계산된 스냅샷·환율·글로벌 출금 메타데이터)를 받아
BuildResult(paths, disabled)를 반환한다. 빌더 본문 로직은 path_graph 엣지를 통과하므로
enabled/min/max/suspension 검증이 통일된다.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from types import SimpleNamespace

from backend.app.domain.market_core import TRADING_FEES
from backend.app.domain.path_graph import withdraw_leg
from backend.app.domain.paths_context import SnapshotContext

_EXCHANGE_KO: dict[str, str] = {
    'binance': '바이낸스', 'okx': 'OKX', 'bybit': '바이빗',
    'bitget': '비트겟', 'kraken': '크라켄', 'coinbase': '코인베이스',
    'gate': '게이트', 'upbit': '업비트', 'bithumb': '빗썸',
    'coinone': '코인원', 'korbit': '코빗', 'gopax': '고팍스',
}


def _ex_ko(exchange_id: str) -> str:
    return _EXCHANGE_KO.get(exchange_id.lower(), exchange_id)


@dataclass(frozen=True)
class BuilderContext:
    """모든 buy 빌더가 공유하는 입력 묶음.

    오케스트레이터가 한 번 계산해 모든 빌더에 전달한다.
    """
    ctx: SnapshotContext
    amount_krw: int
    global_exchange: str
    global_onchain_wd_fee: float | None
    global_onchain_wd_fee_krw: int
    global_onchain_network_label: str | None
    global_usdt_nets: set[str] = field(default_factory=set)
    lightning_swap_rows: list = field(default_factory=list)


@dataclass
class BuildResult:
    """빌더 출력 — 활성 경로 목록과 disabled(불가) 경로 목록."""
    paths: list[dict] = field(default_factory=list)
    disabled: list[dict] = field(default_factory=list)


def _get_korean_taker(ticker_row, exchange: str) -> float:
    return (
        ticker_row.taker_fee_pct / 100
        if ticker_row.taker_fee_pct is not None
        else TRADING_FEES[exchange]['taker']
    )


def _force_calc_withdraw(row, amount_coin, *, coin, price_krw, usd_krw,
                         num_txs=1, source_url=None, label_override=None):
    """enabled=False / 점검 정지 경로의 수수료를 강제 계산 (제약 우회).

    enabled·min·max를 무시하고 fee가 존재하면 수수료를 산출해 반환한다.
    fee=None이면 None 반환.
    """
    if row.fee is None:
        return None
    fake = SimpleNamespace(
        network_label=getattr(row, 'network_label', ''),
        fee=row.fee,
        fee_krw=getattr(row, 'fee_krw', None),
        enabled=True,
        min_withdrawal=None,
        max_withdrawal=None,
    )
    return withdraw_leg(
        fake, amount_coin,
        coin=coin, price_krw=price_krw, usd_krw=usd_krw,
        num_txs=num_txs, source_url=source_url, label_override=label_override,
    )
