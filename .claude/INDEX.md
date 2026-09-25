# exchange-fee 코드베이스 인덱스

> **새 세션 시작 시 반드시 이 파일을 먼저 읽고 작업 대상 파일만 Read 한다.**  
> 코드를 변경할 때마다 이 파일을 동기화한다 (MANDATORY).

## 프로젝트 한 줄 요약

한국 거래소와 개인 BTC 지갑 사이를 오갈 때 최저 수수료 경로를 찾는 서비스.  
두 방향을 모두 다룬다. **살 때**(mode=buy)는 원화로 사서 개인 지갑으로 받는 경로,
**팔 때**(mode=sell)는 개인 지갑에서 보내 원화로 받는 경로다.
UI는 단계별 마법사 형태이고, 첫 화면 세그먼트로 방향을 고른다.
백엔드는 크롤링 스냅샷 기반 경로 계산.

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
| `fee_checker.py` | 거래소 API 직접 호출 코어. **`fetch_bithumb_deposit_status(coin)` / `fetch_korbit_deposit_status(coin)` — 국내 거래소가 지금 그 체인으로 입금을 받는지.** 출금 가능 여부와 별개 신호다. 빗썸은 `isDepositAvailable` 을 그대로 쓰지 않고 **중단 사유가 비어 있는지도 함께 본다** — 전수 조사(524개 망 행)에서 사유가 붙은 53개는 플래그가 양방향으로 어긋났고 안내문은 일관되게 입출금이 함께 막혔다고 말한다(USDT/Aptos 는 `isDepositAvailable=true` 인데 안내문이 'disabled withdrawals and deposits'). 디지털엑스는 `depositStatus` 가 출금과 독립적이고 모호함이 없어 그대로 쓴다. 업비트·코인원·고팍스는 공개 입금 상태 API 가 없어 수집하지 않는다. `TRADING_FEES`, `GROUPS` (korea 5개 / global 7개), `ALL_EXCHANGES` 상수 정의. global: binance/okx/bybit/bitget/kraken/coinbase/gate. `_STATIC_WITHDRAWAL_OVERRIDES` 레지스트리 — API 미제공 출금 메타데이터 보강(OKX Lightning 등). `_GATE_FEES` — Gate.io 정적 출금 수수료. **`_COINBASE_BTC_WITHDRAWAL_FEE_BTC`(0.0001 BTC=10,000 sats) — 코인베이스 BTC 출금 정적 등록값(공개 API 미제공, 개인계정 Exchange API 불가 → 멤풀 추정 폐기). 실제값 변경 시 이 상수만 수정.** market_core.py가 import해서 사용. |
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
| `paths_buy.py` | **얇은 매수 오케스트레이터.** `find_cheapest_path_from_snapshot_rows()` — 컨텍스트 빌드 → `paths/` 레지스트리 순회(거래소별+집계) → 후처리(종착지 태깅/정렬/응답 envelope). **`best_path`/`top5`는 disabled(강제계산) 경로 제외, `all_paths`에는 유지.** `_build_available_filters()`(paths_sell가 import). 빌더 본체는 `paths/` 패키지에 위임. |
| `korea_deposit_policy.py` | **국내 거래소 입금 정책 단일 기준 (팔 때 전용).** 세 축을 담는다. 앞의 둘은 '누가 보내는가'를, 마지막은 '어느 체인으로 오는가'를 따진다. `PERSONAL_WALLET_POLICIES`(거래소별 기준 금액·등록 가능 개인지갑·그중 비트코인을 담을 수 있는 지갑·미등록 시 처리) + `VASP_DEPOSIT_POLICIES`(해외 거래소발 입금을 자동 반영하는 목록 `auto_deposit` 과 증빙 심사를 거치는 목록 `review_required` 분리) + **`USDT_DEPOSIT_NETWORK_POLICIES`**(거래소별 USDT 입금 가능 네트워크. 키는 `path_helpers.normalize_usdt_network()` 어휘). **`usdt_deposit_network_gate(exchange, network_label, live_enabled=None)`** — 두 축을 함께 본다. 정적 정책이 '이 망을 지원하는가'를, `live_enabled`(크롤 수집값)가 '지금 열려 있는가'를 답한다. 확인된 망이고 실시간이 True 이거나 모름(None, 수집원 없는 거래소)이면 None. 확인된 망인데 실시간이 False 면 `blocked`('거래소 점검으로 입금 중단'). 목록 밖이면 `exhaustive` 에 따라 `blocked`(받지 않는 것이 확인됨) 또는 `unknown`(확인하지 못함). **실시간 값은 정적 목록을 닫기만 하고 열지 못한다** — API 에 보이는 망이라도 지원을 확인하지 못했으면 추천하지 않는다. 해외 거래소가 그 체인으로 출금할 수 있다는 사실은 국내 거래소가 그 체인으로 입금 주소를 발급한다는 뜻이 아니라서 별도 축이 필요하다. 2026-09-20 확인 기준: 빗썸 trc20·erc20·kaia·aptos(전수 API), 코빗 trc20·erc20(전수 API), 코인원 trc20(고객센터 전수), 업비트 trc20·erc20·aptos·kaia(공지 누적이라 `exhaustive=False`), 고팍스 trc20(자산 API 가 자산당 망 1개만 표현해 `exhaustive=False`). **거래소별 차이**: 업비트의 등록 가능 개인지갑(메타마스크·카이아·팬텀·폴카닷·케플러)은 모두 비트코인 온체인 주소를 만들지 못해 BTC 직접 입금이 `blocked` 다. 나머지 네 곳은 렛저 나노·디센트·트러스트월렛·삼성 블록체인 월렛을 목록에 두고 있어 `required`(등록하면 가능할 수 있음)다. 다만 거래소가 그 지갑들의 **비트코인 네트워크 주소**까지 등록받는지는 확인하지 못했고, 안내 문구가 그 사실을 밝힌다. 해외 거래소 쪽은 빗썸이 Gate 를, 고팍스가 바이비트·크라켄·코인베이스를 목록에 두지 않아 `blocked` 이고, 크라켄·코인베이스는 **업비트를 포함한 네 곳 모두에서** `review` 다 — 업비트 VASP 리스트가 이 둘을 '위험평가 통과 해외 가상자산사업자' 등급으로 두고 입금 방식을 '수동 입금 반영(입금 출처 증빙 승인 후 반영)'으로 밝힌다. 자동 반영되는 '계정주 확인 연동' 등급은 바이낸스·OKX·바이비트·비트겟·게이트다. **원칙**: 근거를 확인하지 못한 값은 채우지 않는다. 추정치를 넣으면 실행 가능성을 잘못 보장하게 되고 그 피해는 자산이 묶이는 형태로 나타난다. **주의**: 코빗은 미래에셋에 인수되어 사명이 디지털엑스(Digital X)로 바뀌었다(거래소 id 는 `korbit` 유지). **2026년 규제 변화**: FIU 시행령 개정으로 트래블룰 100만원 기준이 폐지될 예정이라 시행 시점에 `threshold_krw` 를 모두 `None` 으로 바꿔야 한다. 테스트 `tests/test_korea_deposit_policy.py`(54케이스). |
| `paths_sell.py` | 엣지 체인 기반 매도 경로 계산 (웹). `find_cheapest_sell_path_from_snapshot_rows()` — `korea_sell_leg`/`global_sell_leg`/`withdraw_leg`(min/max 적용)/`swap_leg`(onchain_to_ln). mempool 지갑 수수료·capability 게이팅 유지. **USDT→원화 시세**: `usdt_krw_rate` 인자(라우터가 `_current_usdt_krw_rate()` 로 업비트 USDT/KRW 를 주입)로 국내 USDT 매도·USDT 출금 수수료·해외 매도 수수료를 평가한다. 주입되지 않으면 포렉스로 폴백한다. 응답에 `usdt_krw_rate` 를 싣는다. **수수료 원화 평가 기준**: BTC 로 떼이는 수수료(지갑 채굴 수수료·스왑 수수료)는 그 경로에서 BTC 가 최종적으로 팔리는 시세로 평가한다(`btc_fee_krw()`). 국내에서 파는 경로 1·3 은 국내 BTC 시세, 해외에서 파는 경로 2·4 는 `해외 BTC 시세 × 국내 USDT 시세`다. 그래서 `krw_received + total_fee_krw` 가 보낸 BTC 의 평가액과 일치한다. **라이트닝 수신 주체**: 경로 3(`lightning_direct`)은 국내 거래소의 `supports_lightning_deposit` 을, 경로 4(`lightning_via_global`)는 **해외 거래소의** `supports_lightning_deposit` 을 본다. 경로 2·4 의 뒷부분(해외 매도 → USDT 출금 → 국내 전환 + 입금망 관문)은 내부 함수 `usdt_tail()` 이 공유한다. **BTC 직접 경로 후보 망**은 `is_bitcoin_native_network()` 로 거른다(라이트닝·BEP20 등 래핑 BTC 망은 개인 온체인 지갑이 보낼 수 없어서 후보도 비활성 목록 대상도 아니다). **입금 관문**: 경로마다 `deposit_gates` 를 붙인다 — 국내 거래소가 그 입금을 받아주는지는 수수료로 드러나지 않지만 경로의 실행 가능성을 가른다. 판정은 `korea_deposit_policy.py` 에 위임하며, 보내는 쪽에 따라 셋으로 갈린다(개인지갑=`personal_wallet_gate`, 해외 거래소=`vasp_gate`, 라이트닝 스왑 서비스=`third_party_deposit_gate`). 앞의 두 함수는 기준 금액 판정을 위해 **입금되는 금액의 원화 환산가**를 받는다 — BTC 직접은 매도 전 평가액, USDT 경유는 국내로 들어오는 USDT 의 원화 환산가다. **USDT 입금망 제약**: USDT 를 거치는 두 경로(`usdt_via_global`/`lightning_via_global`)는 출금 정지 검사 직후 `usdt_deposit_network_gate()` 를 거치고, 국내 거래소가 받아주는 것이 확인되지 않은 체인이면 경로를 만들지 않고 `_add_disabled()` 로 사유를 남긴다. **실시간 입금 상태**는 `deposit_status_rows` 인자로 받아 `(거래소, 코인, 정규화된 망)` 맵으로 만든 뒤 게이트에 넘긴다(`_deposit_enabled()`). 거래소마다 같은 체인을 다르게 표기해서(빗썸 `TRC20` 대 OKX `Tron (TRC20)`) `normalize_usdt_network()` 로 맞춘다. **BTC 직접 경로(경로 1)도 입금 기준으로 판정한다** — 파는 방향에서 그 구간은 거래소로 보내는 입금이라 국내 거래소의 출금 플래그(`row.enabled`)나 출금 수수료를 보지 않는다. 그 루프는 지원 망 이름을 얻으려고 도는 것이다. 관문 dict 를 `deposit_gates` 에 넣지 않는 이유는 경로 자체가 생성되지 않기 때문이다(프론트엔드 수정 없이 추천 목록과 네트워크 선택 화면이 함께 정리된다). **`_add_disabled()` 의 중복 제거 키에 `korean_exchange` 가 들어간다** — 출금 정지는 국내 거래소와 무관하지만 입금망 제약은 거래소마다 다르고, 화면이 `korean_exchange` 로 걸러 읽으므로 거래소를 빼면 먼저 기록된 한 곳만 사유가 남는다. **응답 엔트리에 `network_key`**(USDT 경로만, `normalize_usdt_network()` 결과. BTC 경로는 None)를 실어 보낸다 — 해외 거래소마다 같은 체인을 다르게 표기해서(`Tron (TRC20)` 대 `TRC20`) 화면이 망 단위로 묶거나 거를 때 표기 차이에 흔들리지 않게 하려는 것이다. |
| `paths_context.py` | `SnapshotContext` dataclass + `build_snapshot_context()` — buy/sell 공통 스냅샷 컨텍스트. `usd_krw_rate`(포렉스, 표시·USD환산) + `usdt_buy_krw_rate`(한국 USDT/KRW, USDT 매수 leg 기준; 미주입 시 포렉스 폴백) 분리 보유 |
| `path_helpers.py` | 경로 계산 공통 유틸: `fee_component`, `is_suspended`, `normalize_usdt_network`, `is_bitcoin_native_network`, `resolve_global_onchain_wd_fee`, `_build_path_id` |
| `korea_exchange_registry.py` | **thin wrapper** — `exchanges/profiles.py`에서 `SLIPPAGE_PROFILES`/`WITHDRAWAL_LIMITS`/`KOREA_EXCHANGE_RISKS` 파생. `get_withdrawal_limits()`/`get_slippage()`/`get_exchange_risk()`/`slippage_adjusted_price()`/`risk_warning_lines()`/`withdrawal_limit_line()` 헬퍼 유지. |
| `min_order_registry.py` | **thin wrapper** — `exchanges/profiles.py`에서 `KOREA_MIN_ORDER_KRW` 파생. `get_min_order_krw`/`calc_discarded_krw` — 매수 잔돈(`discarded_krw`) 근사 계산. |
| `carf_registry.py` | **thin wrapper** — `exchanges/profiles.py`에서 `EXCHANGE_JURISDICTIONS` 파생. `get_carf_exchange_status()` 계산 로직 유지. |
| `notice_match.py` | **공지 제목 관련성 매칭 SSoT (순수 텍스트, I/O 없음).** 스크래퍼(`notice_scraper`)와 저장소(`repositories`)가 공유 — 키워드가 두 계층에 중복되면 한쪽만 고쳐도 오탐이 남기 때문에 단일화. `network_keywords(label, coin)` — 네트워크 라벨을 공지에서 찾을 별칭 집합(`_NETWORK_ALIASES`: TRC20↔Tron, ERC20↔Ethereum, Kaia↔Klaytn 등). 라벨 표기와 공지 표기가 어긋나 사유 공지를 놓치는 문제를 막는다. `_shared._find_notice`도 이 함수를 쓴다. `is_suspension_notice(title)` — 중단·재개·점검 공지인지 판정(`SUSPENSION_KEYWORDS`). `BTC_KEYWORDS`/`MAJOR_KEYWORDS`/`FEE_KEYWORDS` + `keyword_in_title()`(BTC/USDT 티커는 라틴 문자 전후방탐색 `(?<![a-z])…(?![a-z])`으로 "HUSDT"·"BTCUSDT" substring 오탐 차단, 한글 조사 "BTC를"은 허용)/`has_btc`/`has_usdt`/`is_relevant_title(include_fee=)`. |

