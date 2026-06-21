"""buy 경로 빌더 레지스트리 — 실행 순서 정의 (Single Source).

오케스트레이터(paths_buy.py)가 이 레지스트리를 순회한다.
- PER_EXCHANGE_BUILDERS: `for exchange in GROUPS['korea']` 루프 안에서 거래소별 실행.
  삽입 순서가 stable sort 결과에 영향을 주므로 순서를 보존한다.
- AGGREGATE_BUILDERS: 거래소 루프 이후 1회 실행 (내부에서 자체 순회).

새 경로 타입 추가 = 빌더 모듈 작성 → 적절한 리스트에 등록. 오케스트레이터 무수정.
"""
from backend.app.domain.paths.btc_direct import build_btc_direct
from backend.app.domain.paths.btc_via_global import build_btc_via_global
from backend.app.domain.paths.lightning import build_lightning
from backend.app.domain.paths.usdt import build_usdt

# 거래소별 빌더 — (bctx, exchange) → BuildResult. 순서 보존 필수.
PER_EXCHANGE_BUILDERS = [
    build_btc_direct,
    build_btc_via_global,
    build_usdt,
]

# 집계 빌더 — (bctx) → BuildResult. 거래소 루프 이후 실행.
AGGREGATE_BUILDERS = [
    build_lightning,
]
