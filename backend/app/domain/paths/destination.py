"""종착지(destination) 리졸버 — 경로의 최종 수신처를 선언적 규칙으로 분류.

새 종착지 추가 = `DESTINATION_RULES`에 규칙 1개 추가. 오케스트레이터 후처리 루프 무수정.

규칙: (predicate, destination) 목록을 순서대로 평가, 첫 매치 채택. 미매치 시 DEFAULT.
"""
from __future__ import annotations

from typing import Callable

# 종착지 라벨 — 프론트 Destination 타입과 1:1 대응 ('personal' | 'lightning_wallet')
Destination = str

DEFAULT_DESTINATION: Destination = 'personal'


def _is_direct_lightning(path: dict) -> bool:
    """LN 직접출금(__direct__) — 온체인 개인지갑으로 직접 수신 불가 → 라이트닝 지갑이 종착."""
    return (
        path.get('path_type') == 'lightning_exit'
        and path.get('lightning_exit_provider') == '__direct__'
    )


# (predicate, destination) — 순서대로 평가, 첫 매치 채택.
DESTINATION_RULES: list[tuple[Callable[[dict], bool], Destination]] = [
    (_is_direct_lightning, 'lightning_wallet'),
]


def resolve_destination(path: dict) -> Destination:
    """경로 dict의 종착지를 반환. 온체인/스왑 경유는 기본값 'personal'."""
    for predicate, destination in DESTINATION_RULES:
        if predicate(path):
            return destination
    return DEFAULT_DESTINATION
