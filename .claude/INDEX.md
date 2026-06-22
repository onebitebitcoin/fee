# exchange-fee 코드베이스 인덱스

> **새 세션 시작 시 반드시 이 파일을 먼저 읽고 작업 대상 파일만 Read 한다.**  
> 코드를 변경할 때마다 이 파일을 동기화한다 (MANDATORY).

## 프로젝트 한 줄 요약

한국 거래소 → 개인 BTC 지갑 이동 시 최저 수수료 경로를 찾는 서비스.  
UI는 단계별 마법사 형태. 백엔드는 크롤링 스냅샷 기반 경로 계산.

---

## 실행 방법

```bash
# 백엔드 (포트 8000)
source .venv/bin/activate
uvicorn backend.app.main:app --reload

# 프론트엔드 (포트 5173)
cd frontend && npm run dev

# 테스트
PYTHONPATH=$(pwd) python -m pytest tests/
cd frontend && npm run test
```

---

## 파일 구조 & 역할

### 루트

| 파일 | 역할 |
|------|------|
| `fee_checker.py` | 거래소 API 직접 호출 코어. `TRADING_FEES`, `GROUPS` (korea 5개 / global 7개), `ALL_EXCHANGES` 상수 정의. global: binance/okx/bybit/bitget/kraken/coinbase/gate. `_STATIC_WITHDRAWAL_OVERRIDES` 레지스트리 — API 미제공 출금 메타데이터 보강(OKX Lightning 등). `_GATE_FEES` — Gate.io 정적 출금 수수료. **`_COINBASE_BTC_WITHDRAWAL_FEE_BTC`(0.0001 BTC=10,000 sats) — 코인베이스 BTC 출금 정적 등록값(공개 API 미제공, 개인계정 Exchange API 불가 → 멤풀 추정 폐기). 실제값 변경 시 이 상수만 수정.** market_core.py가 import해서 사용. |
| `mcp_server.py` | MCP 서버 진입점 |
| `scripts/btc_path_alert.py` | BTC 경로 알림 스크립트 (자주 수정됨) |
| `scripts/gen_recommend_golden.py` | 추천/필터 golden 회귀 기준 생성기. fixture → oracle 로직 적용 → `recommend.golden.json` 작성. 로직 의도 변경 시 재실행. |
| `Dockerfile` | 멀티스테이지 빌드 (node:20-alpine → python:3.11-slim). Playwright chromium 포함. |
| `docker-compose.yml` | Ubuntu 프로덕션 배포용. PostgreSQL 15 + 앱 + nginx 3-컨테이너 구성. |
| `nginx/nginx.conf` | nginx 리버스 프록시 설정 (app:8000 → 포트 80). |
| `scripts/deploy.sh` | 빌드 → 컨테이너 시작 → 헬스체크 자동화 배포 스크립트. |
| `scripts/start.sh` | Docker 컨테이너 진입점. DB 마이그레이션 → uvicorn 시작 순서로 실행. |

### Backend

#### `backend/app/api/routes/`

| 파일 | 엔드포인트 | 역할 |
|------|-----------|------|
| `market/` | `/market/*` | **핵심 API 패키지**(기존 단일 market.py 분할). `__init__.py`가 4개 서브라우터 통합 + 외부 호환 심볼 re-export(`router`/`invalidate_status_cache`/`warm_cheapest_path_cache`/`WARM_AMOUNT_PRESETS_KRW`/`kimp_poll_loop`/`kyc_registry`/`_cheapest_path_cache`/`_fetch_kimp_data`). 서브모듈: **`_shared.py`**(캐시 `_status_cache`60초/`_cheapest_path_cache`3600초+single-flight, `invalidate_status_cache`, 직렬화·공지·KYC enrich 헬퍼), **`tickers.py`**(tickers/withdrawal-fees/network-status/lightning-swap/capabilities/withdrawal-limits), **`path_finder.py`**(cheapest/cheapest-all/inspect + `_compute_cheapest_all`+`warm_cheapest_path_cache`), **`kimp.py`**(kimp/live + `_fetch_kimp_data`/`_fetch_usd_krw_realtime`/`_current_usdt_krw_rate`/`kimp_poll_loop`; 테스트는 `market.kimp.*` monkeypatch), **`status.py`**(status/scrape-status/crawl-status/notices/network-changes/carf/volumes). |
| `crawl_runs.py` | `/crawl-runs/*` | 크롤링 실행 이력 조회/트리거 |
| `exchanges.py` | `/exchanges/*` | 거래소 정보 |
| `health.py` | `/health` | 헬스체크 |
| `stats.py` | `/stats/*` | 접속 통계 |
| `board.py` | `/board/*` | 게시판 게시글/댓글 CRUD. 일반/제보=닉네임+비밀번호(해시), 공지=admin `X-API-Key`. 검색(제목+내용)·페이지네이션·공지 상단고정(별도 반환). 비밀번호 검증 실패 403, 응답에 password 필드 미포함. |

#### `backend/app/domain/`

