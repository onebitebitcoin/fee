// 팔 때의 경로 해석 — 추천 목록(recommend.ts)과 마법사 파생값(derivations.ts)이
// 매도 응답의 필드 차이를 제대로 읽는지 고정한다.
// 팔 때 마법사의 단계별 선택지·결과 경로는 sellWizard.test.ts 가 고정한다.
import { describe, expect, it } from 'vitest';
import { dedupAndSortPaths, filterRecommendedPaths, type RecommendedPath } from './recommend';
import { computeAltPaths, computeCoinOptions, computeConditionalAltPath, computeSwapServiceOptions } from './derivations';
import { routeStops, routeText } from './routeStops';
import type { AllData } from './constants';
import type { CheapestPathEntry, CheapestPathResponse } from '../../types';

function sell(over: Partial<CheapestPathEntry> = {}): CheapestPathEntry {
  return {
    path_id: 'p',
    route_variant: 'usdt_via_global',
    korean_exchange: 'bithumb',
    transfer_coin: 'USDT',
    network: 'TRC20',
    domestic_withdrawal_network: 'TRC20',
    global_exit_mode: 'onchain',
    global_exit_network: 'Bitcoin',
    lightning_exit_provider: null,
    krw_received: 5_000_000,
    total_fee_krw: 1000,
    fee_pct: 0.1,
    ...over,
  } as CheapestPathEntry;
}

const tagged = (p: CheapestPathEntry, g = 'binance'): RecommendedPath => ({ ...p, _g: g });

function allData(paths: CheapestPathEntry[]): AllData {
  return {
    byGlobal: {
      binance: {
        mode: 'sell',
        global_exchange: 'binance',
        global_btc_price_usd: 80_000,
        usd_krw_rate: 1387,
        all_paths: paths,
        disabled_paths: [],
      } as unknown as CheapestPathResponse,
    },
    tickers: [],
    latestRunAt: null,
  };
}

const noFilters = {
  destinationFilter: 'personal' as const,
  excludeExchanges: new Set<string>(),
  excludeGlobalExchanges: new Set<string>(),
  excludeServices: new Set<string>(),
  excludeOnchain: false,
  excludeLightning: false,
  excludeDisabled: false,
};

describe('dedupAndSortPaths — 팔 때의 정렬 기준', () => {
  it('수수료가 같으면 수령 원화가 많은 경로를 앞에 둔다', () => {
    const paths = [
      tagged(sell({ path_id: 'a', korean_exchange: 'upbit', krw_received: 5_000_000 })),
      tagged(sell({ path_id: 'b', korean_exchange: 'bithumb', krw_received: 5_400_000 })),
    ];
    const out = dedupAndSortPaths(paths, 'sell');
    expect(out.map(p => p.path_id)).toEqual(['b', 'a']);
  });

  it('살 때 기준으로 읽으면 매도 경로의 수령량을 모두 0 으로 보아 순서를 가르지 못한다', () => {
    // 모드를 넘기지 않으면 btc_received 를 찾는데 매도 응답에는 그 필드가 없다.
    const paths = [
      tagged(sell({ path_id: 'a', korean_exchange: 'upbit', krw_received: 5_000_000 })),
      tagged(sell({ path_id: 'b', korean_exchange: 'bithumb', krw_received: 5_400_000 })),
    ];
    const out = dedupAndSortPaths(paths);
    expect(out.map(p => p.path_id)).toEqual(['a', 'b']);   // 입력 순서 그대로
  });

  it('수수료가 다르면 낮은 쪽이 먼저다', () => {
    const paths = [
      tagged(sell({ path_id: 'a', korean_exchange: 'upbit', total_fee_krw: 8000, krw_received: 5_400_000 })),
      tagged(sell({ path_id: 'b', korean_exchange: 'bithumb', total_fee_krw: 2350, krw_received: 5_000_000 })),
    ];
    expect(dedupAndSortPaths(paths, 'sell').map(p => p.path_id)).toEqual(['b', 'a']);
  });
});

