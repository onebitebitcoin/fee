# 구현 진행 상황 — 매도 모드 + 라이트 퍼플 테마

## 목표

1. 첫 화면에서 `살 때 / 팔 때` 모드를 전환할 수 있게 한다.
2. `팔 때`(매도)를 고르면 이미 구현된 백엔드 매도 경로 API를 그대로 소비해 전체 마법사를 돌린다.
3. 모드가 매도로 바뀌면 화면 팔레트 전체가 라이트 퍼플로 전환된다.

## 사전 조사 결론

- 백엔드 `paths_sell.py` + `/path-finder/cheapest{,-all}?mode=sell` 이 이미 동작한다(실측 95개 경로).
- 매도 응답 envelope 은 매수와 동일하다: `best_path` / `top5` / `all_paths` / `disabled_paths` / `available_filters`.
- 매도 엔트리는 매수와 세 곳이 다르다.
  - 수령량 필드가 `btc_received` 가 아니라 `krw_received` 다.
  - 라이트닝 판정 필드가 `path_type === 'lightning_exit'` 가 아니라 `global_exit_mode === 'lightning'` 이다.
  - `destination` 필드가 없다(매도의 종착지는 원화이므로 종착지 단계 자체가 불필요하다).
- 액센트 색은 `acc-amber` 토큰 154곳으로 집중되어 있고, 배경·카드·광원은 `index.css` 와 `tailwind.config.js` 에 고정값으로 박혀 있다.

## 완료된 Phase

- [x] Phase 1: 테마 토큰을 CSS 변수로 전환하고 라이트 퍼플 팔레트를 정의했다
  - `acc-amber` → `acc-brand`, `shadow-glow-amber` → `shadow-glow-brand`, `Chip color="amber"` → `"brand"` 로 이름 정리
  - `data-theme="sell"` 을 붙이면 배경·카드·광원·액센트가 보라로 전환되는 것을 브라우저로 확인
  - 매수 화면은 변경 전과 동일하게 렌더링됨을 스크린샷으로 확인
  - 검증: tsc PASS, vitest 93/93 PASS

## 현재 진행 중

- [ ] Phase 2: 모드 상태 + `data-theme` 반영 + 첫 화면 세그먼트/BTC 수량 입력 + API 호출에 mode 전달

## 남은 Phase
- [ ] Phase 3: 매도 플로우 그래프 + 수령량·라이트닝 판정의 모드 인식
- [ ] Phase 4: 단계별·결과 화면 문구를 매도 방향으로 전환
- [ ] Phase 5: 테스트 작성 + 전체 린트/테스트 + INDEX.md 동기화

## Phase 세부

### Phase 1 — 테마 토큰화
- `acc-amber` → `acc-brand` 로 토큰명 변경(보라 모드에서 amber 라는 이름이 오해를 만든다). `shadow-glow-amber`, `animate-pulse-amber` 도 함께 변경.
- `tailwind.config.js` 색상 토큰을 CSS 변수 참조로 바꾼다. 투명도 수정자가 붙는 토큰(`acc-*`, `fill-*`)은 채널 삼원색 + `<alpha-value>` 형식을 쓴다.
- `index.css` 에 `:root`(매수, 크림) 와 `:root[data-theme="sell"]`(매도, 라이트 퍼플) 두 팔레트를 정의한다.
- 컴포넌트에 흩어진 `border-[rgba(180,110,50,0.08)]` 류 임의값을 `line` 토큰으로 정리한다.
- 네트워크 브랜드색(Bitcoin 주황, Tron 빨강 등)과 의미색(성공 초록, 위험 빨강, 메달색)은 테마와 무관하므로 그대로 둔다.

### Phase 2 — 모드 상태
- `ExplorerContext` 에 `mode` 상태를 추가하고, 변경 시 탐색 상태·프리페치 캐시를 초기화한다.
- `document.documentElement` 의 `data-theme` 을 모드에 따라 갱신한다.
- `InputStep` 에 `살 때 / 팔 때` 세그먼트를 추가하고, 매도일 때 BTC/sats 수량 입력 + UTXO 개수 입력으로 전환한다.
- `api.getCheapestPathAll` / `getCheapestPath` 호출에 mode·amount_btc·wallet_utxo_count 를 전달한다.

### Phase 3 — 플로우와 판정
- `flow.ts` 에 `SELL_FLOW` 를 추가한다(종착지 단계 없음, `BTC_GLOBAL` 코인 없음).
- `pathMode.ts` 를 신설해 `receivedAmount(p, mode)` / `isLightningPath(p, mode)` 를 단일 기준으로 둔다.
- `recommend.ts` / `derivations.ts` / `constants.ts` 가 이 헬퍼를 쓰도록 바꾼다. 기본값은 `buy` 로 두어 기존 golden 회귀 테스트를 깨지 않는다.

### Phase 4 — 문구
- 타임라인 라벨과 각 단계 제목/설명을 모드별로 분기한다.
- 결과 화면은 매도일 때 받는 원화를 주 지표로 보여준다.

### Phase 5 — 검증
- `pathMode` 단위 테스트, 매도 플로우 그래프 테스트, 테마 스위치 테스트를 추가한다.
- `bash scripts/test.sh lint` → `bash scripts/test.sh` 전체 PASS 확인.
- `.claude/INDEX.md` 동기화.
