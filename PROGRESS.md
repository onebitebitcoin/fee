# 구현 진행 상황 — 경로 계산 그래프 아키텍처 리팩토링

> 계획 파일: `/Users/nsw/.claude/plans/curious-mapping-octopus.md`

## 완료된 Phase
- [x] Phase 1: 엣지 엔진(`path_graph.py`) + 단위 테스트(`test_path_graph.py`) — 29/29 PASS
- [x] Phase 2: `paths_buy.py` 엔진 기반 재작성 — 회귀 23/23 PASS (응답 스키마 보존, 917→780줄)

## 현재 진행 중
- [ ] Phase 3: OKX LN max 하드코딩 제거 + `paths_dynamic.py` 삭제 + max 제약 회귀 시나리오 추가

## 남은 Phase
- [ ] Phase 4: 전체 lint/test + 실데이터 점검 + INDEX.md 동기화 + VERSION 0.78.0 + PROGRESS.md 삭제

## 핵심 불변 조건
- `find_cheapest_path_from_snapshot_rows` 응답 스키마 100% 동일 (all_paths 키, 정렬, available_filters, top5/best_path)
- 한도 위반 → 폐기 + disabled_paths 사유 표시
- `withdraw_leg`는 `getattr(row, 'max_withdrawal', None)` 안전 접근 (기존 테스트 픽스처에 필드 없음)