describe('filterRecommendedPaths — 팔 때의 필터', () => {
  it('매도 경로에는 destination 이 없지만 종착지 필터에 걸러지지 않는다', () => {
    // 팔 때의 종착지는 원화 계좌 하나뿐이라 이 필터 자체를 적용하지 않는다.
    const paths = [tagged(sell())];
    expect(filterRecommendedPaths(paths, { ...noFilters, mode: 'sell' })).toHaveLength(1);
  });

  it('라이트닝 제외 필터는 global_exit_mode 기준으로 동작한다', () => {
    const paths = [
      tagged(sell({ path_id: 'onchain' })),
      tagged(sell({ path_id: 'ln', korean_exchange: 'upbit', global_exit_mode: 'lightning', lightning_exit_provider: 'Strike' })),
    ];
    const out = filterRecommendedPaths(paths, { ...noFilters, mode: 'sell', excludeLightning: true });
    expect(out.map(p => p.path_id)).toEqual(['onchain']);
  });

  it('온체인 제외 필터는 라이트닝 경로만 남긴다', () => {
    const paths = [
      tagged(sell({ path_id: 'onchain' })),
      tagged(sell({ path_id: 'ln', korean_exchange: 'upbit', global_exit_mode: 'lightning', lightning_exit_provider: 'Strike' })),
    ];
    const out = filterRecommendedPaths(paths, { ...noFilters, mode: 'sell', excludeOnchain: true });
    expect(out.map(p => p.path_id)).toEqual(['ln']);
  });

  it('스왑 서비스 제외는 해당 서비스를 쓰는 라이트닝 경로만 뺀다', () => {
    const paths = [
      tagged(sell({ path_id: 'onchain' })),
      tagged(sell({ path_id: 'ln', korean_exchange: 'upbit', global_exit_mode: 'lightning', lightning_exit_provider: 'Strike' })),
    ];
    const out = filterRecommendedPaths(paths, {
      ...noFilters, mode: 'sell', excludeServices: new Set(['Strike']),
    });
    expect(out.map(p => p.path_id)).toEqual(['onchain']);
  });

  it('해외 거래소 제외는 USDT 경유 경로에만 적용되고 BTC 직접 경로는 남는다', () => {
    const paths = [
      tagged(sell({ path_id: 'usdt' })),
      tagged(sell({ path_id: 'btc', transfer_coin: 'BTC', route_variant: 'btc_direct', network: 'Bitcoin' })),
    ];
    const out = filterRecommendedPaths(paths, {
      ...noFilters, mode: 'sell', excludeGlobalExchanges: new Set(['binance']),
    });
    expect(out.map(p => p.path_id)).toEqual(['btc']);
  });
});

describe('computeCoinOptions — 살 때의 선택지', () => {
  it('살 때는 BTC_GLOBAL 이 선택지에 남는다 (팔 때는 sellCoinOptions 가 따로 계산한다)', () => {
    const data = allData([
      sell({ transfer_coin: 'USDT' }),
      sell({ transfer_coin: 'BTC', route_variant: 'btc_direct', network: 'Bitcoin' }),
      sell({ transfer_coin: 'BTC', route_variant: 'btc_via_global', network: 'Bitcoin' }),
    ]);
    const opts = computeCoinOptions(data, 'bithumb', 'buy');
    expect(opts.map(o => o.coin).sort()).toEqual(['BTC', 'BTC_GLOBAL', 'USDT']);
  });
});

describe('computeSwapServiceOptions — 팔 때의 스왑 서비스', () => {
  it('destination 필드가 없어도 서비스가 목록에 오르고, 수령 원화가 많은 순으로 정렬된다', () => {
    const paths = [
      sell({ lightning_exit_provider: 'Strike', global_exit_mode: 'lightning', krw_received: 5_400_000 }),
      sell({ lightning_exit_provider: 'Boltz', global_exit_mode: 'lightning', krw_received: 5_450_000 }),
    ];
    const opts = computeSwapServiceOptions(paths, 'sell');
    expect(opts.map(o => o.name)).toEqual(['Boltz', 'Strike']);
    expect(opts[0].received).toBe(5_450_000);
  });
});

describe('computeAltPaths — 팔 때 결과 화면의 더 싼 경로 제안', () => {
  const gate = (level: 'blocked' | 'required' | 'unknown') => ({
    kind: 'personal_wallet' as const, level, label: '', desc: '',
  });
  // 수수료 순으로 정렬된 추천 목록(dedupAndSortPaths 결과)을 흉내 낸다.
  const upbitDirect = tagged(sell({
    path_id: 'upbit-btc', transfer_coin: 'BTC', route_variant: 'btc_direct', korean_exchange: 'upbit',
    network: 'Bitcoin', total_fee_krw: 2450, deposit_gates: [gate('blocked')],
  }));
  const bithumbDirect = tagged(sell({
    path_id: 'bithumb-btc', transfer_coin: 'BTC', route_variant: 'btc_direct', korean_exchange: 'bithumb',
    network: 'Bitcoin', total_fee_krw: 3023, deposit_gates: [gate('required')],
  }));
  const viaBinance = tagged(sell({ path_id: 'usdt-binance', total_fee_krw: 8195, deposit_gates: [gate('unknown')] }));
  const viaOkx = tagged(sell({ path_id: 'usdt-okx', total_fee_krw: 8746 }), 'okx');
  const sorted = [upbitDirect, bithumbDirect, viaBinance, viaOkx];

  it('입금 불가·지갑 등록 필요 경로는 제안하지 않는다', () => {
    const out = computeAltPaths(sorted, viaOkx, 'sell', false);
    expect(out.map(p => p.path_id)).toEqual(['usdt-binance', 'usdt-okx']);
  });

  it('지갑 등록을 선언하면 등록 필요 경로는 다시 제안하지만 입금 불가 경로는 계속 뺀다', () => {
    const out = computeAltPaths(sorted, viaOkx, 'sell', true);
    expect(out.map(p => p.path_id)).toEqual(['bithumb-btc', 'usdt-binance', 'usdt-okx']);
  });

  it('살 때는 입금 관문과 무관하게 기존대로 상위 3개를 쓴다', () => {
    const out = computeAltPaths(sorted, null, 'buy', false);
    expect(out.map(p => p.path_id)).toEqual(['upbit-btc', 'bithumb-btc', 'usdt-binance']);
  });
});

