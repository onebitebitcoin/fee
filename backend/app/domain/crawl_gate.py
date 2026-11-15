"""최신 크롤 결과로 경로 계산을 진행할 수 있는지 판정한다.

국내 거래소 한 곳의 수집 실패(예: 고팍스 매매 중단으로 시세 API 404)가 전체 경로 계산을
막지 않도록, 실패한 국내 거래소는 계산 대상에서 제외하고 나머지로 계산을 이어간다.
다음 경우에만 계산 자체를 차단한다.
- 대상 글로벌 거래소의 시세/출금 수집이 실패했을 때
- 거래소를 특정할 수 없는 오류(exchange=None)가 있을 때
- 국내 거래소가 모두 제외되었을 때
"""
from __future__ import annotations

from dataclasses import dataclass, field

from backend.app.domain.market_core import GROUPS

BLOCKING_STAGES = frozenset({'withdrawal', 'ticker'})
STATIC_FALLBACK_SOURCE = 'official_docs'
STATIC_FALLBACK_MESSAGE = '정적 fallback 기반 과거 스냅샷입니다. 최신 스크래핑을 다시 실행하세요.'


@dataclass(frozen=True)
class CrawlGate:
    blocking_errors: list[dict] = field(default_factory=list)
    # 국내 거래소 → 제외 사유가 된 오류 목록 (GROUPS['korea'] 순서 유지)
    excluded_exchanges: dict[str, list[dict]] = field(default_factory=dict)

    def excluded_summary(self) -> list[dict]:
        return [{'exchange': ex, 'errors': errs} for ex, errs in self.excluded_exchanges.items()]


def _ts(value) -> int | None:
    return int(value.timestamp()) if value else None


def _error_entry(row) -> dict:
    return {
        'exchange': row.exchange,
        'coin': row.coin,
        'stage': row.stage,
        'error_message': row.error_message,
        'created_at': _ts(row.created_at),
    }


def _fallback_entry(row) -> dict:
    return {
        'exchange': row.exchange,
        'coin': row.coin,
        'stage': 'withdrawal',
        'error_message': STATIC_FALLBACK_MESSAGE,
        'created_at': _ts(row.recorded_at),
    }


def evaluate_crawl_gate(crawl_errors: list, withdrawal_rows: list, global_exchange: str) -> CrawlGate:
    korea = GROUPS['korea']
    global_exchange = global_exchange.lower()

    blocking: list[dict] = []
    korean_issues: dict[str, list[dict]] = {}

    for row in crawl_errors:
        if row.stage not in BLOCKING_STAGES:
            continue
        if row.exchange in korea:
            korean_issues.setdefault(row.exchange, []).append(_error_entry(row))
        elif row.exchange is None or row.exchange == global_exchange:
            blocking.append(_error_entry(row))

    for row in withdrawal_rows:
        if row.exchange in korea and row.source == STATIC_FALLBACK_SOURCE:
            korean_issues.setdefault(row.exchange, []).append(_fallback_entry(row))

    excluded = {ex: korean_issues[ex] for ex in korea if ex in korean_issues}

    if len(excluded) == len(korea):
        blocking.extend(entry for errs in excluded.values() for entry in errs)

    return CrawlGate(blocking_errors=blocking, excluded_exchanges=excluded)


def without_exchanges(rows: list, excluded: dict[str, list[dict]]) -> list:
    """제외된 거래소의 스냅샷 행을 걸러낸 새 리스트를 반환한다."""
    if not excluded:
        return rows
    return [row for row in rows if row.exchange not in excluded]