#### `backend/app/domain/paths/` (매수 경로 빌더 패키지 — 경로 타입별 분리 + 레지스트리)

| 파일 | 역할 |
|------|------|
| `__init__.py` | `BuilderContext`/`BuildResult` + `PER_EXCHANGE_BUILDERS`/`AGGREGATE_BUILDERS` re-export. |
| `base.py` | `BuilderContext`(빌더 공유 입력: ctx/amount_krw/global_exchange/사전계산 글로벌출금 fee·**row**·usdt_nets·lightning_swap_rows) + `BuildResult(paths, disabled)` dataclass + 공유 헬퍼(`_get_korean_taker`/`_force_calc_withdraw`/`_ex_ko`/`_EXCHANGE_KO`). |
| `chain.py` | **공용 진입 체인 + 글로벌 온체인 종료 엣지 (단일 구현).** `Entry` dataclass + `iter_btc_entries(mode='direct'/'via')`(매수→국내 BTC 출금; direct=트래블룰 분할+forced-calc disabled, via=VASP行 스킵) + `iter_usdt_entries(include_disabled=)`(매수→USDT 출금→글로벌 BTC 매수) + `global_onchain_exit()`(withdraw_leg 통일 검증+sats 표기). 진입 체인 로직 변경은 여기 한 곳만. |
| `btc_direct.py` | `build_btc_direct(bctx, exchange)` — BTC 직접 온체인 출금 경로. `iter_btc_entries('direct')` 소비 후 dict 조립만. |
| `btc_via_global.py` | `build_btc_via_global(bctx, exchange)` — 국내 BTC→글로벌 경유→온체인 경로. `iter_btc_entries('via')` + `global_onchain_exit()`(min/max/suspension 검증, split_on_max). Blocked 시 disabled_paths 기록. |
| `usdt.py` | `build_usdt(bctx, exchange)` — USDT 경유→글로벌 BTC 매수→온체인 경로. `iter_usdt_entries(include_disabled=True)` + `global_onchain_exit()`. **글로벌 BTC 온체인 행 미수집 시 경로 미생성**(수수료 누락 경로 금지, btc_via_global과 동일). |
| `lightning.py` | `build_lightning(bctx)` — **집계 빌더**(내부 거래소 순회). LN exit 경로(USDT/BTC→글로벌→LN, 스왑/직접). 진입 체인은 `chain.py` 반복자 재사용, LN 고유부(`_resolve_global_ln_row`/`_ln_num_txs`/`_ln_withdraw`/`_apply_swap`)만 보유. |
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
| `crawl_service.py` | `CrawlService.run_full_crawl()` — 모든 거래소 데이터 수집 → DB 저장. Ticker, 출금수수료, 네트워크상태, Lightning 수수료 포함. `_crawl_korea_deposit_status(crawl_run)` — 빗썸·디지털엑스의 체인별 입금 가능 여부를 `DepositStatusSnapshot` 으로 저장한다. 한 거래소가 실패해도 나머지는 저장하고 `CrawlError` 만 남긴다 — 이 데이터가 없으면 정적 정책만 보는 기존 동작으로 돌아갈 뿐이라 크롤 전체를 실패시킬 이유가 없다. `_detect_network_changes(prev_rows, new_rows)` — 이전/현재 네트워크 상태 비교로 정지/재개 변경 감지. `_fetch_and_save_targeted_notices(crawl_run, prev_rows, new_rows)` — 변경 감지 시 관련 거래소 공지 자동 탐색. |
| `lightning_scraper.py` | Lightning 스왑 서비스 실시간 수수료 스크래핑 (Boltz, Coinos, Bitfreezer, WalletOfSatoshi, Strike, Oksusu). 행마다 `direction`(`ln_to_onchain`=살 때, `onchain_to_ln`=팔 때)이 붙는다. **온체인→라이트닝(팔 때) 서비스**: Boltz submarine(API), Strike(0% 정적), **Coinos**(`fetch_coinos_onchain_to_ln_fees`), **WalletOfSatoshi**(`fetch_wos_onchain_to_ln_fees`). Coinos 는 수수료 API 가 없어 공식 UI 저장소 `coinos-ui/src/locales/en.json` 의 FAQ 문장('0.4% fee for Bitcoin or 0.1% for Lightning')을 `_fetch_coinos_withdraw_rates()` 가 파싱해 양방향에 쓴다(받은 망과 다른 망으로 내보낼 때만 붙는 요율. 실패 시 확인값 0.4/0.1 폴백). WoS 온체인 입금 수수료는 지원 문서 본문에서 읽는다 — **`<head>` meta description 에 옛 값 '1%' 가 남아 있어 `</head>` 이후만 파싱한다**(확인값 1.95% 폴백). `get_all_lightning_swap_fees()` 는 활성 서비스의 `fee_fixed_sat` 을 mempool 채굴 수수료 추정치로 덮어쓰는데, `_NO_NETWORK_FEE_KEYS`(Coinos·WoS 의 `onchain_to_ln`)는 제외한다 — 사용자가 보내는 온체인 트랜잭션 비용은 매도 경로가 지갑 수수료로 따로 넣어 이중 계산이 되기 때문이다. 실패 행(`_error_result`)도 `direction` 을 남긴다(Boltz submarine 포함). 테스트 `tests/test_lightning_scraper_directions.py`. |
| `promo_scraper.py` | FDUSD 0% maker 프로모션 등 스크래핑 |
| `kyc_registry.py` | 거래소/서비스별 KYC 상태 레지스트리. `resolve_exchange_asset_kyc_status()` 우선순위: DB `kyc_config`(거래소_자산 키) → 스크래핑 note 추론 → **`_STATIC_EXCHANGE_KYC`**(국내 5+해외 7 전부 `kyc` 고정 — 특금법/ToS 근거, DB에 개별 오버라이드 있으면 그쪽 우선). 라이트닝 서비스는 `resolve_service_kyc_status()` + `_STATIC_KYC`(서비스별 kyc/non_kyc). |
| `notice_scraper.py` | 거래소 BTC/USDT 관련 공지 스크래핑. `fetch_notices_for_exchange(exchange, extra_keywords)` — 변경 감지 시 특정 거래소+키워드 타깃 탐색. **키워드 매칭은 `domain/notice_match.py`(SSoT)에 위임** — `_is_relevant`/`_is_relevant_for_binance`/`_keyword_in_title`는 얇은 위임 래퍼. `_binance_catalog_filter`도 `has_btc`/`has_usdt`/`FEE_KEYWORDS` 공유 사용. 관련 공지 0건이면 프론트(InputStep)가 링크 영역 자동 숨김. **거래소별 수집 방식: upbit/coinone/binance/bithumb 은 공개 JSON API(`requests`), korbit 은 페이지가 홈으로 리다이렉트되어 수집 불가(빈 목록 반환).** `fetch_bithumb_notices()` — `https://api.bithumb.com/v1/notices?count=20`(302 → feed-api). 응답은 객체로 감싸지 않은 **최상위 배열**이고 항목은 `categories`/`title`/`pc_url`/`published_at`/`modified_at`. **count 최대 20, 초과 시 기본값 5건으로 줄어듦. IP당 초당 1회 제한.** 시각은 시간대 표기 없는 한국 시간이라 `_parse_bithumb_datetime()`이 KST로 해석 후 naive UTC로 변환(모듈 규약, `_parse_iso`와 동일). **HTML 스크래핑(Scrapling)에서 API로 교체됨 — feed.bithumb.com 페이지가 데이터센터 IP에 403을 반환해 배포 서버에서 빗썸 공지가 0건이었고, 그 탓에 출금 중단 행의 사유가 공지 링크로 연결되지 않았다.** |
| `mempool_service.py` | mempool.space API 연동 (Bitcoin 네트워크 수수료) |
| `exchange_status_builder.py` | `/market/status` 응답 빌더 |
| `live_market.py` | **MCP 도구 전용 파사드.** `mcp/server.py`가 단일 진입점으로 사용. market_core + market_paths 모든 함수/상수 re-export. 내부 백엔드 코드(market.py, crawl_service.py, exchanges.py)는 각 도메인 모듈을 직접 import — live_market.py를 경유하지 않음. |