| 파일 | 역할 |
|------|------|
| `route_inspect.py` | **경로 유효성 invariant 검증.** `InspectResult` dataclass(path_id, issues, severity). `inspect_path(entry)` — 8가지 검사: path_id 존재, total_fee_krw≥0, btc_received>0, transfer_coin 유효값, global_exchange 유효값, breakdown.components 완결성, fee_pct 범위, breakdown 합계 일치. `inspect_all(paths)` — 목록 전체 검사. `/path-finder/inspect` API가 소비. |
| `paths_dynamic.py` | **`scripts/btc_path_alert.py` 전용** 경로 계산 엔진 (텔레그램 알림, live-fetch). `LIGHTNING_SWAP_SERVICES` 상수 + `find_cheapest_path_dynamic()` / `find_cheapest_path_all_exchanges()`. **엣지 기반으로 통일됨** — 출금/매수/스왑이 `path_graph` 엣지를 통과(live dict는 `row_from_dict` 어댑터). FDUSD/슬리피지/promo/김프는 dynamic 고유 orchestration. 출력 스키마(quote_strategy 등)는 알림용으로 buy/sell과 별개. |
| `market_core.py` | fee_checker 래퍼. `KOREA_FETCHERS`, `GLOBAL_FETCHERS`, `WITHDRAWAL_FETCHERS`. `get_ticker()`, `get_withdrawal_fees()` 등 실시간 API 호출 함수. **`withdrawal_source(exchange, coin)` — 출금 수수료 출처 라벨(static/realtime_api/scraped_page). `STATIC_WITHDRAWAL_FEE_KEYS`={('coinbase','BTC')} → 정적. `get_withdrawal_fees` 응답 source가 DB WithdrawalFeeSnapshot.source로 저장 → 프론트/어드민 노출.** |
| `market_paths.py` | 실시간 API 기반 경로 계산 함수 모음. `compare_btc_prices`, `get_exchange_summary`, `calculate_btc_purchase_cost`, `find_cheapest_path`, `get_network_status` 정의. 하위 호환 re-export: `find_cheapest_path_from_snapshot_rows`(paths_buy), `find_cheapest_sell_path_from_snapshot_rows`(paths_sell). MCP 도구는 live_market.py 경유로 소비. |
| `path_graph.py` | **엣지 파이프라인 엔진 (3계산기 공통 코어).** `Leg`/`Blocked` + 매수 엣지(`korea_buy_leg`/`global_buy_leg`/`global_buy_maker_leg`), 매도 엣지(`korea_sell_leg`/`global_sell_leg`), `withdraw_leg`(모든 출금 enabled/suspension/min/max 통일), `swap_leg`(양방향), `row_from_dict`(live dict→row 어댑터). |
| `paths_buy.py` | **얇은 매수 오케스트레이터.** `find_cheapest_path_from_snapshot_rows()` — 컨텍스트 빌드 → `paths/` 레지스트리 순회(거래소별+집계) → 후처리(종착지 태깅/정렬/응답 envelope). `_build_available_filters()`(paths_sell가 import). 빌더 본체는 `paths/` 패키지에 위임. |
| `paths_sell.py` | 엣지 체인 기반 매도 경로 계산 (웹). `find_cheapest_sell_path_from_snapshot_rows()` — `korea_sell_leg`/`global_sell_leg`/`withdraw_leg`(min/max 적용)/`swap_leg`(onchain_to_ln). mempool 지갑 수수료·capability 게이팅 유지. |
| `paths_context.py` | `SnapshotContext` dataclass + `build_snapshot_context()` — buy/sell 공통 스냅샷 컨텍스트. `usd_krw_rate`(포렉스, 표시·USD환산) + `usdt_buy_krw_rate`(한국 USDT/KRW, USDT 매수 leg 기준; 미주입 시 포렉스 폴백) 분리 보유 |
| `path_helpers.py` | 경로 계산 공통 유틸: `fee_component`, `is_suspended`, `normalize_usdt_network`, `is_bitcoin_native_network`, `resolve_global_onchain_wd_fee`, `_build_path_id` |
| `korea_exchange_registry.py` | **thin wrapper** — `exchanges/profiles.py`에서 `SLIPPAGE_PROFILES`/`WITHDRAWAL_LIMITS`/`KOREA_EXCHANGE_RISKS` 파생. `get_withdrawal_limits()`/`get_slippage()`/`get_exchange_risk()`/`slippage_adjusted_price()`/`risk_warning_lines()`/`withdrawal_limit_line()` 헬퍼 유지. |
| `min_order_registry.py` | **thin wrapper** — `exchanges/profiles.py`에서 `KOREA_MIN_ORDER_KRW` 파생. `get_min_order_krw`/`calc_discarded_krw` — 매수 잔돈(`discarded_krw`) 근사 계산. |
| `carf_registry.py` | **thin wrapper** — `exchanges/profiles.py`에서 `EXCHANGE_JURISDICTIONS` 파생. `get_carf_exchange_status()` 계산 로직 유지. |

#### `backend/app/domain/paths/` (매수 경로 빌더 패키지 — 경로 타입별 분리 + 레지스트리)

| 파일 | 역할 |
|------|------|
| `__init__.py` | `BuilderContext`/`BuildResult` + `PER_EXCHANGE_BUILDERS`/`AGGREGATE_BUILDERS` re-export. |
| `base.py` | `BuilderContext`(빌더 공유 입력: ctx/amount_krw/global_exchange/사전계산 글로벌출금·usdt_nets·lightning_swap_rows) + `BuildResult(paths, disabled)` dataclass + 공유 헬퍼(`_get_korean_taker`/`_force_calc_withdraw`/`_ex_ko`/`_EXCHANGE_KO`). |
| `btc_direct.py` | `build_btc_direct(bctx, exchange)` — BTC 직접 온체인 출금 경로. |
| `btc_via_global.py` | `build_btc_via_global(bctx, exchange)` — 국내 BTC→글로벌 경유→온체인 경로. |
| `usdt.py` | `build_usdt(bctx, exchange)` — USDT 경유→글로벌 BTC 매수→온체인 경로. |
| `lightning.py` | `build_lightning(bctx)` — **집계 빌더**(내부 거래소 순회). LN exit 경로(USDT/BTC→글로벌→LN, 스왑/직접). LN 헬퍼(`_resolve_global_ln_row`/`_ln_num_txs`/`_global_ln_fee_krw`/`_build_ln_global_exit_components`) 포함. |
| `registry.py` | **빌더 실행 순서 Single Source.** `PER_EXCHANGE_BUILDERS`(거래소 루프 내, 순서 보존) + `AGGREGATE_BUILDERS`(루프 이후). 새 경로 타입 = 모듈 작성 → 리스트 등록. |
| `destination.py` | **종착지 리졸버.** `resolve_destination(path)` — `DESTINATION_RULES`(predicate→destination, 순서대로 첫 매치) + `DEFAULT_DESTINATION='personal'`. LN 직접출금(__direct__)→'lightning_wallet'. 새 종착지 = 규칙 1개 추가. paths_buy 후처리 루프가 소비. |