describe('computeConditionalAltPath — 지갑 등록을 조건으로 더 싼 경로', () => {
  const gate = (level: 'blocked' | 'required' | 'unknown') => ({
    kind: 'personal_wallet' as const, level, label: '지갑 등록 필요', desc: '',
  });
  const upbitDirect = tagged(sell({
    path_id: 'upbit-btc', transfer_coin: 'BTC', route_variant: 'btc_direct', korean_exchange: 'upbit',
    total_fee_krw: 2000, deposit_gates: [gate('blocked')],
  }));
  const bithumbDirect = tagged(sell({
    path_id: 'bithumb-btc', transfer_coin: 'BTC', route_variant: 'btc_direct', korean_exchange: 'bithumb',
    total_fee_krw: 2450, deposit_gates: [gate('required')],
  }));
  const coinoneDirect = tagged(sell({
    path_id: 'coinone-btc', transfer_coin: 'BTC', route_variant: 'btc_direct', korean_exchange: 'coinone',
    total_fee_krw: 5886, deposit_gates: [gate('required')],
  }));
  const current = sell({ path_id: 'usdt-okx', total_fee_krw: 8746 });
  const sorted = [upbitDirect, bithumbDirect, coinoneDirect];

  it('입금 불가 경로는 건너뛰고, 등록하면 쓸 수 있는 가장 싼 경로를 고른다', () => {
    expect(computeConditionalAltPath(sorted, current, false)?.path_id).toBe('bithumb-btc');
  });

  it('이미 등록했다고 선언했으면 조건부 제안이 없다 (일반 제안에 들어간다)', () => {
    expect(computeConditionalAltPath(sorted, current, true)).toBeNull();
  });

  it('현재 경로보다 싸지 않으면 제안하지 않는다', () => {
    const cheapCurrent = sell({ path_id: 'cheap', total_fee_krw: 2000 });
    expect(computeConditionalAltPath(sorted, cheapCurrent, false)).toBeNull();
  });

  it('현재 경로가 바로 그 경로면 제안하지 않는다', () => {
    expect(computeConditionalAltPath(sorted, bithumbDirect, false)).toBeNull();
  });
});

describe('routeText — 팔 때 경로 요약', () => {
  it('국내 직접 온체인: 지갑에서 국내 거래소로 바로 간다', () => {
    const p = tagged(sell({ transfer_coin: 'BTC', route_variant: 'btc_direct', korean_exchange: 'bithumb' }));
    expect(routeText(p, 'sell')).toBe('내 지갑 › BTC › 빗썸 › 원화');
  });

  it('해외 경유 라이트닝: 스왑 서비스와 해외 거래소, USDT 망을 차례로 거친다', () => {
    const p = tagged(sell({ global_exit_mode: 'lightning', lightning_exit_provider: 'Strike', network: 'TRC20' }));
    expect(routeText(p, 'sell')).toBe('내 지갑 › BTC › Strike › 라이트닝 › 바이낸스 › USDT › TRC20 › 빗썸 › 원화');
  });
});

describe('routeStops — 카드에 그릴 정거장', () => {
  it('거래소·스왑 서비스 정거장에만 로고 id 를 붙인다', () => {
    const p = tagged(sell({ global_exit_mode: 'lightning', lightning_exit_provider: 'Strike', network: 'TRC20' }));
    const withIcon = routeStops(p, 'sell').filter(s => s.iconId).map(s => s.iconId);
    expect(withIcon).toEqual(['Strike', 'binance', 'bithumb']);
  });

  it('살 때는 국내 거래소에서 출발해 지갑에서 끝난다', () => {
    const p = tagged(sell({ korean_exchange: 'upbit', network: 'TRC20' }));
    const labels = routeStops(p, 'buy').map(s => s.label);
    expect(labels[0]).toBe('업비트');
    expect(labels[labels.length - 1]).toBe('지갑');
  });
});