#### `backend/app/db/`

| 파일 | 역할 |
|------|------|
| `models.py` | SQLAlchemy 모델 전체 정의 |
| `board_repository.py` | 게시판(BoardPost/BoardComment) ORM 접근 계층. list_notices/list_posts(페이지네이션)/get/create/update/delete + comment_counts + 댓글 CRUD. |
| `repositories.py` | DB 조회 함수 전체 (get_latest_successful_run, list_ticker_snapshots_for_run 등). `get_prev_run_network_status(db, crawl_run_id)` — 현재 크롤 이전의 최근 성공 크롤 네트워크 상태 반환. `get_recent_network_changes(db, hours=24)` — **WithdrawalFeeSnapshot.enabled 기반** 24시간 내 연속 크롤 쌍 비교로 suspended/resumed 변경 감지 + 관련 공지 첨부. **공지 첨부/`get_latest_relevant_notices`는 SQL ILIKE를 coarse 프리필터로만 쓰고 `notice_match`로 후처리(쿼리 시점 필터라 기존 DB 행도 즉시 교정, 재크롤 불필요). 첨부 정밀 필터 `_notice_matches_change(title, coin, network_words)` — coin AND network 둘 다 매칭해야 관련 인정(coin만 든 KGST/USDT 캠페인·USDT/KZT 페어 등 노이즈 차단; network는 토큰 중 any). 티커는 `keyword_in_title` 라틴 경계라 'USDT'≠'HUSDT'.** 네트워크 별칭은 `notice_match.network_keywords()`가 SSoT다(라벨 'TRC20' vs 공지 'Tron'). `get_withdrawal_disabled_since(db, keys)` — **출금 중단이 언제부터 이어지는지 산출.** `get_recent_network_changes`가 최대 72시간 창만 보는 한계를 보완해, 창 제한 없이 전체 스냅샷 이력을 역추적한다. 키별로 마지막 `enabled=True` 크롤 id를 구한 뒤 그 이후 첫 `enabled=False` 관측 시각을 중단 시작으로 본다(`exact=True`). 활성 관측이 아예 없으면 보존된 가장 오래된 비활성 관측 시각을 하한값으로 주고 `exact=False`로 표시. `_unix_ts_utc()` — naive datetime을 UTC로 간주해 변환(SQLite 개발 환경에서 9시간 어긋나는 문제 방지). `get_notices_for_disabled_networks(db, keys)` — **중단 사유 공지를 창 제한 없이 검색.** coin AND network(별칭 포함) AND `is_suspension_notice` AND 시간범위 4조건을 모두 만족하는 공지만 최신순 3건 반환. `is_suspension_notice`가 없으면 BTC처럼 네트워크 키워드가 코인 심볼과 겹칠 때 프로모션·상장 공지가 통과한다. 시간범위(`_notice_within_window`, 중단 시작 기준 이전 14일~이후 2일)가 없으면 같은 네트워크의 지난번 중단 공지가 붙는다 — 제목이 매번 같아 구분되지 않기 때문. `disabled_since` 인자를 주지 않으면 시간 조건은 건너뛴다. `record_visit(ip)` — IP 기준 하루 1회 방문자 카운트. `record_route_request()` — 경로 탐색 요청 카운트. |
| `session.py` | DB 세션 팩토리 (`get_db` 의존성 주입) |
| `repositories.py` 의 `list_deposit_status_for_run(db, run_id)` | 국내 거래소 입금 가능 여부 스냅샷 조회. 수집원이 있는 거래소(빗썸·디지털엑스)만 행이 있고, 없는 거래소는 조회 결과가 비어 `None`(모름)으로 해석된다 |
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
| `DepositStatusSnapshot` | 국내 거래소가 그 체인으로 입금을 받는지 (exchange, coin, network_label, enabled, reason, message). **출금 테이블과 분리한 이유**: 두 값이 자주 어긋나고(빗썸 USDT/Aptos 는 입금만 열림), 입금을 받는 망 목록과 출금 지원 망 목록도 다르다(디지털엑스는 USDT 출금 행이 하나뿐인데 입금은 두 망). 수집원이 있는 빗썸·디지털엑스만 행이 있다 |
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
| `src/pages/ExplorerPage.tsx` | **얇은 컨트롤러 (~90줄)**. `ExplorerProvider` + `ExplorerShell`(헤더/푸터) + `StepTimeline`(진행 타임라인) + `StepFrame`(현재 phase의 모션 래퍼). 실제 단계 UI는 `explorer/steps/*`에 위임. |
| `src/pages/explorer/timeline.ts` | **마법사 진행 타임라인 순수 로직.** `timelinePhases(sel, current, mode)` — `flowNext()`를 반복 적용해 실제로 거쳐온 단계 목록 산출(분기 규칙은 `flow.ts` 그래프 단일 기준, 여기서 재정의 안 함). `buildTimeline(sel, current, mode)` — 단계별 라벨/선택값(한글)/파비콘 id/상태(done·current) 생성. **`SELL_PHASE_LABEL` 이 방향이 뒤집히는 단계만 라벨을 덮어쓴다(`출금 방식`→`전송 방식`).** `timeline.test.ts`(13케이스). |
| `src/pages/explorer/StepTimeline.tsx` | 마법사 상단 가로 진행 타임라인 UI(표시 전용). 완료 단계 체크 아이콘 + 거래소 파비콘 + 단계명/선택값 2줄 칩, 현재 단계는 브랜드 액센트로 강조. 단계 1개 이하면 렌더 안 함, 가로 스크롤 지원. |
| `src/pages/explorer/flow.ts` | **순서/경로 정의 (Single Source).** `Phase`·`CoinType`·`Destination` 타입, 방향별 그래프 `BUY_FLOW`/`SELL_FLOW`(각 단계 next(state)), `flowFor(mode)`, `flowNext`/`flowPrev`(모드 인자, 기본 `buy`), `PHASES`/`phaseIdx`. **순서·경로 변경 시 이 파일만 수정.** 살 때: `domestic→coin→(BTC→btc_method→result / BTC_GLOBAL→btc_method→global→…/ USDT→global→…)→global_exit_method→(lightning→destination→(lightning_wallet→result / personal→swap_service→result) / onchain→result)`. 팔 때: `domestic→coin→(BTC→btc_method→(lightning→swap_service / onchain→result) / USDT→global→network→global_exit_method→(lightning→swap_service / onchain→result))`. **팔 때는 종착지가 원화 계좌 하나뿐이라 `destination` 단계가 없고, 출발점이 이미 개인 지갑이라 `BTC_GLOBAL` 코인 선택지도 없다.** `flow.test.ts`(12케이스). |
| `src/pages/explorer/depositGate.ts` | **입금 관문 해석 (팔 때 전용).** 백엔드가 붙여 보낸 `deposit_gates` 를 화면이 어떻게 읽을지 정한다. `activeGates(p, walletRegistered)` — 사용자가 선언한 사전 조건을 반영해 남은 관문을 추린다(등록 선언은 `required` 만 없앤다. `blocked` 는 등록 가능한 비트코인 지갑이 없어서 생긴 제약이라 선언과 무관하고, `unknown` 은 선언으로 확인되지 않는다). `gateSeverity` / `isPathDemoted` / `sortByDepositGate`(수수료 정렬 뒤에 적용하는 별도 안정 정렬 단계 — 정렬 자체를 건드리면 살 때의 golden 회귀가 깨진다) / `GATE_BADGE` / `GATE_BADGE_CLASS`. `depositGate.test.ts`(12케이스). |
| `src/pages/explorer/pathMode.ts` | **모드별 경로 해석 단일 기준.** 매수·매도 응답은 envelope 은 같지만 엔트리 필드가 세 곳에서 다르다 — 수령량(`btc_received` 대 `krw_received`), 라이트닝 표시(`path_type === 'lightning_exit'` 대 `global_exit_mode === 'lightning'`), 종착지(`destination` 필드 유무). `receivedAmount(p, mode)` / `isLightningPath(p, mode)` / `usesGlobalExchange(p)`. **두 모드를 구분하는 판정을 화면마다 새로 쓰지 말고 여기를 쓴다.** `pathMode.test.ts`(12케이스). |
| `src/pages/explorer/modeStorage.ts` | **탐색 방향 보존.** `loadSavedMode(storage?)` / `saveMode(mode, storage?)` — `localStorage` 키 `explorer.mode` 에 마지막 모드를 저장·조회(접근 실패·알 수 없는 값이면 `buy`). `applyModeTheme(mode, root?)` — `<html data-theme>` 부착 단일 구현. `main.tsx` 가 첫 렌더 전에 호출해 탐색 화면 밖에서 새로고침해도 테마가 맞는다. `modeStorage.test.ts`(7케이스). |
| `src/pages/explorer/constants.ts` | 정적 데이터·헬퍼: `GLOBAL_EXCHANGES`, `DOMESTIC_INFO`, `GLOBAL_INFO`, `RISK_*`, `SPRING_*`, `AllData` 타입, `bestByBtc`/`fmtKst`/`fmtAmountText`. |
| `src/pages/explorer/ui.tsx` | 공용 컴포넌트: `ExFavicon`, `SectionLabel`, `Chip`, `OptionCard`, `LoadingScreen`, `GatemanPanel`. |
| `src/pages/explorer/ExplorerContext.tsx` | **상태·핸들러 허브.** `useExplorerValue()`에 결합 상태(선택/kimp/필터, `btcPrice`+`btcPriceLoading`=최초 kimp/live fetch 진행 플래그) + 핸들러(`handleSearch`/`handleBack`/`handleNext`/`reset`/`handleSelectRecommendedPath`). 파생값은 `derivations.ts` 순수 함수를 `useMemo`로 호출하고 **모드를 함께 넘긴다**, 거래소 메타데이터는 `useExchangeMetadata()`로 위임. `ExplorerProvider`/`useExplorer()` 제공. 타입은 `ReturnType<typeof useExplorerValue>` 추론. **탐색 방향 상태**: `mode`(buy/sell) + `setMode()`(전환 시 경로 데이터·선택·프리페치 캐시를 모두 버린다 — 남겨두면 이전 모드의 경로가 새 모드 목록에 섞인다), 매도 입력 `amountBtcInput`/`btcUnit`(BTC·sats)/`walletUtxoCount`, 파생 `amountBtc`/`inputReady`/`pathQuery`/`pathQueryKey`(**프리페치 캐시 키에 모드 포함** — 모드가 다르면 응답 구조가 달라 금액만으로 식별 불가). `mode` 초기값은 `modeStorage.loadSavedMode()`(마지막 선택)이고 `setMode()`가 `saveMode()`로 저장한다 — 게시판 등에서 홈으로 돌아오거나 새로고침해도 방향과 테마가 유지된다. `useEffect`가 `applyModeTheme()`로 `<html data-theme>`를 모드에 맞춰 갱신해 팔레트를 전환한다. 결과 카운트업 `displayReceived`는 살 때 사토시, 팔 때 원화를 센다. |
| `src/pages/explorer/derivations.ts` | **ExplorerContext 순수 파생 로직.** allData+선택값만으로 결정되는 순수 함수: `computeSnapshotKimp`/`computeDomesticBtcKrw`/`computeKoreaVolumeMap`/`computeDomesticOptions`/`computeCoinOptions`/`computeGlobalOptions`/`computeNetworkOptions`/`computeDisabledNetworkOptions`/`computeHasLightningPaths`/`computeGlobalSupportsLightning`/`computeCurrentLightningPaths`/`computeLightningExitInfo`/`computeSwapServiceOptions`/`computeResultPath`/`computeAltPaths`. 부수효과·React 의존 없음 → 단위 테스트 가능(`derivations.test.ts`, 매도 분기는 `sellPaths.test.ts`). **대부분의 함수가 마지막 인자로 `mode`(기본 `buy`)를 받는다.** `computeCoinOptions` 는 팔 때 `BTC_GLOBAL` 을 제외하고, `computeResultPath` 는 팔 때 `computeSellResultPath` 로 분기한다(BTC 직접 경로는 `btcMethod`, USDT 경유 경로는 `globalExitMethod` 가 '지갑에서 보내는 방식'을 쥐고, 국내 입금망이 거래소당 하나뿐이라 network 가 비어 있어도 계산된다). `computeSwapServiceOptions` 의 수령량 필드는 모드 중립 이름 `received` 다. **`computeNetworkOptions`는 `disabled`(출금 정지 강제계산) 경로를 정상 선택지에서 제외하고, `computeDisabledNetworkOptions`가 all_paths의 disabled 경로도 비활성 목록(사유 포함)으로 노출** — 정지 네트워크 선택 후 라이트닝 "경로 없음"으로 오해되는 문제 방지. |
| `src/pages/explorer/useExchangeMetadata.ts` | **거래소 메타데이터 fetch 훅.** `useExchangeMetadata()` — 마운트 1회 fetch로 `liveRegistry`/`cautionMap`/`carfMap`/`withdrawalLimits` 소유, read-only 노출. 탐색 상태와 결합 없음. |
| `src/pages/explorer/registry.tsx` | `STEP_REGISTRY`: `Phase → { Component, className }` 매핑. **새 단계 추가 = steps/XStep.tsx 작성 → 여기 등록 → flow.ts FLOW에 끼워넣기.** |
| `src/pages/explorer/recommend.ts` | **추천/필터 순수 로직 (단일 기준).** `flattenPaths`(byGlobal 평탄화), `recommendRouteKey`(dedup 키, USDT는 네트워크 제외), `dedupAndSortPaths(paths, mode)`(dedup+수수료오름차순), `filterRecommendedPaths`(제외 필터, `state.mode` 로 방향 인식). **수령량·라이트닝 판정은 `pathMode.ts` 헬퍼에 위임한다.** 팔 때는 종착지 필터를 적용하지 않는다(종착지가 원화 계좌 하나뿐이고 경로에 `destination` 필드도 없다). **`excludeUsdtNetworks(paths, keys)` / `usdtNetworkKeys(paths)` / `USDT_NETWORK_LABEL`** — 팔 때 USDT 입금망 제외. **이 필터만 dedup 앞에서 적용한다**(`ExplorerContext` 의 `topRecommendedPaths`): `recommendRouteKey` 가 USDT 경로에서 네트워크를 키에서 빼기 때문에 (국내, 해외) 조합당 가장 싼 망 하나만 대표로 남는데, dedup 뒤에서 그 대표를 빼면 조합 자체가 사라지고 다음으로 싼 망이 올라오지 않는다. 칩 목록도 dedup 전 `allPaths` 에서 뽑아야 제외한 망의 칩이 사라지지 않는다. ExplorerContext의 allPaths/allRecommendedPaths/topRecommendedPaths가 이 함수들을 호출. **dedup 대표 선택은 `isBetterRepresentative()` — 활성 경로가 중단(disabled) 경로를 항상 이기고, 동일 상태에서만 btc_received 비교. USDT는 라우트키에 네트워크가 없어 한 거래소의 네트워크들이 한 키로 합쳐지는데, 중단 네트워크는 수수료 강제계산으로 수령량이 크게 나와 대표가 되면 쓸 수 있는 네트워크가 통째로 가려진다.** **로직 변경 시 golden 회귀 테스트가 감지 — oracle(`scripts/gen_recommend_golden.py`)도 같은 규칙을 복제하므로 함께 수정 후 golden 재생성.** |
| `src/pages/explorer/recommend.test.ts` | recommend.ts golden 회귀 테스트(Vitest, 32케이스). fixture에 실제 로직 적용 결과를 golden과 대조 — dedup 정렬 전체 순서 + 필터 27시나리오 count/top + 경로 내부 일관성. |
| `src/pages/explorer/disabledNetworks.ts` | 첫 페이지 "네트워크 비활성 목록" 순수 필터 로직. `filterDisabledWithdrawals()` — `withdrawal-fees/latest` items에서 출금 비활성(enabled=false) + BTC/USDT(`STATUS_COINS`)만 추려 거래소→코인→네트워크 정렬·dedup. `isLegacyBtcNetwork()`로 레거시 BTC 온체인 망(라벨에 segwit/legacy/p2sh 포함, native/lightning 제외; 예 바이낸스 'BTC (SegWit)')은 제외 — 네이티브 'Bitcoin' 망이 멀쩡한데 레거시만 비활성이라 혼란 주는 행 숨김. `formatDisabledDuration(sinceTs, nowTs, {exact})` — 중단 경과 시간 문구 생성(`방금`/`N분째`/`N시간째`/`N일 M시간째`). `exact=false`면 하한값이므로 `최소` 접두사를 붙인다. `formatSuspensionReason(reason)` — 거래소 API의 영문 사유를 한국어로 옮긴다(`SUSPENSION_REASON_KO` 매핑). 매핑에 없는 값은 임의 번역 없이 원문 그대로 노출한다. `resolveDisabledNoticeLink(reason, notice)` — 사유와 공지를 한 요소로 합친다. 사유+공지→`사유: X`가 공지 링크, 사유만→클릭 불가 문구, 공지만→`중단 공지` 링크, 둘 다 없으면 null. 읽는 대상과 누르는 대상을 일치시켜 조각이 나뉘는 것을 막는다. |
| `src/pages/explorer/disabledNetworks.test.ts` | disabledNetworks.ts 단위 테스트(Vitest, 24케이스). 필터/정렬/dedup + 레거시 제외/네이티브·LN 유지 + `formatDisabledDuration` 경과 시간 표기(분/시간/일, 최소 접두사, 미래 시각 방어) + `formatSuspensionReason` 한국어 매핑/원문 폴백 + `resolveDisabledNoticeLink` 4분기 검증. |
| `src/pages/explorer/__fixtures__/cheapestAll.fixture.json` | 고정 입력 fixture (`/path-finder/cheapest-all` 실제 응답, amount_krw=1,000,000). 회귀 테스트 입력. |
| `src/pages/explorer/__fixtures__/recommend.golden.json` | 검증된 기대 출력 (Playwright로 실제 UI와 27/27 일치 확인). `scripts/gen_recommend_golden.py`로 재생성. |
| `src/pages/explorer/steps/*.tsx` | 단계별 독립 컴포넌트. 각자 `useExplorer()`로 필요한 값만 소비. InputStep/RecommendationStep/DomesticStep/GlobalStep/CoinStep/BtcMethodStep/NetworkStep/GlobalExitMethodStep/**DestinationStep**/SwapServiceStep/ResultStep. 체크리스트는 DomesticStep/GlobalStep에 인라인. `DestinationStep`: 라이트닝 출금 후 종착지(개인지갑=스왑 경유 / 라이트닝 지갑=직접 수신) 선택. `RecommendationStep`: 필터 패널의 거래소 짝 프리셋(`PRESET_PAIRS` + `presetsFor(mode)`)은 자금이 흐르는 순서대로 읽히므로 방향에 따라 화살표가 뒤집힌다(살 때 `빗썸 → 바이낸스`, 팔 때 `바이낸스 → 빗썸`). 방식 제외 섹션 라벨도 팔 때는 `전송 방식 제외`다 — 국내 거래소에서 출금하는 게 아니라 내 지갑에서 보내는 방식이기 때문이고, 타임라인의 `SELL_PHASE_LABEL` 과 같은 이유다. 팔 때만 `USDT 입금망 제외` 섹션이 붙는다. `NetworkStep`: 선택 가능한 망 아래에 `disabledNetworkOptions`(백엔드 `disabled_paths`)를 흐리게 나열하고 사유를 배지로 붙인다(출금 중단, `USDT 입금 미지원 네트워크`, `USDT 입금망 확인 필요`). 사유 설명은 배지 하나가 맡고, 공지를 찾았을 때만 그 아래 근거 링크를 덧붙인다 — 예전에는 공지가 없을 때 '빗썸 API 비활성'이라는 고정 문구를 뒀는데 거래소와 사유가 무엇이든 같은 문장이 나와 배지와 어긋났다. `InputStep`(첫 화면): 방문자수·마퀴·시세·**방향 세그먼트(살 때/팔 때)**·금액/수량입력·**네트워크 비활성 목록**. 매도일 때는 원화 금액 대신 BTC/sats 수량과 **지갑 UTXO 개수**(온체인 채굴 수수료를 좌우하는 입력값, 상한 20)를 받고, 원화 환산은 파는 곳이 국내 거래소이므로 국내 시세(`btcPrice.upbitKrw`) 기준으로 계산한다. 국내 시세를 못 받았으면 글로벌 시세로 대신하지 않고 불러오는 중 문구를 남긴다. 시세·김치 프리미엄 패널은 최초 `/market/kimp/live` 응답 전까지 `btcPriceLoading`(context) 기준 로딩 스피너("실시간 시세·김치 프리미엄 불러오는 중…") 표시 후 패널로 교체. 비활성 목록(`disabledNetworks.ts` 필터, 0개면 숨김)은 **중단 경과 시간(`disabled_since` → `formatDisabledDuration`)과 시작 시각**을 함께 표시하고, **중단 사유 문구 자체가 그 사유를 설명하는 공지 링크**(`resolveDisabledNoticeLink`)다. 공지를 못 찾으면 클릭 불가 문구로 남는다. 공지는 행의 `related_notices`가 우선이고 없을 때만 `networkChanges`(suspended)의 것으로 보완한다. 시작 시각은 `withdrawal-fees/latest`의 `disabled_since`가 우선이고 없을 때만 `networkChanges.detected_at`으로 보완한다(후자는 72시간 창 제한이 있어 장기 중단은 잡지 못함). 경과 시간 문구는 1분 간격 `setInterval`로 기준 시각(`nowSec`)을 갱신해 유지한다. (변경 공지사항 섹션은 비활성 목록으로 흡수·제거됨; `getNetworkChanges()`는 enrichment용으로 유지.) `ResultStep`: 히어로 수령량(살 때 sats / 팔 때 원화), **경로 다이어그램은 `RouteDiagram`(노드+엣지 배열)** — 방향은 호출부가 배열 순서로 정하므로 렌더러는 모드를 모른다. 살 때는 국내 거래소에서 출발해 개인 지갑에서 끝나고, 팔 때는 개인 지갑에서 출발해 원화 계좌에서 끝난다. |
| `src/lib/api.ts` | API 클라이언트. `getTickers()`, `getCheapestPath()`, `getNetworkChanges()` (최근 네트워크 상태 변경 조회), `getWithdrawalFees()` (출금 수수료/활성 스냅샷, `WithdrawalFeesResponse`), `getExchangeStatus()`(`/market/status`), `getExchangeCapabilities()`(LN 입출금 지원), `getLightningSwapFees()`, `getCarfExchanges()`(`CarfExchangeInfo[]` 전체 필드) |
| `src/types.ts` | 공유 타입 (`CheapestPathEntry`, `CheapestPathResponse`, `TickerRow`, `NetworkChange`, `NetworkChangeNotice`, `NetworkChangesResponse`) |
| `src/lib/exchangeNames.ts` | 거래소 id → 표시명 매핑 (`fmtEx()`), 도메인 매핑(`getExchangeDomain`/`getFaviconUrl`), 라이트닝 서비스 설명(`getLightningServiceInfo`). **사명이 바뀐 거래소**는 `EXCHANGE_FORMER_NAMES` 에 예전 이름을 남기고 `fmtExFormer(id)` / `fmtExWithFormer(id)` 로 꺼낸다 — 코빗은 미래에셋 인수 후 **디지털엑스(Digital X)** 로 바뀌었고 도메인도 `digitalx.miraeasset.com` 이다. **거래소 id 는 `korbit` 을 그대로 쓴다**(백엔드 응답·DB·경로 계산이 모두 이 id 기준이라 바꾸면 연결이 끊긴다). 예전 이름은 서비스 검색(`filterServiceNodes`)과 상세 화면 제목에 쓰인다 — 이용자 대부분이 옛 이름으로 기억하므로 '코빗'으로 검색해도 찾아져야 한다. `exchangeNames.test.ts`(7케이스). |
| `src/lib/formatBtc.ts` | BTC/수수료/사토시 포맷 유틸 |
| `src/components/ErrorBoundary.tsx` | 에러 바운더리 |
| `src/index.css` | **팔레트 단일 소스.** `:root`(살 때, 웜 크림)와 `:root[data-theme="sell"]`(팔 때, 라이트 퍼플) 두 블록에 모든 색상 변수가 있다. 배경·카드·라벨·헤어라인·그림자·앰비언트 광원·스크롤바·결과 히어로 그라디언트까지 변수로 뺀 상태라, **색을 바꾸려면 이 두 블록만 고친다.** `--acc-brand`/`--fill-rgb` 는 Tailwind 투명도 수정자(`bg-acc-brand/15`)를 받으려고 채널 삼원색 형식이다. `--acc-green`/`--acc-red`/`--acc-blue` 는 성공·위험·정보를 뜻하는 의미색이라 모드가 바뀌어도 값을 유지한다. |
| `tailwind.config.js` | 색상 토큰이 모두 `index.css` 의 CSS 변수를 가리킨다. `acc-brand`(모드별 시그니처 액센트), `line`/`line-soft`/`line-strong`(카드 내부 헤어라인), `fill-*`(기본 투명도를 지니면서 `/50` 수정자도 받도록 함수형 색상값 — 수정자가 없을 때 Tailwind 가 `var(--tw-bg-opacity, 1)` 플레이스홀더를 넘기므로 그 판별이 들어 있다). **이 파일에는 색상값을 직접 쓰지 않는다.** |
| `src/App.tsx` | 라우팅. `/admin`, `/board`(목록), `/board/new`(작성), `/board/:id`(상세), `/board/:id/edit`(수정), `/services`(서비스 검색), `/services/:id`(서비스 상세), `*`→ExplorerPage. |
| `src/pages/services/serviceDirectory.ts` | **서비스 디렉토리 순수 로직.** `ServiceNode` 타입 + `buildServiceNodes()`(status/capabilities/스왑수수료/caution/CARF 병합, LN 노드 방향별 dedup — ln_to_onchain 우선) + `filterServiceNodes()`(한글명·영문 id 검색 + 타입 필터). `serviceDirectory.test.ts`(6케이스). |
| `src/pages/services/useServiceNodes.ts` | 목록/상세 공용 fetch 훅 — 공개 API 5종 병렬 호출(`getExchangeStatus`/`getExchangeCapabilities`/`getLightningSwapFees`/`getCaution`/`getCarfExchanges`), 부가 API 실패는 빈값 폴백. |
| `src/pages/services/ServicesPage.tsx` | `/services` — 검색 인풋 + 타입 칩(전체/국내/해외/라이트닝) + 노드 카드 리스트(파비콘·KYC/라이트닝/유의/공지 칩) → `/services/:id` 이동. `BoardLayout` 재사용. |
| `src/pages/services/ServiceDetailPage.tsx` | `/services/:id` — 섹션 카드: 개요(국가/은행/위험도/링크), 유의, KYC, 라이트닝(거래소=지원여부·스왑=수수료/한도), CARF·규제, 출금 수수료 테이블, 출금 한도(국내), 출금 규칙(게이트맨 live→정적 폴백), 공지사항. 미존재 id는 에러+목록 버튼. |
| `src/pages/board/BoardListPage.tsx` | 게시판 목록. 검색(제목+내용)·페이지네이션(20)·공지 상단고정+색상구분. 글쓰기 버튼. |
| `src/pages/board/BoardDetailPage.tsx` | 게시글 상세 + 본문 수정/삭제(비밀번호) + 댓글 목록/작성/수정/삭제(인라인, 비밀번호). |
| `src/pages/board/BoardWritePage.tsx` | 작성/수정 폼. 일반/제보 카테고리, 닉네임+비밀번호. `?template=report` 시 제보 템플릿 프리필. |
| `src/pages/board/BoardLayout.tsx` | 게시판 공통 헤더/레이아웃 (뒤로/홈 버튼). |
| `src/pages/board/categoryStyle.ts` | 카테고리별 라벨/뱃지/행 색상(공지=브랜드 액센트, 제보=blue). `categoryStyle.test.ts`. |
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
| GET | `/market/withdrawal-fees/latest` | 출금 수수료 스냅샷 + 중단 행의 `disabled_since`/`disabled_since_exact`/`suspension_reason`/`suspension_message`/`related_notices` | `disabled_since`·`related_notices` 계산만 60초 TTL(키에 crawl_run_id 포함) |
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
GET /market/path-finder/cheapest{,-all}?mode=buy|sell  →  DB 스냅샷 기반 경로 계산
   (buy = amount_krw, sell = amount_btc + wallet_utxo_count)
       ↓
