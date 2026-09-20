// 팔 때의 경로 해석 — 추천 목록(recommend.ts)과 마법사 파생값(derivations.ts)이
// 매도 응답의 필드 차이를 제대로 읽는지 고정한다.
import { describe, expect, it } from 'vitest';
import { dedupAndSortPaths, filterRecommendedPaths, type RecommendedPath } from './recommend';
import { computeCoinOptions, computeResultPath, computeSwapServiceOptions } from './derivations';
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

describe('computeCoinOptions — 팔 때의 선택지', () => {
  it('BTC_GLOBAL(국내 BTC → 해외 경유)은 매도 선택지에 오르지 않는다', () => {
    // 팔 때는 출발점이 이미 개인 지갑이라 이 경로가 성립하지 않는다.
    const data = allData([
      sell({ transfer_coin: 'USDT' }),
      sell({ transfer_coin: 'BTC', route_variant: 'btc_direct', network: 'Bitcoin' }),
      sell({ transfer_coin: 'BTC', route_variant: 'btc_via_global', network: 'Bitcoin' }),
    ]);
    const opts = computeCoinOptions(data, 'bithumb', 'sell');
    expect(opts.map(o => o.coin).sort()).toEqual(['BTC', 'USDT']);
  });

  it('살 때는 BTC_GLOBAL 이 그대로 선택지에 남는다', () => {
    const data = allData([
      sell({ transfer_coin: 'USDT' }),
      sell({ transfer_coin: 'BTC', route_variant: 'btc_direct', network: 'Bitcoin' }),
      sell({ transfer_coin: 'BTC', route_variant: 'btc_via_global', network: 'Bitcoin' }),
    ]);
    const opts = computeCoinOptions(data, 'bithumb', 'buy');
    expect(opts.map(o => o.coin).sort()).toEqual(['BTC', 'BTC_GLOBAL', 'USDT']);
  });
});

describe('computeResultPath — 팔 때의 결과 경로', () => {
  const btcDirect = sell({
    path_id: 'btc-direct', transfer_coin: 'BTC', route_variant: 'btc_direct',
    network: 'Bitcoin', krw_received: 5_490_000, total_fee_krw: 2350,
  });
  const btcLightning = sell({
    path_id: 'btc-ln', transfer_coin: 'BTC', route_variant: 'lightning_direct',
    network: 'Lightning Network', global_exit_mode: 'lightning',
    lightning_exit_provider: 'Strike', krw_received: 5_495_000, total_fee_krw: 1800,
  });

  it('BTC 직접 경로는 네트워크를 고르지 않아도 계산된다', () => {
    // 국내 거래소의 BTC 입금망이 사실상 하나뿐이라 매도 플로우에는 네트워크 단계가 없다.
    const data = allData([btcDirect]);
    const out = computeResultPath(data, 'bithumb', 'BTC', null, null, null, null, null, 'onchain', 'sell');
    expect(out?.path_id).toBe('btc-direct');
  });

  it('전송 방식이 온체인이면 라이트닝 경로를 제외한다', () => {
    const data = allData([btcDirect, btcLightning]);
    const out = computeResultPath(data, 'bithumb', 'BTC', null, null, null, null, null, 'onchain', 'sell');
    expect(out?.path_id).toBe('btc-direct');
  });

  it('전송 방식이 라이트닝이면 라이트닝 경로를 고른다', () => {
    const data = allData([btcDirect, btcLightning]);
    const out = computeResultPath(data, 'bithumb', 'BTC', null, null, null, null, null, 'lightning', 'sell');
    expect(out?.path_id).toBe('btc-ln');
  });

  it('USDT 경유는 globalExitMethod 가 전송 방식을 쥔다', () => {
    const usdtOnchain = sell({ path_id: 'usdt-onchain', total_fee_krw: 7981 });
    const usdtLn = sell({
      path_id: 'usdt-ln', global_exit_mode: 'lightning',
      lightning_exit_provider: 'Strike', total_fee_krw: 7000,
    });
    const data = allData([usdtOnchain, usdtLn]);
    const out = computeResultPath(
      data, 'bithumb', 'USDT', 'binance', 'TRC20', null, 'lightning', null, null, 'sell',
    );
    expect(out?.path_id).toBe('usdt-ln');
  });

  it('스왑 서비스를 고르면 그 서비스를 쓰는 경로로 좁힌다', () => {
    const strike = sell({
      path_id: 'strike', transfer_coin: 'BTC', route_variant: 'lightning_direct',
      network: 'Lightning Network', global_exit_mode: 'lightning',
      lightning_exit_provider: 'Strike', total_fee_krw: 2000,
    });
    const boltz = sell({
      path_id: 'boltz', transfer_coin: 'BTC', route_variant: 'lightning_direct',
      network: 'Lightning Network', global_exit_mode: 'lightning',
      lightning_exit_provider: 'Boltz', total_fee_krw: 1500,
    });
    const data = allData([strike, boltz]);
    const out = computeResultPath(data, 'bithumb', 'BTC', null, null, 'Strike', null, null, 'lightning', 'sell');
    expect(out?.path_id).toBe('strike');
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
