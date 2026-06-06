# TEST.md

## Backend API / MCP 회귀 기준
- `/health` returns 200 and `{status: "ok"}`
- `/api/v1/market/*` existing response structures remain compatible
- `/api/v1/crawl-runs` list/create behavior remains compatible
- `mcp_server.py` exported MCP tools keep current names and return shapes
- `fee_checker.py` exported functions/constants used by tests remain import-compatible

## Frontend 회귀 기준
- `/` and `/overview` converge to `/cheapest-path`
- `/cheapest-path` renders best path, multi-filter controls, and route detail behavior
- existing non-overview routes keep rendering without URL changes
- loading / error / success UI behavior remains intact

## 경로 계산 시나리오 (buy 모드) — 전수 확정

> 백엔드 결정론 테스트: `tests/test_paths_buy_scenarios.py` (라이브 DB 비의존, 합성 스냅샷 주입)
> 전 시나리오 불변식: 구성요소 합 == total_fee_krw, btc_received > 0, fee_pct 일치, LN 경로는 provider 보유, total_fee_krw 오름차순 정렬

### 5종 경로 (코인 × 출금 방식)
| # | 코인 | 출금 방식 | route_variant / path_type | 글로벌 가용 조건 | 상태 |
|---|------|-----------|---------------------------|------------------|------|
| 1 | BTC | 온체인(직접) | btc_direct | 국내만 (글로벌 무관) | ✅ 트래블룰 분할 |
| 2 | BTC_GLOBAL | 온체인 | btc_via_global | 글로벌 BTC 온체인 출금비 존재 | ✅ |
| 3 | BTC_GLOBAL | 라이트닝 | btc_via_global + lightning_exit | 글로벌 LN 출금비 존재 | ✅ |
| 4 | USDT | 온체인 | (usdt) | 글로벌이 해당 USDT 네트워크 입금 지원 | ✅ |
| 5 | USDT | 라이트닝 | (usdt) + lightning_exit | 글로벌 LN 출금비 존재 | ✅ |

### 트래블룰 분할 경계 (개인지갑 직접출금만 적용)
| 금액(KRW) | btc_direct num_txs | btc_via_global num_txs |
|-----------|--------------------|------------------------|
| 1,000,000 | 1 | 1 |
| 1,000,001 | 2 | 1 |
| 2,000,000 | 2 | 1 |
| 10,000,000 | 10 | 1 |

- 직접출금(→개인지갑)은 거래소 1회 100만원 한도로 분할, 회당 출금비 부과.
- 경유출금(→VASP, 예: Binance)은 트래블룰 분할 대상 아님 → 항상 1회.

### 글로벌 거래소별 가용성 (현재 스냅샷 기준, 데이터 의존)
| 글로벌 | 온체인 | 라이트닝 | 비고 |
|--------|--------|----------|------|
| binance | ✅ | ✅ | LN 출금 행 enabled+fee |
| bitget | ✅ | ✅ | LN 출금 행 enabled+fee |
| okx | ✅(직접만)* | ❌ 데이터 갭 | LN 행 enabled지만 fee=None → admin "조치 필요" 노출 |
| coinbase | ✅(직접만)* | ❌ | LN 출금 미지원 |
| bybit | ❌ | ❌ | spot 시세 미수집 → 옵션 미노출 |
| kraken | ❌ | ❌ | 정적 fallback 차단 → 옵션 미노출 |

*okx/coinbase 는 변동 수수료라 btc_via_global 온체인 경로 미생성 (직접출금 경로만).

### 프론트엔드 일관성 기준
- 라이트닝 지원 표시는 **실제 경로 존재(byGlobal[g] LN 경로)** 로 유도 — 정적 메타데이터 미사용. 표시와 게이팅(`hasLightningPaths`) 항상 일치.
- 데이터 미수집으로 경로 없는 글로벌은 globalOptions 에서 자동 제외 (per-global 503 graceful).
- 출금 활성이지만 수수료 미수집 행(enabled+fee=None)은 `/crawl-status` `data_gaps` 로 admin 페이지 "조치 필요"에 노출.

## Build / Quality 기준
- `./.venv/bin/pytest -q` PASS
- `cd frontend && npm run lint` PASS
- `cd frontend && npm run test` PASS
- `cd frontend && npm run build` PASS
