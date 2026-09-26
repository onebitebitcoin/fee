// 팔 때 마법사의 선택지 계산. 단계가 자금 흐름 순서(전송 방식 → 스왑 → 매도 경로 →
// 해외 거래소 → 네트워크 → 국내 거래소)로 진행되므로, 각 단계의 선택지는
// 그보다 앞에서 고른 조건만으로 걸러져야 한다.
import { describe, expect, it } from 'vitest';
import {
  EMPTY_SELL_SELECTION,
  sellCoinOptions,
  sellDisabledNetworkOptions,
  sellDomesticOptions,
  sellGlobalOptions,
  sellHasLightning,
  sellNetworkOptions,
  sellResultPath,
  sellSwapServiceOptions,
  type SellSelection,
} from './sellWizard';
import type { AllData } from './constants';
import type { CheapestPathEntry, CheapestPathResponse } from '../../types';

function path(over: Partial<CheapestPathEntry> = {}): CheapestPathEntry {
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

function resp(g: string, paths: CheapestPathEntry[], disabled: unknown[] = []): CheapestPathResponse {
  return {
    mode: 'sell', global_exchange: g, global_btc_price_usd: 80_000, usd_krw_rate: 1387,
    all_paths: paths, disabled_paths: disabled,
  } as unknown as CheapestPathResponse;
}

// BTC 직접 경로는 해외 거래소와 무관해 모든 해외 거래소 응답에 똑같이 실린다.
const btcOnchain = (ex: string, fee: number) => path({
  path_id: `btc-${ex}`, route_variant: 'btc_direct', transfer_coin: 'BTC',
  korean_exchange: ex, network: 'Bitcoin', total_fee_krw: fee,
});
const btcLn = (ex: string, svc: string, fee: number) => path({
  path_id: `btcln-${ex}-${svc}`, route_variant: 'lightning_direct', transfer_coin: 'BTC',
  korean_exchange: ex, network: 'Lightning Network', global_exit_mode: 'lightning',
  lightning_exit_provider: svc, total_fee_krw: fee,
});
const usdt = (ex: string, net: string, fee: number, over: Partial<CheapestPathEntry> = {}) => path({
  path_id: `usdt-${ex}-${net}-${fee}`, korean_exchange: ex, network: net, total_fee_krw: fee, ...over,
});

function data(byGlobal: Record<string, CheapestPathResponse>): AllData {
  return { byGlobal, tickers: [], latestRunAt: null };
}

const sel = (over: Partial<SellSelection>): SellSelection => ({ ...EMPTY_SELL_SELECTION, ...over });

const fixture = data({
  binance: resp('binance', [
    btcOnchain('upbit', 3000), btcOnchain('bithumb', 2500), btcLn('bithumb', 'Strike', 1800),
    usdt('upbit', 'TRC20', 1200), usdt('bithumb', 'TRC20', 1100), usdt('bithumb', 'Aptos', 900),
    usdt('bithumb', 'TRC20', 700, { global_exit_mode: 'lightning', lightning_exit_provider: 'Boltz' }),
  ]),
  okx: resp('okx', [
    btcOnchain('upbit', 3000), btcOnchain('bithumb', 2500), btcLn('bithumb', 'Strike', 1800),
    usdt('upbit', 'TRC20', 1500), usdt('korbit', 'ERC20', 1600),
  ]),
});

describe('전송 방식 단계', () => {
  it('라이트닝 경로가 하나라도 있으면 라이트닝을 고를 수 있다', () => {
    expect(sellHasLightning(fixture)).toBe(true);
  });

  it('라이트닝 경로가 없으면 고를 수 없다', () => {
    const d = data({ binance: resp('binance', [btcOnchain('upbit', 3000)]) });
    expect(sellHasLightning(d)).toBe(false);
  });
});

describe('스왑 서비스 단계 — 국내·해외 거래소를 고르기 전', () => {
  it('모든 매도 경로의 라이트닝 서비스를 모은다', () => {
    const names = sellSwapServiceOptions(fixture).map(o => o.name).sort();
    expect(names).toEqual(['Boltz', 'Strike']);
  });
});

describe('매도 경로 단계', () => {
  it('온체인이면 국내 직접과 해외 경유 둘 다 나온다', () => {
    const opts = sellCoinOptions(fixture, sel({ sendMethod: 'onchain' }));
    expect(opts.map(o => o.coin).sort()).toEqual(['BTC', 'USDT']);
  });

  it('고른 스왑 서비스를 쓰는 경로만 남긴다', () => {
    const opts = sellCoinOptions(fixture, sel({ sendMethod: 'lightning', swapSvc: 'Boltz' }));
    expect(opts.map(o => o.coin)).toEqual(['USDT']);
  });

  it('BTC_GLOBAL 은 매도 선택지에 오르지 않는다', () => {
    const d = data({ binance: resp('binance', [
      btcOnchain('upbit', 3000),
      path({ route_variant: 'btc_via_global', transfer_coin: 'BTC', network: 'Bitcoin' }),
    ]) });
    expect(sellCoinOptions(d, sel({ sendMethod: 'onchain' })).map(o => o.coin)).toEqual(['BTC']);
  });
});

describe('해외 거래소 단계 — 국내 거래소를 고르기 전', () => {
  it('USDT 경유 경로가 있는 해외 거래소를 수수료 순으로 보여준다', () => {
    const opts = sellGlobalOptions(fixture, sel({ sendMethod: 'onchain', coin: 'USDT' }));
    expect(opts.map(o => o.exchange)).toEqual(['binance', 'okx']);
    expect(opts[0].best.total_fee_krw).toBe(900);
  });

  it('라이트닝 + 스왑 서비스 조건에 맞는 해외 거래소만 남긴다', () => {
    const opts = sellGlobalOptions(fixture, sel({ sendMethod: 'lightning', swapSvc: 'Boltz', coin: 'USDT' }));
    expect(opts.map(o => o.exchange)).toEqual(['binance']);
  });
});

describe('네트워크 단계', () => {
  it('고른 해외 거래소의 USDT 망을 국내 거래소와 무관하게 모은다', () => {
    const opts = sellNetworkOptions(fixture, sel({ sendMethod: 'onchain', coin: 'USDT', global: 'binance' }));
    expect(opts.map(o => o.network).sort()).toEqual(['Aptos', 'TRC20']);
  });

  it('출금 정지로 강제계산된 경로는 정상 선택지에서 빠지고 비활성 목록으로 간다', () => {
    const d = data({ binance: resp('binance', [
      usdt('upbit', 'TRC20', 1200),
      usdt('upbit', 'ERC20', 900, { disabled: true, disabled_reason: 'System Maintenance' }),
    ]) });
    const s = sel({ sendMethod: 'onchain', coin: 'USDT', global: 'binance' });
    expect(sellNetworkOptions(d, s).map(o => o.network)).toEqual(['TRC20']);
    expect(sellDisabledNetworkOptions(d, s).map(o => o.network)).toEqual(['ERC20']);
  });

  it('다른 국내 거래소에서 정상인 망은 비활성 목록에 올리지 않는다', () => {
    const d = data({ binance: resp('binance', [usdt('upbit', 'TRC20', 1200)], [
      { korean_exchange: 'bithumb', transfer_coin: 'USDT', network: 'TRC20', reason: null },
    ]) });
    const s = sel({ sendMethod: 'onchain', coin: 'USDT', global: 'binance' });
    expect(sellDisabledNetworkOptions(d, s)).toEqual([]);
  });
});

describe('국내 거래소 단계 — 마지막 선택', () => {
  it('해외 경유면 고른 해외 거래소·네트워크로 갈 수 있는 국내 거래소만 남긴다', () => {
    const s = sel({ sendMethod: 'onchain', coin: 'USDT', global: 'binance', network: 'Aptos' });
    expect(sellDomesticOptions(fixture, s, {}).map(o => o.exchange)).toEqual(['bithumb']);
  });

  it('국내 직접 라이트닝이면 라이트닝 입금 경로가 있는 거래소만 남긴다', () => {
    const s = sel({ sendMethod: 'lightning', swapSvc: 'Strike', coin: 'BTC' });
    expect(sellDomesticOptions(fixture, s, {}).map(o => o.exchange)).toEqual(['bithumb']);
  });

  it('거래량이 많은 거래소를 앞에 둔다', () => {
    const s = sel({ sendMethod: 'onchain', coin: 'BTC' });
    const opts = sellDomesticOptions(fixture, s, { upbit: 10, bithumb: 5 });
    expect(opts.map(o => o.exchange)).toEqual(['upbit', 'bithumb']);
  });
});

describe('결과 경로', () => {
  it('모든 선택을 만족하는 가장 싼 경로를 고른다', () => {
    const s = sel({ sendMethod: 'onchain', coin: 'USDT', global: 'binance', network: 'TRC20', domestic: 'bithumb' });
    expect(sellResultPath(fixture, s)?.path_id).toBe('usdt-bithumb-TRC20-1100');
  });

  it('국내 직접 경로는 네트워크를 고르지 않아도 계산된다', () => {
    const s = sel({ sendMethod: 'onchain', coin: 'BTC', domestic: 'bithumb' });
    expect(sellResultPath(fixture, s)?.path_id).toBe('btc-bithumb');
  });

  it('라이트닝이면 고른 스왑 서비스의 경로를 고른다', () => {
    const s = sel({ sendMethod: 'lightning', swapSvc: 'Strike', coin: 'BTC', domestic: 'bithumb' });
    expect(sellResultPath(fixture, s)?.path_id).toBe('btcln-bithumb-Strike');
  });

  it('국내 거래소를 아직 고르지 않았으면 결과가 없다', () => {
    expect(sellResultPath(fixture, sel({ sendMethod: 'onchain', coin: 'BTC' }))).toBeNull();
  });
});
