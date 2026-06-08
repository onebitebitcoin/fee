# 구현 진행 상황 — ExplorerPage 단계(step) 완전 모듈화

## 목표
ExplorerPage.tsx(2024줄)를 얇은 컨트롤러로, 각 단계를 독립 모듈(컴포넌트+레지스트리)로 분리.
순서/경로 변경 = FLOW 배열 + registry + steps/ 세 곳만 수정.

## 완료된 Phase
- [x] Phase 1: 공용 모듈 추출 — explorer/flow.ts, explorer/constants.ts, explorer/ui.tsx (순수 이동, build PASS)
- [x] Phase 2: explorer/ExplorerContext.tsx 생성 (state·파생·핸들러 Provider로 이동) + ExplorerShell 분리
      + coin onClick의 setGlobal(null) 버그 수정 (global이 상위 단계가 되며 발생한 회귀)
      build PASS, Playwright USDT/BTC직접 2경로 PASS, console error 0

## 현재 진행 중
- [ ] Phase 3: steps/*.tsx 11개 추출 + registry.tsx, Shell이 레지스트리 기반 렌더

## 남은 Phase
- [ ] Phase 4: 죽은 코드 제거 + tsc/build/Playwright 3경로 검증 + INDEX.md 동기화

## 검증 방법
- tsc (`npm run build` 또는 `npx tsc --noEmit`)
- Playwright MCP 브라우저 스모크: USDT / BTC 직접 / BTC_GLOBAL 라이트닝 3경로
- (프론트엔드 테스트 프레임워크 없음 — tsc+build+Playwright로 대체)
