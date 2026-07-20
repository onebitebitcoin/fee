import { describe, expect, it } from 'vitest';
import { computeDisabledNetworkOptions, computeNetworkOptions } from './derivations';
import type { AllData } from './constants';
import type { CheapestPathEntry, CheapestPathResponse } from '../../types';

function path(over: Partial<CheapestPathEntry>): CheapestPathEntry {
  return {
    korean_exchange: 'bithumb',
    transfer_coin: 'USDT',
    network: 'TRC20',
    total_fee_krw: 1000,
    btc_received: 0.01,
    fee_pct: 0.1,
    ...over,
  } as CheapestPathEntry;
}

function allData(paths: CheapestPathEntry[], disabledPaths: CheapestPathResponse['disabled_paths'] = []): AllData {
  return {
    byGlobal: {
      binance: {
        mode: 'buy',
        global_exchange: 'binance',
        global_btc_price_usd: 100_000,
        usd_krw_rate: 1400,
        all_paths: paths,
        disabled_paths: disabledPaths,
      } as unknown as CheapestPathResponse,
    },
    tickers: [],
    latestRunAt: null,
  };
}

describe('computeNetworkOptions', () => {
  it('disabled(강제계산) 경로는 정상 선택지에서 제외한다', () => {
    const data = allData([
      path({ network: 'TRC20', disabled: true, disabled_reason: 'disabled' }),
      path({ network: 'Aptos' }),
    ]);
    const opts = computeNetworkOptions(data, 'bithumb', 'USDT', 'binance');
    expect(opts.map(o => o.network)).toEqual(['Aptos']);
  });

  it('활성 경로 중 네트워크별 최저 수수료 경로를 고른다', () => {
    const data = allData([
      path({ network: 'Aptos', total_fee_krw: 2000 }),
      path({ network: 'Aptos', total_fee_krw: 1500 }),
    ]);
    const opts = computeNetworkOptions(data, 'bithumb', 'USDT', 'binance');
    expect(opts).toHaveLength(1);
    expect(opts[0].best.total_fee_krw).toBe(1500);
  });
});

describe('computeDisabledNetworkOptions', () => {
  it('all_paths의 disabled 경로를 비활성 네트워크로 노출한다 (reason=disabled → null)', () => {
    const data = allData([
      path({ network: 'TRC20', disabled: true, disabled_reason: 'disabled' }),
      path({ network: 'Aptos' }),
    ]);
    const out = computeDisabledNetworkOptions(data, 'bithumb', 'USDT', 'binance');
    expect(out).toHaveLength(1);
    expect(out[0].network).toBe('TRC20');
    expect(out[0].reason).toBeNull();
  });

  it('disabled_paths와 네트워크가 겹치면 중복 노출하지 않는다', () => {
    const data = allData(
      [path({ network: 'TRC20', disabled: true, disabled_reason: '점검 중' })],
      [{ korean_exchange: 'bithumb', transfer_coin: 'USDT', network: 'TRC20', reason: '점검 중' }],
    );
    const out = computeDisabledNetworkOptions(data, 'bithumb', 'USDT', 'binance');
    expect(out).toHaveLength(1);
  });

  it('다른 거래소/코인의 disabled 경로는 섞이지 않는다', () => {
    const data = allData([
      path({ korean_exchange: 'upbit', network: 'TRC20', disabled: true }),
      path({ transfer_coin: 'BTC', network: 'Bitcoin', disabled: true }),
    ]);
    const out = computeDisabledNetworkOptions(data, 'bithumb', 'USDT', 'binance');
    expect(out).toHaveLength(0);
  });
});
