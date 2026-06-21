"""경로 유효성 invariant 검증 모듈.

각 경로 엔트리(CheapestPathEntry 딕셔너리)에 대해 논리적 일관성을 검사한다.
비정상 경로를 조기에 발견하기 위한 어드민 진단 도구.
"""
from __future__ import annotations

from dataclasses import dataclass, field

_VALID_TRANSFER_COINS = {'BTC', 'USDT'}
_VALID_GLOBAL_EXCHANGES = {
    'binance', 'okx', 'coinbase', 'kraken', 'bitget', 'bybit', 'gate',
}


@dataclass
class InspectResult:
    path_id: str
    issues: list[str] = field(default_factory=list)
    severity: str = 'ok'  # 'ok' | 'warning' | 'error'


def inspect_path(entry: dict) -> InspectResult:
    """경로 하나를 6가지 invariant로 검사하고 InspectResult를 반환한다."""
    path_id = entry.get('path_id') or '<unknown>'
    issues: list[str] = []

    # 1. path_id 존재
    if not entry.get('path_id'):
        issues.append('path_id가 없음')

    # 2. total_fee_krw >= 0
    total_fee = entry.get('total_fee_krw')
    if total_fee is None:
        issues.append('total_fee_krw 없음')
    elif total_fee < 0:
        issues.append(f'total_fee_krw 음수: {total_fee}')

    # 3. btc_received > 0
    btc_received = entry.get('btc_received')
    if btc_received is None:
        issues.append('btc_received 없음')
    elif btc_received <= 0:
        issues.append(f'btc_received 0 이하: {btc_received}')

    # 4. transfer_coin 유효값
    transfer_coin = entry.get('transfer_coin')
    if transfer_coin not in _VALID_TRANSFER_COINS:
        issues.append(f'transfer_coin 유효하지 않음: {transfer_coin!r}')

    # 5. global_exchange 유효값 (존재하는 경우만)
    global_exchange = entry.get('global_exchange')
    if global_exchange and global_exchange not in _VALID_GLOBAL_EXCHANGES:
        issues.append(f'global_exchange 알 수 없음: {global_exchange!r}')

    # 6. breakdown.components 완결성 — 빈 배열이면 수수료 추적 불가
    breakdown = entry.get('breakdown') or {}
    components = breakdown.get('components', [])
    if not components:
        issues.append('breakdown.components 비어 있음 — 수수료 내역 없음')

    # 7. fee_pct 범위 (0~100%)
    fee_pct = entry.get('fee_pct')
    if fee_pct is not None and (fee_pct < 0 or fee_pct > 100):
        issues.append(f'fee_pct 범위 이상: {fee_pct}%')

    # 8. breakdown total_fee_krw 일치 여부
    bd_total = breakdown.get('total_fee_krw')
    if bd_total is not None and total_fee is not None:
        diff = abs(bd_total - total_fee)
        if diff > 1:  # 1원 이상 차이
            issues.append(
                f'breakdown.total_fee_krw({bd_total})와 total_fee_krw({total_fee}) 불일치'
            )

    severity = 'ok'
    if issues:
        severity = 'error' if any(
            'btc_received' in i or '음수' in i or '없음' in i
            for i in issues
        ) else 'warning'

    return InspectResult(path_id=path_id, issues=issues, severity=severity)


def inspect_all(paths: list[dict]) -> list[InspectResult]:
    """경로 목록 전체를 검사하고 InspectResult 목록을 반환한다."""
    return [inspect_path(entry) for entry in paths]
