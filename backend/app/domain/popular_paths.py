"""첫 화면 '가장 저렴한 경로 TOP 5' — 사람들이 많이 쓰는 거래소로만 짠 간결한 경로를 고른다.

수수료 최저 목록(추천 화면)은 처음 보는 거래소나 라이트닝 스왑 서비스를 거치는 경로가 위에 오기 쉬워서,
처음 온 사람이 따라 하기 어렵다. 그래서 국내는 업비트·빗썸, 해외는 바이낸스·OKX 로 한정하고,
경로 모양도 두 가지로 줄인다.
- 국내 거래소 ↔ 개인 지갑 BTC 직접 전송 (`btc_direct`)
- 국내 거래소 ↔ 해외 거래소 USDT 전송 + 해외 거래소 ↔ 개인 지갑 온체인 BTC 전송

지금 쓸 수 없는 경로는 뺀다: 네트워크 점검으로 출금이 막혀 수수료만 강제로 계산한 경로(`disabled`)와,
팔 때 국내 거래소가 그 입금을 받지 않는 것이 확인된 경로(`blocked` 입금 관문)다.
'지갑 등록 필요'(`required`) 같은 조건부 경로는 조건을 붙여 보여 주도록 남긴다.
"""
from __future__ import annotations

from typing import Any

POPULAR_KOREAN = ('upbit', 'bithumb')
POPULAR_GLOBAL = ('binance', 'okx')
DEFAULT_LIMIT = 5

# 해외 거래소를 거치지 않는 경로는 어느 해외 거래소 결과에도 똑같이 들어 있어서 한 번만 센다
_DIRECT = 'btc_direct'
_SIMPLE_USDT_VARIANTS = (None, 'usdt_via_global')


def _is_simple(p: dict[str, Any]) -> bool:
    if p.get('global_exit_mode') != 'onchain':
        return False
    if p.get('destination', 'personal') != 'personal':
        return False
    variant = p.get('route_variant')
    if variant == _DIRECT:
        return True
    return p.get('transfer_coin') == 'USDT' and variant in _SIMPLE_USDT_VARIANTS


def _is_usable(p: dict[str, Any]) -> bool:
    if p.get('disabled'):
        return False
    return not any(g.get('level') == 'blocked' for g in p.get('deposit_gates') or [])


def _candidates(by_global: dict[str, Any]):
    for gex in POPULAR_GLOBAL:
        payload = by_global.get(gex)
        if not isinstance(payload, dict) or payload.get('error'):
            continue
        for p in payload.get('all_paths') or []:
            if p.get('korean_exchange') in POPULAR_KOREAN and _is_simple(p) and _is_usable(p):
                via = None if p.get('route_variant') == _DIRECT else gex
                yield via, p


def select_popular_paths(by_global: dict[str, Any], mode: str, limit: int = DEFAULT_LIMIT) -> list[dict[str, Any]]:
    """(국내 거래소, 거치는 해외 거래소) 조합마다 가장 싼 경로 하나를 남기고 수수료 순으로 limit 개.

    mode 는 지금 규칙에 영향을 주지 않지만, 호출부가 살 때·팔 때 결과를 섞지 않도록 받아 둔다.
    응답 크기를 줄이려고 수수료 내역(breakdown)은 뺀다.
    """
    del mode
    best: dict[tuple[str, str | None], dict[str, Any]] = {}
    for via, p in _candidates(by_global):
        key = (p['korean_exchange'], via)
        if key not in best or p['total_fee_krw'] < best[key]['total_fee_krw']:
            entry = {k: v for k, v in p.items() if k != 'breakdown'}
            best[key] = {**entry, 'global_exchange': via}
    return sorted(best.values(), key=lambda p: p['total_fee_krw'])[:limit]