#### `backend/app/domain/exchanges/` (Phase 1 신설 패키지 — 거래소 메타데이터 SSoT)

| 파일 | 역할 |
|------|------|
| `__init__.py` | 패키지 마커 |
| `_types.py` | 순수 dataclass 5개: `SlippageProfile`, `WithdrawalLimits`, `ExchangeRisk`, `JurisdictionCarf`, `ExchangeProfile`. 외부 의존성 없음. |
| `profiles.py` | **거래소 메타데이터 단일 진실 공급원(SSoT).** `EXCHANGE_PROFILES: dict[str, ExchangeProfile]` — 한국 5개(upbit/bithumb/coinone/korbit/gopax) + 글로벌 7개(binance/okx/coinbase/kraken/bitget/bybit/gate). **새 거래소 추가 시 이 파일에만 엔트리 추가.** 접근자: `get_profile(exchange)`, `get_korea_profiles()`, `get_global_profiles()`. |

#### `backend/app/services/`

| 파일 | 역할 |
|------|------|
| `cache.py` | **`_TtlCache` 인메모리 캐시 클래스.** TTL 만료 + single-flight(키별 threading.Lock으로 동시 미스 1회 계산 병합, cache stampede 방어). `get/set/invalidate/clear/get_or_compute`. `market.py`가 import해서 `_status_cache`(60초)/`_cheapest_path_cache`(3600초) 인스턴스 사용. |
| `crawl_service.py` | `CrawlService.run_full_crawl()` — 모든 거래소 데이터 수집 → DB 저장. Ticker, 출금수수료, 네트워크상태, Lightning 수수료 포함. `_detect_network_changes(prev_rows, new_rows)` — 이전/현재 네트워크 상태 비교로 정지/재개 변경 감지. `_fetch_and_save_targeted_notices(crawl_run, prev_rows, new_rows)` — 변경 감지 시 관련 거래소 공지 자동 탐색. |
| `lightning_scraper.py` | Lightning 스왑 서비스 실시간 수수료 스크래핑 (Boltz, Coinos, Bitfreezer, WalletOfSatoshi, Strike). |
| `promo_scraper.py` | FDUSD 0% maker 프로모션 등 스크래핑 |
| `kyc_registry.py` | 거래소/서비스별 KYC 상태 레지스트리 |
| `notice_scraper.py` | 거래소 BTC/USDT 관련 공지 스크래핑. `fetch_notices_for_exchange(exchange, extra_keywords)` — 변경 감지 시 특정 거래소+키워드 타깃 탐색 |
| `mempool_service.py` | mempool.space API 연동 (Bitcoin 네트워크 수수료) |
| `exchange_status_builder.py` | `/market/status` 응답 빌더 |
| `live_market.py` | **MCP 도구 전용 파사드.** `mcp/server.py`가 단일 진입점으로 사용. market_core + market_paths 모든 함수/상수 re-export. 내부 백엔드 코드(market.py, crawl_service.py, exchanges.py)는 각 도메인 모듈을 직접 import — live_market.py를 경유하지 않음. |

#### `backend/app/db/`

| 파일 | 역할 |
|------|------|
| `models.py` | SQLAlchemy 모델 전체 정의 |
| `board_repository.py` | 게시판(BoardPost/BoardComment) ORM 접근 계층. list_notices/list_posts(페이지네이션)/get/create/update/delete + comment_counts + 댓글 CRUD. |
| `repositories.py` | DB 조회 함수 전체 (get_latest_successful_run, list_ticker_snapshots_for_run 등). `get_prev_run_network_status(db, crawl_run_id)` — 현재 크롤 이전의 최근 성공 크롤 네트워크 상태 반환. `get_recent_network_changes(db, hours=24)` — **WithdrawalFeeSnapshot.enabled 기반** 24시간 내 연속 크롤 쌍 비교로 suspended/resumed 변경 감지 + 관련 공지 첨부. `record_visit(ip)` — IP 기준 하루 1회 방문자 카운트. `record_route_request()` — 경로 탐색 요청 카운트. |
| `session.py` | DB 세션 팩토리 (`get_db` 의존성 주입) |
| `bootstrap.py` | DB 초기화, 테이블 생성 |
| `carf_seed.py` | CARF 거래소 데이터 시딩 |

### DB 모델 목록 (`models.py`)

| 모델 | 설명 |
|------|------|
| `CrawlRun` | 크롤링 실행 이력 (id, status, started_at, completed_at) |
| `TickerSnapshot` | 거래소별 BTC/USDT 시세 스냅샷 (price, usd_krw_rate, taker_fee_pct 등) |
| `WithdrawalFeeSnapshot` | 거래소별 출금 수수료 스냅샷 |
| `NetworkStatusSnapshot` | 네트워크 입출금 정지 상태 |
| `CrawlError` | 크롤링 오류 로그 |
| `LightningSwapFeeSnapshot` | Lightning 스왑 서비스 수수료 스냅샷 |
| `ExchangeCapabilitySnapshot` | 거래소 Lightning 지원 여부 |
| `KoreaWithdrawalLimitSnapshot` | 국내 거래소 출금 한도 스냅샷 (크롤링 시 업데이트, 업비트 Playwright) |
| `AccessLog` | 접근 로그 |
| `ExchangeNotice` | 거래소 공지사항 |
| `CarfExchangeInfo` | CARF 규제 정보 |
| `ExchangeCautionInfo` | 어드민이 설정한 거래소별 유의 플래그 + 사유 (exchange_id PK, group, caution bool, caution_reason) |
| `BoardPost` | 게시판 게시글 (category general/report/notice, title, content, nickname, password_hash/salt — 공지는 null) |
| `BoardComment` | 게시글 댓글 (post_id FK CASCADE, nickname, password_hash/salt, content) |

