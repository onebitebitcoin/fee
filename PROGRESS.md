# 구현 진행 상황 — 핵심 로직 확장형 리팩토링

> 원칙: 순수 구조 리팩토링 (동작 0 변경). 각 Phase마다 전체 테스트 PASS → 체크포인트 커밋 → INDEX 동기화.
> 베이스라인: Backend 385 passed / Frontend 52 passed (tsc 0 errors)

## 완료된 Phase
- [x] Phase 1: 경로 빌더 패키지 + 레지스트리 (`backend/app/domain/paths/`) — paths_buy.py 923→155줄, 385 passed
- [x] Phase 2: 종착지(destination) 리졸버 (`paths/destination.py`) — 선언적 규칙, 385 passed
- [x] Phase 3: market.py 라우터 분할 (`backend/app/api/routes/market/`) — 999줄→6모듈(max 344), 17라우트 동일, 385 passed

## 현재 진행 중
- [ ] Phase 4: ExplorerContext 훅 분할 (`frontend/src/pages/explorer/hooks/`)

## 남은 Phase
