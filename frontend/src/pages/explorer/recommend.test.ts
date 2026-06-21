// ── 추천/필터 로직 golden 회귀 테스트 ─────────────────────────────────────────────
// 고정 fixture(cheapestAll.fixture.json)에 실제 추천/필터 로직(recommend.ts)을 적용한 결과가
// 검증된 golden(recommend.golden.json)과 일치하는지 확인한다.
//
// golden은 독립 구현 oracle(scripts/gen_recommend_golden.py)로 생성되며,
// 그 oracle은 Playwright로 실제 UI와 27/27 필터 시나리오 일치가 확인되었다.
// → 이 테스트가 통과하면 recommend.ts == oracle == 실제 UI 임을 보장한다.
//
// 로직을 의도적으로 변경하면: 1) recommend.ts 수정 → 2) (백엔드 띄워) fixture 재캡처(선택) →
//   3) python3 scripts/gen_recommend_golden.py 로 golden 재생성 → 4) 본 테스트 재확인.

import { describe, it, expect } from 'vitest';
import fixtureJson from './__fixtures__/cheapestAll.fixture.json';
import goldenJson from './__fixtures__/recommend.golden.json';
import type { CheapestPathResponse } from '../../types';
import type { Destination } from './flow';
import {
  flattenPaths, dedupAndSortPaths, filterRecommendedPaths, recommendRouteKey,
  type RecommendFilterState, type RecommendedPath,
} from './recommend';

interface Fixture {
  by_global: Record<string, CheapestPathResponse | { error?: unknown }>;
}

interface GoldenOrderEntry { routeKey: string; totalFeeKrw: number | null; sats: number }
interface GoldenScenario {
  name: string;
  filter: {
    destinationFilter: Destination;
    excludeExchanges: string[];
    excludeGlobalExchanges: string[];
    excludeServices: string[];
    excludeOnchain: boolean;
    excludeLightning: boolean;
    excludeDisabled: boolean;
  };
  expected: { count: number; topRouteKey: string | null; topFeeKrw: number | null; topSats: number | null };
}
interface Golden {
  amountKrw: number;
  dedupCount: number;
  scenarios: GoldenScenario[];
  order: { personal: GoldenOrderEntry[]; lightning_wallet: GoldenOrderEntry[] };
}

const fixture = fixtureJson as Fixture;
const golden = goldenJson as Golden;
const SATS = 100_000_000;

const all: RecommendedPath[] = dedupAndSortPaths(flattenPaths(fixture.by_global));
const sats = (p: RecommendedPath) => Math.round((p.btc_received ?? 0) * SATS);

describe('recommend: dedup + 정렬', () => {
  it('dedup 후 경로 수가 golden과 일치', () => {
    expect(all.length).toBe(golden.dedupCount);
  });

  for (const dest of ['personal', 'lightning_wallet'] as const) {
    it(`정렬 순서가 golden과 완전히 일치 (${dest})`, () => {
      const actual = all
        .filter(p => (p.destination ?? 'personal') === dest)
        .map(p => ({ routeKey: recommendRouteKey(p), totalFeeKrw: p.total_fee_krw ?? null, sats: sats(p) }));
      expect(actual).toEqual(golden.order[dest]);
    });
  }
});

describe('recommend: 필터 시나리오 (golden 전수)', () => {
  it(`golden 시나리오 수 = 27`, () => {
    expect(golden.scenarios.length).toBe(27);
  });

  for (const sc of golden.scenarios) {
    it(`[${sc.name}] count·top 일치`, () => {
      const state: RecommendFilterState = {
        destinationFilter: sc.filter.destinationFilter,
        excludeExchanges: new Set(sc.filter.excludeExchanges),
        excludeGlobalExchanges: new Set(sc.filter.excludeGlobalExchanges),
        excludeServices: new Set(sc.filter.excludeServices),
        excludeOnchain: sc.filter.excludeOnchain,
        excludeLightning: sc.filter.excludeLightning,
        excludeDisabled: sc.filter.excludeDisabled,
      };
      const res = filterRecommendedPaths(all, state);
      const top = res[0] ?? null;
      expect({
        count: res.length,
        topRouteKey: top ? recommendRouteKey(top) : null,
        topFeeKrw: top ? top.total_fee_krw ?? null : null,
        topSats: top ? sats(top) : null,
      }).toEqual(sc.expected);
    });
  }
});

describe('recommend: 경로 내부 일관성 (전체 dedup)', () => {
  it('수수료 합계 = 내역 컴포넌트 합 (±2원), fee_pct·sats 정합', () => {
    const violations: string[] = [];
    for (const p of all) {
      const rk = recommendRouteKey(p);
      const fee = p.total_fee_krw;
      const comps = p.breakdown?.components ?? [];
      const compSum = comps.reduce((s, c) => s + (c.amount_krw ?? 0), 0);
      if (fee != null && Math.abs(fee - compSum) > 2) {
        violations.push(`${rk}: fee ${fee} != compSum ${compSum}`);
      }
      if (fee != null && p.fee_pct != null) {
        const expPct = (fee / golden.amountKrw) * 100;
        if (Math.abs(p.fee_pct - expPct) > 0.011) {
          violations.push(`${rk}: fee_pct ${p.fee_pct} != ${expPct.toFixed(3)}`);
        }
      }
      if (!p.disabled && (p.btc_received == null || p.btc_received <= 0 || sats(p) <= 0)) {
        violations.push(`${rk}: btc_received/sats invalid (${p.btc_received})`);
      }
    }
    expect(violations).toEqual([]);
  });
});
