# 구현 진행 상황 — 결과 페이지 단계별 이동 수량·원화 + 최소주문 잔돈

## 완료된 Phase
- [x] Phase 1: 백엔드 — 각 leg amount_out(이동 수량)을 component에 노출 + 원화 환산
  - `fee_component`에 move_amount/move_coin/move_amount_krw 추가
  - korea_buy/global_buy/withdraw/swap leg + paths_buy 글로벌 출금 component 채움
  - 신규 테스트 test_components_expose_move_amount_for_all_paths, 320+1 통과

- [x] Phase 2: 백엔드 — 최소주문 정적 레지스트리(min_order_registry) + 잔돈(discarded_krw)
  - min_order_registry.py: KOREA_MIN_ORDER_KRW + get_min_order_krw/calc_discarded_krw
  - 각 path entry에 discarded_krw 주입(amount_krw % 최소주문, btc_received 불변)
  - 신규 test_min_order_registry.py + 경로 잔돈 노출 테스트
  - 비고: 글로벌 lot size 잔돈은 v1 제외(효용 미미, 추후)

## 현재 진행 중
- [ ] Phase 3: 프론트 — ResultStep 내역 확장(이동 수량/원화/잔돈) + types.ts 동기화

## 검증 기준
- pytest tests/ 전체 통과(기존 320 + 신규)
- ruff PASS, 프론트 build PASS
- Playwright로 USDT/BTC 경로 결과 페이지 실측
- INDEX.md 동기화