### Frontend

| 파일 | 역할 |
|------|------|
| `src/pages/ExplorerPage.tsx` | **얇은 컨트롤러 (~87줄)**. `ExplorerProvider` + `ExplorerShell`(헤더/푸터) + `StepFrame`(현재 phase의 모션 래퍼). 실제 단계 UI는 `explorer/steps/*`에 위임. |
| `src/pages/explorer/flow.ts` | **순서/경로 정의 (Single Source).** `Phase`·`CoinType`·`Destination` 타입, `FLOW` 그래프(각 단계 next(state)), `flowNext`/`flowPrev`/`flowSteps`, `PHASES`/`phaseIdx`. **순서·경로 변경 시 이 파일만 수정.** 플로우: `domestic→coin→(BTC→btc_method→result / BTC_GLOBAL→btc_method→global→…/ USDT→global→…)→global_exit_method→(lightning→destination→(lightning_wallet→result / personal→swap_service→result) / onchain→result)`. |
| `src/pages/explorer/constants.ts` | 정적 데이터·헬퍼: `GLOBAL_EXCHANGES`, `DOMESTIC_INFO`, `GLOBAL_INFO`, `RISK_*`, `SPRING_*`, `AllData` 타입, `bestByBtc`/`fmtKst`/`fmtAmountText`. |
| `src/pages/explorer/ui.tsx` | 공용 컴포넌트: `ExFavicon`, `SectionLabel`, `Chip`, `OptionCard`, `LoadingScreen`, `GatemanPanel`. |
| `src/pages/explorer/ExplorerContext.tsx` | **상태·핸들러 허브 (~617줄).** `useExplorerValue()`에 결합 상태(선택/kimp/필터, `btcPrice`+`btcPriceLoading`=최초 kimp/live fetch 진행 플래그) + 핸들러(`handleSearch`/`handleBack`/`handleNext`/`reset`/`handleSelectRecommendedPath`). 파생값은 `derivations.ts` 순수 함수를 `useMemo`로 호출, 거래소 메타데이터는 `useExchangeMetadata()`로 위임. `ExplorerProvider`/`useExplorer()` 제공. 타입은 `ReturnType<typeof useExplorerValue>` 추론. |
| `src/pages/explorer/derivations.ts` | **ExplorerContext 순수 파생 로직.** allData+선택값만으로 결정되는 순수 함수: `computeSnapshotKimp`/`computeDomesticBtcKrw`/`computeKoreaVolumeMap`/`computeDomesticOptions`/`computeCoinOptions`/`computeGlobalOptions`/`computeNetworkOptions`/`computeDisabledNetworkOptions`/`computeHasLightningPaths`/`computeGlobalSupportsLightning`/`computeCurrentLightningPaths`/`computeLightningExitInfo`/`computeSwapServiceOptions`/`computeResultPath`/`computeAltPaths`. 부수효과·React 의존 없음 → 단위 테스트 가능. |
| `src/pages/explorer/useExchangeMetadata.ts` | **거래소 메타데이터 fetch 훅.** `useExchangeMetadata()` — 마운트 1회 fetch로 `liveRegistry`/`cautionMap`/`carfMap`/`withdrawalLimits` 소유, read-only 노출. 탐색 상태와 결합 없음. |
| `src/pages/explorer/registry.tsx` | `STEP_REGISTRY`: `Phase → { Component, className }` 매핑. **새 단계 추가 = steps/XStep.tsx 작성 → 여기 등록 → flow.ts FLOW에 끼워넣기.** |
| `src/pages/explorer/recommend.ts` | **추천/필터 순수 로직 (단일 기준).** `flattenPaths`(byGlobal 평탄화), `recommendRouteKey`(dedup 키, USDT는 네트워크 제외), `dedupAndSortPaths`(dedup+수수료오름차순), `filterRecommendedPaths`(제외 필터). ExplorerContext의 allPaths/allRecommendedPaths/topRecommendedPaths가 이 함수들을 호출. **로직 변경 시 golden 회귀 테스트가 감지.** |
| `src/pages/explorer/recommend.test.ts` | recommend.ts golden 회귀 테스트(Vitest, 32케이스). fixture에 실제 로직 적용 결과를 golden과 대조 — dedup 정렬 전체 순서 + 필터 27시나리오 count/top + 경로 내부 일관성. |
| `src/pages/explorer/disabledNetworks.ts` | 첫 페이지 "네트워크 비활성 목록" 순수 필터 로직. `filterDisabledWithdrawals()` — `withdrawal-fees/latest` items에서 출금 비활성(enabled=false) + BTC/USDT(`STATUS_COINS`)만 추려 거래소→코인→네트워크 정렬·dedup. `isLegacyBtcNetwork()`로 레거시 BTC 온체인 망(라벨에 segwit/legacy/p2sh 포함, native/lightning 제외; 예 바이낸스 'BTC (SegWit)')은 제외 — 네이티브 'Bitcoin' 망이 멀쩡한데 레거시만 비활성이라 혼란 주는 행 숨김. |
| `src/pages/explorer/disabledNetworks.test.ts` | disabledNetworks.ts 단위 테스트(Vitest, 7케이스). 필터/정렬/dedup + 레거시 제외/네이티브·LN 유지 검증. |
| `src/pages/explorer/__fixtures__/cheapestAll.fixture.json` | 고정 입력 fixture (`/path-finder/cheapest-all` 실제 응답, amount_krw=1,000,000). 회귀 테스트 입력. |
| `src/pages/explorer/__fixtures__/recommend.golden.json` | 검증된 기대 출력 (Playwright로 실제 UI와 27/27 일치 확인). `scripts/gen_recommend_golden.py`로 재생성. |
| `src/pages/explorer/steps/*.tsx` | 단계별 독립 컴포넌트. 각자 `useExplorer()`로 필요한 값만 소비. InputStep/RecommendationStep/DomesticStep/GlobalStep/CoinStep/BtcMethodStep/NetworkStep/GlobalExitMethodStep/**DestinationStep**/SwapServiceStep/ResultStep. 체크리스트는 DomesticStep/GlobalStep에 인라인. `DestinationStep`: 라이트닝 출금 후 종착지(개인지갑=스왑 경유 / 라이트닝 지갑=직접 수신) 선택. `InputStep`(첫 화면): 방문자수·마퀴·시세·금액입력·**네트워크 비활성 목록**. 시세·김치 프리미엄 패널은 최초 `/market/kimp/live` 응답 전까지 `btcPriceLoading`(context) 기준 로딩 스피너("실시간 시세·김치 프리미엄 불러오는 중…") 표시 후 패널로 교체. 비활성 목록(`disabledNetworks.ts` 필터, 0개면 숨김)은 `networkChanges`(suspended)와 `exchange|coin|network_label` 키로 매칭해 **"언제부터"(detected_at)+관련 공지 링크(related_notices)** 표시. (변경 공지사항 섹션은 비활성 목록으로 흡수·제거됨; `getNetworkChanges()`는 enrichment용으로 유지.) |
| `src/lib/api.ts` | API 클라이언트. `getTickers()`, `getCheapestPath()`, `getNetworkChanges()` (최근 네트워크 상태 변경 조회), `getWithdrawalFees()` (출금 수수료/활성 스냅샷, `WithdrawalFeesResponse`) |
| `src/types.ts` | 공유 타입 (`CheapestPathEntry`, `CheapestPathResponse`, `TickerRow`, `NetworkChange`, `NetworkChangeNotice`, `NetworkChangesResponse`) |
| `src/lib/exchangeNames.ts` | 거래소 id → 표시명 매핑 (`fmtEx()`) |
| `src/lib/formatBtc.ts` | BTC/수수료/사토시 포맷 유틸 |
| `src/components/ErrorBoundary.tsx` | 에러 바운더리 |
| `src/App.tsx` | 라우팅. `/admin`, `/board`(목록), `/board/new`(작성), `/board/:id`(상세), `/board/:id/edit`(수정), `*`→ExplorerPage. |
| `src/pages/board/BoardListPage.tsx` | 게시판 목록. 검색(제목+내용)·페이지네이션(20)·공지 상단고정+색상구분. 글쓰기 버튼. |
| `src/pages/board/BoardDetailPage.tsx` | 게시글 상세 + 본문 수정/삭제(비밀번호) + 댓글 목록/작성/수정/삭제(인라인, 비밀번호). |
| `src/pages/board/BoardWritePage.tsx` | 작성/수정 폼. 일반/제보 카테고리, 닉네임+비밀번호. `?template=report` 시 제보 템플릿 프리필. |
| `src/pages/board/BoardLayout.tsx` | 게시판 공통 헤더/레이아웃 (뒤로/홈 버튼). |
| `src/pages/board/categoryStyle.ts` | 카테고리별 라벨/뱃지/행 색상(공지=amber, 제보=blue). `categoryStyle.test.ts`. |
| `src/pages/board/reportTemplate.ts` | 제보 링크 ↔ 글쓰기 프리필 빌더(buildReportQuery/parseReportContext/buildReportTemplate). `reportTemplate.test.ts`. |
| `src/pages/board/AdminNoticePanel.tsx` | AdminPage "게시판 공지" 탭 — 공지 작성/수정/삭제(X-API-Key, `admin_key` sessionStorage). |
| `src/pages/AdminPage.tsx` | 어드민 페이지 레이아웃/라우터 (141줄 thin shell). 비밀번호 게이트 + 탭 헤더(국내/해외/엣지/게이트맨/공지사항/게시판공지/크롤상태/**경로검사기**). 각 탭 콘텐츠는 `admin/*Panel` 컴포넌트에 위임. |
| `src/pages/admin/adminHelpers.tsx` | AdminPage 공유 UI 프리미티브. `SectionLabel`, `EditCell`(인라인 편집 셀), `FieldRow`(레이블+값 행). |
| `src/pages/admin/ExchangeTablesPanel.tsx` | 국내 거래소 테이블(`KoreanExchangeTable`), 해외 거래소 테이블(`GlobalExchangeTable`), 엣지 속성 정의 섹션(`EdgePropertiesSection`). |
| `src/pages/admin/ExchangeTabContent.tsx` | 국내/해외/엣지 탭 전체 카드 레이아웃. `ExchangeTabContent` — 메인 테이블 카드 + 유의 설정(`CautionPanel`) + 출금 수수료(`WithdrawalFeePanel`) 조합. |
| `src/pages/admin/CautionPanel.tsx` | 거래소별 유의 플래그 토글+이유 입력. `CautionPanel(group, exchanges)` — `api.getCaution/updateCaution` 소비. |
| `src/pages/admin/WithdrawalFeePanel.tsx` | 거래소별 출금 수수료(현재값+출처 뱃지) 읽기 전용 패널. `WD_SOURCE_META` 뱃지(정적/실시간API/스크래핑). |
| `src/pages/admin/KYCPanel.tsx` | 게이트맨 레지스트리 편집. `GatemanRegistryPanel` — `GateItemRow`/`ExchangeGateEditor` 내장. `api.getGatemanRegistry/updateGatemanRegistry/refreshGatemanRegistry` 소비. |
| `src/pages/admin/NoticesPanel.tsx` | 거래소 공지사항 목록(1시간 자동갱신). `NoticesPanel` — `api.getAdminNotices` 소비. |
| `src/pages/admin/CrawlStatusPanel.tsx` | 크롤 상태 + 데이터갭("조치 필요") + 거래소별 티커/BTC/USDT 상태 뱃지. `CrawlStatusPanel` — `api.getCrawlStatus/triggerCrawl` 소비. 크롤 중 5초 폴링. |
| `src/pages/admin/RouteInspectorPanel.tsx` | 경로 검사기 UI. `RouteInspectorPanel` — `/path-finder/inspect` API 소비. 금액 선택 + 실행 버튼 + 오류/경고/정상 분류 결과 표시. |
| `src/lib/routeInspect.ts` | 경로 검사 API 클라이언트. `fetchRouteInspect(amountKrw)` → `RouteInspectResponse(results, summary)`. 타입: `InspectResult`, `InspectSummary`. |

---

## API 엔드포인트 요약

> Base: `/api/v1`

| 메서드 | 경로 | 설명 | 캐시 |
|--------|------|------|------|
| GET | `/market/tickers/latest` | 최신 크롤 기준 시세 스냅샷 | 없음 (DB 직접) |
| GET | `/market/path-finder/cheapest` | 최저 수수료 경로 계산(단일 거래소) | 3600초 TTL + single-flight |
| GET | `/market/path-finder/cheapest-all` | 전 글로벌 거래소 경로 일괄 계산(추천 핫패스) | 3600초 TTL + single-flight, 크롤 후 워밍 |
| GET | `/market/path-finder/inspect` | cheapest-all 경로 invariant 검사 (어드민 진단) | 없음 |
| GET | `/market/kimp/live` | 한국 거래소 BTC 실시간 김치 프리미엄 | 30초 TTL, `?force_refresh=true` 지원 |
| GET | `/market/withdrawal-fees/latest` | 출금 수수료 스냅샷 | 없음 |
| GET | `/market/network-status/latest` | 네트워크 입출금 상태 | 없음 |
| GET | `/market/lightning-swap-fees/latest` | Lightning 스왑 수수료 | 없음 |
| GET | `/market/status` | 통합 상태 뷰 | 60초 TTL |
| GET | `/market/scrape-status` | 스크래핑 소스별 상태 | 없음 |
| GET | `/market/crawl-status` | 거래소별 크롤 결과 + `data_gaps`(출금 enabled인데 fee=None인 행, admin "조치 필요"용) | 없음 |
| GET | `/market/notices/latest` | 거래소 공지 | 없음 |
| GET | `/market/network-changes/recent` | 최근 N시간(기본 24h) 네트워크 상태 변경(출금 정지/재개) + 관련 공지 | 없음 |
| GET | `/market/withdrawal-limits/latest` | 국내 거래소 출금 한도 (크롤 데이터 + static fallback) | 없음 |
| GET | `/market/carf-exchanges` | CARF 거래소 정보 | 없음 |
| POST | `/crawl-runs/trigger` | 수동 크롤링 트리거 | - |
| GET | `/exchanges/caution` | 거래소별 유의 플래그 전체 조회 | 없음 |
| PATCH | `/exchanges/caution/{exchange_id}` | 유의 플래그 업서트 (X-API-Key 헤더 필요) | - |
| GET | `/board/posts` | 게시글 목록 (`?page&size&q&category`). notices(상단고정)+items(페이지네이션)+total 반환 | 없음 |
| GET | `/board/posts/{id}` | 게시글 상세 + 댓글 목록 | 없음 |
| POST | `/board/posts` | 작성 (일반/제보=비밀번호 / 공지=X-API-Key) | - |
| PUT/DELETE | `/board/posts/{id}` | 수정/삭제 (비밀번호 또는 X-API-Key 검증) | - |
| POST | `/board/posts/{id}/comments` | 댓글 작성 (닉네임+비밀번호) | - |
| PUT/DELETE | `/board/comments/{id}` | 댓글 수정/삭제 (비밀번호 검증) | - |

---

## 데이터 흐름

```
[외부 거래소 API]
       ↓
CrawlService.run_full_crawl()
       ↓
DB 저장 (CrawlRun + TickerSnapshot + WithdrawalFeeSnapshot + ...)
       ↓
GET /market/tickers/latest  →  DB 스냅샷 반환 (실시간 아님)
GET /market/path-finder/cheapest  →  DB 스냅샷 기반 경로 계산
       ↓
Frontend (RouteExplorerPage.tsx)
  - allData.tickers: TickerRow[]  →  김프 계산에 사용
  - allData.byGlobal[exchange]: CheapestPathResponse  →  경로 탐색
```

### 김프(김치 프리미엄) 계산 위치

| 위치 | 방식 |
|------|------|
| **프론트엔드** 전 화면(InputStep/DomesticStep/ResultStep) | "김치 프리미엄" 표시는 **`liveKimpTotal[exchange]`(총, 포렉스 기준) 우선, 없을 시 `snapshotKimp[exchange]`(포렉스 기준 fallback)** 로 통일. `liveKimp`(BTC 자체, USDT 환산)는 첫 페이지 분해 보조값으로만 사용. ⚠️ `liveKimp ?? snapshotKimp`는 정의(BTC자체 vs 총합) 불일치라 금지 — 반드시 `liveKimpTotal`. |
| **백엔드** `market.py:_fetch_kimp_data()` | KOREA_FETCHERS 병렬 호출로 BTC/KRW 수집 + Upbit USDT/KRW 실시간 환율로 `kimp`(비트코인 자체 프리미엄) 계산 + 두나무 포렉스로 `kimchi_premium_total`(총 김치 프리미엄) 계산. USD/KRW 30초 TTL 캐시. |
| **백엔드** `paths_dynamic.py` | 크롤 스냅샷 기반 (btc_path_alert 알림 경로 계산용, kimchi_premiums 포함) |

> 계산 방식: `kimp[X] = (BTC_KRW[X] / (BTC_USD_global × USD_KRW_upbit) - 1) × 100` (비트코인 자체 프리미엄, USDT 환산)  
> 총 김치 프리미엄: `kimchi_premium_total[X] = (BTC_KRW[X] / (BTC_USD_global × 포렉스) - 1) × 100` = (1+kimp)(1+usdt_premium)−1. 포렉스 없으면 빈 객체.  
> USD/KRW는 Upbit KRW-USDT 체결가, 30초 TTL 캐시 (`_fetch_usd_krw_realtime()`). 실패 시 Dunamu API → open.er-api.com fallback.  
> 프론트엔드 domestic step 진입 시 `/market/kimp/live` 자동 fetch. 새로고침 버튼으로 force_refresh 가능.

---

## 기능 수정 가이드

| 수정 목적 | 봐야 할 파일 |
|-----------|-------------|
| 김프 표시 수정 | 전 화면 "김치 프리미엄"=`liveKimpTotal`(총, 포렉스 기준) 단일 기준. `InputStep.tsx`(총합 대표+분해), `DomesticStep.tsx`(리스트/상세 grid, line 27·107), `ResultStep.tsx`(BTC 경로 평가 line 122). context `liveKimpTotal`(=`kimchi_premium_total`). `market.py:_fetch_kimp_data()` — `kimp`(BTC 자체)+`kimchi_premium_total`(총) 계산. `market.py:_fetch_usd_krw_realtime()` — Upbit USDT/KRW 30초 캐시. |
| 원달러(테더) 프리미엄 표시 | `market.py:_fetch_kimp_data()` 응답에 `forex_usd_krw_rate`(두나무 포렉스)+`usdt_premium`(=업비트USDT÷포렉스−1) 추가. `ExplorerContext.tsx` `usdtPremium`/`forexUsdKrw` state(kimp/live 수신, **live÷live**). 전 화면 단일 라벨 "원달러(테더) 프리미엄". **⚠️ ResultStep 결과카드도 표시용 `usdtPremiumPct=usdtPremium`(context, live)·`displayForex=forexUsdKrw` 사용 — 경로 P&L 계산용 `forexRate`(크롤 스냅샷, globalBtcKrw 환산 전용)와 분리. 표시값은 화면 간 일치, live÷snapshot 혼합 금지.** `DomesticStep.tsx` 상단 헤더 + 상세 grid(총+BTC자체+테더 분해). 타입 `types.ts:LiveKimpResponse`. |
| 첫 페이지 김치 프리미엄 표시 (총합+분해) | `InputStep.tsx` 프리미엄 패널 — `btcPrice.kimchiPremiumTotal`(메인 총합, 포렉스 실패 시 `kimchiPremium`로 폴백) 크게 + `BTC 자체`(kimp)/`테더(USDT)`(usdtPremium) 분해 보조. "자세히" 토글 시 구성 비중 progress bar(절대값 기준 btcShare/fxShare). `ExplorerContext.tsx` `btcPrice.kimchiPremiumTotal`(kimp/live의 `kimchi_premium_total['upbit']`). 백엔드 필드 `market.py:_fetch_kimp_data()` `kimchi_premium_total`. |
| USDT 경로 매수 환율 / "원달러 프리미엄" | `market.py:_current_usdt_krw_rate()`(업비트 USDT, `_kimp_latest` 우선) → `find_cheapest_path_from_snapshot_rows(usdt_krw_rate=)` → `paths_context.usdt_buy_krw_rate` → `paths_buy.py` **USDT 매수 수량만 업비트 USDT(usdt_buy_krw_rate, 원달러 프리미엄 발생 지점)**, 출금/글로벌 매수/온체인·스왑 수수료의 원화 환산은 모두 **포렉스(usd_krw_rate)**로 통일(leg의 amount_out은 코인 단위라 환율 무관 → btc_received 불변). **결과카드 평가(`ResultStep.tsx`)도 글로벌 BTC를 포렉스로 환산** → USDT 경로=원달러 프리미엄(금액 분해, 라벨 '원달러 프리미엄'), BTC 경로=김치 프리미엄. 환율차이(원달러 프리미엄 차이) 행은 잔여>₩50일 때만 |
| 경로 계산 로직 (매수/매도/알림 공통) | `path_graph.py` 엣지 엔진이 단일 코어. 매수=`paths_buy.py`, 매도=`paths_sell.py`, 알림=`paths_dynamic.py`. 제약/수수료 산식 변경은 `path_graph.py` 엣지에서 한 번에. |
| 출금 한도(min/max) 제약 | `path_graph.py:withdraw_leg()` — 세 계산기의 모든 출금이 통과. min 미달/max 초과 시 `Blocked` → `disabled_paths` 사유. **단 `split_on_max=True`이면 max 초과 시 차단 대신 `ceil(수량/max)`회로 분할 출금(수수료 × 횟수)**. |
| 새 거래소 추가 | `backend/app/domain/exchanges/profiles.py` (ExchangeProfile 엔트리 추가) + `fee_checker.py` (TRADING_FEES, GROUPS — CLI 겸용이라 별도 유지), `market_core.py` |
| Lightning 경로 | `paths_buy.py:_build_lightning_paths()` + `path_graph.py:swap_leg()`, `lightning_scraper.py`. **글로벌 LN 출금은 1회 한도(예: 바이낸스 0.01 BTC) 초과 시 `withdraw_leg(split_on_max=True)`로 분할(`_ln_num_txs()` = ceil), 수수료 × 횟수 적용. 경로의 `num_withdrawal_txs`/컴포넌트 amount_text에 "N회" 표기.** |
| 출금 수수료 | `crawl_service.py`, `repositories.py`, `WithdrawalFeeSnapshot` |
| 출금 수수료 정적값/출처 표시 | 정적값: `fee_checker.py` `_COINBASE_BTC_WITHDRAWAL_FEE_BTC`(코인베이스 BTC). 출처 라벨: `market_core.py:withdrawal_source()`+`STATIC_WITHDRAWAL_FEE_KEYS`. 어드민 표시: `admin/WithdrawalFeePanel.tsx`(국내/해외 탭, 거래소별 BTC/USDT 수수료 sats + `WD_SOURCE_META` 뱃지: 정적/실시간 API/스크래핑). 테스트 `tests/test_market_core.py`. |
| 라이트닝 지원 표시 | `ExplorerPage.tsx` `globalSupportsLightning()` — 실제 byGlobal[g] LN 경로로 유도 (정적 GLOBAL_INFO.lightning 미사용) |
| Admin 데이터 갭("조치 필요") | `market.py:get_crawl_status` `data_gaps`(enabled+fee=None), `admin/CrawlStatusPanel.tsx` 조치 필요 패널, `api.ts` 타입 |
| 결과 페이지 단계별 이동수량/잔돈 | `path_graph.py`/`paths_buy.py` 각 leg·글로벌출금 component가 `fee_component(move_amount/move_coin/move_amount_krw)` 채움 → `breakdown.components`. 잔돈은 `min_order_registry.calc_discarded_krw` → path `discarded_krw`. 프론트 표시 `ResultStep.tsx` 수수료 내역(항목별 금액·비율은 항상 노출, 항목마다 '자세히' 토글(`expandedFees` Set)로 세부 펼침: 이동 N코인≈₩, 출금 네트워크, 수수료 계산식, 출처 링크). 최소주문 잔돈 행. 타입 `types.ts` `CheapestPathFeeComponent`/`CheapestPathEntry` |
| 경로 시나리오 회귀 테스트 | 매수 `tests/test_paths_buy_scenarios.py` (5종 + 직접LN + 트래블룰 + max한도). 매도 `tests/test_paths_sell.py` + `tests/test_sell_lightning_strike.py` (max한도 포함). 알림 동등성 `tests/test_paths_dynamic_equiv.py` (수치 베이스라인 고정). |
| 엣지 엔진 단위 테스트 | `tests/test_path_graph.py` (매수/매도 엣지 + 어댑터 + maker + 제약 통과/위반) |
| 종착지(개인지갑/라이트닝 지갑) | 백엔드 `paths_buy.py`: `find_cheapest_path_from_snapshot_rows`에서 경로마다 `destination` 태깅(`__direct__`=`lightning_wallet`, 그 외=`personal`). LN 직접출금(`swap=None`→`__direct__`, LN 출금까지만)=라이트닝 지갑 종착. 프론트: 추천 리스트 `RecommendationStep` 종착지 토글 필터(`destinationFilter`) + `routeText` 종착 라벨, 마법사 `flow.ts`(`destination` phase)+`DestinationStep.tsx`+`ExplorerContext`(`destination` state, `resultPath`/`swapServiceOptions`/`lightningExitInfo` 분기), 결과 `ResultStep`(종착 노드 라이트닝지갑/내지갑). 타입 `types.ts` `CheapestPathEntry.destination`. 개인지갑 모드엔 `__direct__` 미노출, 라이트닝 지갑 모드엔 스왑·온체인 미노출 |
| 출금 한도 동적 업데이트 | `fee_checker.py` `scrape_korea_withdrawal_limits()` + `_pw_scrape_upbit_limits()` → 업비트 guide 페이지 스크래핑 → `KoreaWithdrawalLimitSnapshot` DB 저장 → `/market/withdrawal-limits/latest` API → `ExplorerPage.tsx` `withdrawalLimits` state로 동적 표시 |
| UI 단계 추가 | ① `explorer/steps/XStep.tsx` 작성(`useExplorer()` 소비) → ② `explorer/registry.tsx`의 `STEP_REGISTRY`에 등록 → ③ `explorer/flow.ts`의 `Phase` 타입 + `FLOW` 배열에 끼워넣기. 세 곳만 수정. |
| UI 단계 순서/경로 변경 | `explorer/flow.ts`의 `FLOW` 배열 next(state)만 수정 (handleNext/handleBack 자동 반영) |
| API 캐시 조정 / 동시접속 성능 | `market.py` `_TtlCache`(ttl + `get_or_compute` single-flight). cheapest TTL=3600초(키 run_id 포함, 크롤 시 `invalidate_status_cache`→clear). 크롤 후 워밍은 `main.py:_auto_crawl_loop`→`warm_cheapest_path_cache`. DB 풀 `session.py`(pool_size=10/overflow=20). gzip `main.py` GZipMiddleware. 단일 워커 유지(`scripts/start.sh` 주석). |
| DB 스키마 변경 | `models.py` → alembic revision → `repositories.py` |
| KYC 상태 | `kyc_registry.py`, `market.py` (_enrich_path_payload_with_kyc) |
| CARF 시행 연도 표시 | DB 권위 소스: `/market/carf-exchanges`(`carf_seed.py` `carf_first_exchange`) → `api.ts` `getCarfExchanges` → `ExplorerContext` `carfMap`(id→연도) → `DomesticStep`/`GlobalStep` `carfMap[id] ?? info.carf`(정적 `constants.ts` fallback) |
| 프론트 API 호출 | `api.ts` |
| 타입 수정 | `types.ts` (백엔드 응답 구조 변경 시 동기화 필수) |
| 게시판 기능 | 백엔드 `board.py`(라우트)+`board_repository.py`(ORM)+`models.py`(BoardPost/BoardComment)+`core/security.py`(비번 해시 pbkdf2). 프론트 `pages/board/*`+`App.tsx`(라우팅)+`api.ts`(getBoardPosts 등)+`types.ts`(Board*). 공지 작성=AdminPage `board` 탭(`AdminNoticePanel`). |
| 제보하기 링크 | `RecommendationStep`/`ResultStep`에서 `buildReportQuery()`로 `/board/new?template=report&...` 이동 → `BoardWritePage`가 `reportTemplate.ts`로 제목/본문 프리필. |
| 게시판 진입점 | `ExplorerPage.tsx` 헤더의 "게시판" 링크(`/board`). |