Frontend (ExplorerPage.tsx + explorer/*)
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
| 거래소 사명 변경 | 표시명은 `frontend/src/lib/exchangeNames.ts` 의 `EXCHANGE_NAMES`, 예전 이름은 같은 파일 `EXCHANGE_FORMER_NAMES`, 파비콘 도메인은 `EXCHANGE_DOMAINS`. **거래소 id 는 바꾸지 않는다.** 함께 손봐야 하는 곳: 백엔드 `exchanges/profiles.py`(`display_name`), `paths/base.py`(`_EXCHANGE_KO`), `db/carf_seed.py`(`name`/`short_name`, 앱 시작 시 upsert 되어 DB 에 반영), `scripts/btc_path_alert.py`(알림용 이름 맵), 프론트 `lib/adminSettings.ts`, `explorer/constants.ts`(`DOMESTIC_INFO` 의 url·안내 문구). 거래소 이름이 들어간 안내·출처 문구는 `구 OOO` 를 덧붙여 어느 거래소인지 알아볼 수 있게 남긴다. |
| 새 거래소 추가 | `backend/app/domain/exchanges/profiles.py` (ExchangeProfile 엔트리 추가) + `fee_checker.py` (TRADING_FEES, GROUPS — CLI 겸용이라 별도 유지), `market_core.py` |
| Lightning 경로 | `paths_buy.py:_build_lightning_paths()` + `path_graph.py:swap_leg()`, `lightning_scraper.py`. **글로벌 LN 출금은 1회 한도(예: 바이낸스 0.01 BTC) 초과 시 `withdraw_leg(split_on_max=True)`로 분할(`_ln_num_txs()` = ceil), 수수료 × 횟수 적용. 경로의 `num_withdrawal_txs`/컴포넌트 amount_text에 "N회" 표기.** |
| 출금 수수료 | `crawl_service.py`, `repositories.py`, `WithdrawalFeeSnapshot` |
| 출금 수수료 정적값/출처 표시 | 정적값: `fee_checker.py` `_COINBASE_BTC_WITHDRAWAL_FEE_BTC`(코인베이스 BTC). 출처 라벨: `market_core.py:withdrawal_source()`+`STATIC_WITHDRAWAL_FEE_KEYS`. 어드민 표시: `admin/WithdrawalFeePanel.tsx`(국내/해외 탭, 거래소별 BTC/USDT 수수료 sats + `WD_SOURCE_META` 뱃지: 정적/실시간 API/스크래핑). 테스트 `tests/test_market_core.py`. |
| 라이트닝 지원 표시 | `derivations.ts` `computeGlobalSupportsLightning(allData, g, mode)` — 실제 byGlobal[g] LN 경로로 유도(정적 GLOBAL_INFO.lightning 은 폴백). 라이트닝 판정 필드가 모드마다 달라 `pathMode.isLightningPath` 를 쓴다. |
| Admin 데이터 갭("조치 필요") | `market.py:get_crawl_status` `data_gaps`(enabled+fee=None), `admin/CrawlStatusPanel.tsx` 조치 필요 패널, `api.ts` 타입 |
| 결과 페이지 단계별 이동수량/잔돈 | `path_graph.py`/`paths_buy.py` 각 leg·글로벌출금 component가 `fee_component(move_amount/move_coin/move_amount_krw)` 채움 → `breakdown.components`. 잔돈은 `min_order_registry.calc_discarded_krw` → path `discarded_krw`. 프론트 표시 `ResultStep.tsx` 수수료 내역(항목별 금액·비율은 항상 노출, 항목마다 '자세히' 토글(`expandedFees` Set)로 세부 펼침: 이동 N코인≈₩, 출금 네트워크, 수수료 계산식, 출처 링크). 최소주문 잔돈 행. 타입 `types.ts` `CheapestPathFeeComponent`/`CheapestPathEntry` |
| 경로 시나리오 회귀 테스트 | 매수 `tests/test_paths_buy_scenarios.py` (5종 + 직접LN + 트래블룰 + max한도). 매도 `tests/test_paths_sell.py` + `tests/test_sell_lightning_strike.py` (max한도 포함). 알림 동등성 `tests/test_paths_dynamic_equiv.py` (수치 베이스라인 고정). 프론트 매도 해석 `frontend/src/pages/explorer/sellPaths.test.ts` (16케이스). |
| 엣지 엔진 단위 테스트 | `tests/test_path_graph.py` (매수/매도 엣지 + 어댑터 + maker + 제약 통과/위반) |
| 종착지(개인지갑/라이트닝 지갑) | 백엔드 `paths_buy.py`: `find_cheapest_path_from_snapshot_rows`에서 경로마다 `destination` 태깅(`__direct__`=`lightning_wallet`, 그 외=`personal`). LN 직접출금(`swap=None`→`__direct__`, LN 출금까지만)=라이트닝 지갑 종착. 프론트: 추천 리스트 `RecommendationStep` 종착지 토글 필터(`destinationFilter`) + `routeText` 종착 라벨, 마법사 `flow.ts`(`destination` phase)+`DestinationStep.tsx`+`ExplorerContext`(`destination` state, `resultPath`/`swapServiceOptions`/`lightningExitInfo` 분기), 결과 `ResultStep`(종착 노드 라이트닝지갑/내지갑). 타입 `types.ts` `CheapestPathEntry.destination`. 개인지갑 모드엔 `__direct__` 미노출, 라이트닝 지갑 모드엔 스왑·온체인 미노출 |
| 출금 한도 동적 업데이트 | `fee_checker.py` `scrape_korea_withdrawal_limits()` + `_pw_scrape_upbit_limits()` → 업비트 guide 페이지 스크래핑 → `KoreaWithdrawalLimitSnapshot` DB 저장 → `/market/withdrawal-limits/latest` API → `ExplorerPage.tsx` `withdrawalLimits` state로 동적 표시 |
| UI 단계 추가 | ① `explorer/steps/XStep.tsx` 작성(`useExplorer()` 소비) → ② `explorer/registry.tsx`의 `STEP_REGISTRY`에 등록 → ③ `explorer/flow.ts`의 `Phase` 타입 + `BUY_FLOW`/`SELL_FLOW` 배열에 끼워넣기(방향마다 필요한 단계가 다르므로 둘 중 해당하는 쪽만 고쳐도 된다). |
| UI 단계 순서/경로 변경 | `explorer/flow.ts`의 `BUY_FLOW`/`SELL_FLOW` 배열 next(state)만 수정 (handleNext/handleBack 자동 반영). 회귀는 `flow.test.ts`가 잡는다. |
| 탐색 방향(살 때/팔 때) 관련 수정 | 방향 상태와 초기화는 `ExplorerContext.tsx` `mode`/`setMode()`. 단계 경로는 `flow.ts` `SELL_FLOW`. **경로 엔트리의 모드별 필드 차이는 `pathMode.ts` 한 곳에서만 판정한다**(수령량 `btc_received`↔`krw_received`, 라이트닝 `path_type`↔`global_exit_mode`, 종착지 `destination` 유무). 백엔드는 이미 `mode=sell` 을 지원하므로 수정할 일이 거의 없다(`paths_sell.py`). 화면 문구는 `InputStep`/`CoinStep`/`BtcMethodStep`/`GlobalExitMethodStep`/`DomesticStep`/`GlobalStep`/`NetworkStep`/`SwapServiceStep`/`RecommendationStep`/`ResultStep` 에 모드 분기로 들어 있다. 테스트 `flow.test.ts`/`pathMode.test.ts`/`sellPaths.test.ts`. |
| 매도 경로의 입금 제약 | `backend/app/domain/korea_deposit_policy.py` 가 단일 기준이다. 거래소 정책이 바뀌면 이 파일의 레지스트리만 고친다. 경로에 붙이는 지점은 `paths_sell.py` 의 `build_entry(deposit_gates=...)` 4곳(경로 종류마다 보내는 쪽이 달라 게이트 함수가 다르다). 프론트 해석은 `explorer/depositGate.ts`, 사용자 선언은 `ExplorerContext` 의 `walletRegistered`, 표시는 `InputStep`(사전 조건 질문)·`RecommendationStep`(배지 + 아래로 내리기)·`ResultStep`('입금 조건' 섹션). 테스트 `tests/test_korea_deposit_policy.py`, `tests/test_paths_sell.py`, `frontend/.../depositGate.test.ts`. |
| 테마 색상/팔레트 변경 | `src/index.css` 의 `:root`(살 때)와 `:root[data-theme="sell"]`(팔 때) 변수만 고친다. `tailwind.config.js` 토큰은 변수를 가리키기만 하므로 건드릴 필요가 없다. 모드에 따른 `data-theme` 부착은 `explorer/modeStorage.ts` 의 `applyModeTheme()`(호출부: `ExplorerContext.tsx` 의 `useEffect`, 앱 시작 시 `main.tsx`). 마지막 모드는 같은 파일이 `localStorage` 에 저장한다. 네트워크 브랜드색(`ui.tsx` NETWORK_MAP)과 메달색은 테마와 무관하다. |
| API 캐시 조정 / 동시접속 성능 | `market.py` `_TtlCache`(ttl + `get_or_compute` single-flight). cheapest TTL=3600초(키 run_id 포함, 크롤 시 `invalidate_status_cache`→clear). 크롤 후 워밍은 `main.py:_auto_crawl_loop`→`asyncio.to_thread(_run_scheduled_crawl)`→`warm_cheapest_path_cache`. **예약 크롤링(약 80초)은 반드시 워커 스레드에서 돌린다** — 이벤트 루프에서 직접 돌리면 단일 워커 uvicorn 전체가 멈춰 Cloudflare 522/524가 난다(`tests/test_auto_crawl_loop.py`). DB 풀 `session.py`(pool_size=10/overflow=20). gzip `main.py` GZipMiddleware. 단일 워커 유지(`scripts/start.sh` 주석). |
| DB 스키마 변경 | `models.py` → alembic revision → `repositories.py` |
| KYC 상태 | `kyc_registry.py`, `market.py` (_enrich_path_payload_with_kyc) |
| CARF 시행 연도 표시 | DB 권위 소스: `/market/carf-exchanges`(`carf_seed.py` `carf_first_exchange`) → `api.ts` `getCarfExchanges` → `ExplorerContext` `carfMap`(id→연도) → `DomesticStep`/`GlobalStep` `carfMap[id] ?? info.carf`(정적 `constants.ts` fallback) |
| 프론트 API 호출 | `api.ts` |
| 타입 수정 | `types.ts` (백엔드 응답 구조 변경 시 동기화 필수) |
| 게시판 기능 | 백엔드 `board.py`(라우트)+`board_repository.py`(ORM)+`models.py`(BoardPost/BoardComment)+`core/security.py`(비번 해시 pbkdf2). 프론트 `pages/board/*`+`App.tsx`(라우팅)+`api.ts`(getBoardPosts 등)+`types.ts`(Board*). 공지 작성=AdminPage `board` 탭(`AdminNoticePanel`). |
| 제보하기 링크 | `RecommendationStep`/`ResultStep`에서 `buildReportQuery()`로 `/board/new?template=report&...` 이동 → `BoardWritePage`가 `reportTemplate.ts`로 제목/본문 프리필. |
| 게시판 진입점 | `ExplorerPage.tsx` 헤더의 "게시판" 링크(`/board`). |
