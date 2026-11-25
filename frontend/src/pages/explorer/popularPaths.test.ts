import { describe, expect, it } from 'vitest';
import type { PopularPathEntry } from '../../types';
import { popularBasisLabel, popularStops } from './popularPaths';

const base = {
  path_id: 'x', korean_exchange: 'bithumb', transfer_coin: 'USDT', network: 'TRC20',
  domestic_withdrawal_network: 'TRC20', global_exit_mode: 'onchain', global_exit_network: 'Bitcoin',
  destination: 'personal', total_fee_krw: 2583, fee_pct: 0.26,
} as const;

describe('popularBasisLabel', () => {
  it('살 때는 원화 금액, 팔 때는 BTC 수량을 기준으로 적는다', () => {
    expect(popularBasisLabel({ mode: 'buy', amount_krw: 1_000_000, amount_btc: null })).toBe('₩1,000,000 구매 기준');
    expect(popularBasisLabel({ mode: 'sell', amount_krw: null, amount_btc: 0.01 })).toBe('0.01 BTC 판매 기준');
  });
});

describe('popularStops', () => {
  it('해외 거래소를 거치는 경로는 그 거래소를 정거장에 넣는다', () => {
    const p: PopularPathEntry = { ...base, global_exchange: 'okx' };
    expect(popularStops(p, 'buy').map(s => s.iconId).filter(Boolean)).toEqual(['bithumb', 'okx']);
  });

  it('BTC 직접 경로는 해외 거래소 정거장이 없다', () => {
    const p: PopularPathEntry = {
      ...base, route_variant: 'btc_direct', transfer_coin: 'BTC', network: 'Bitcoin', global_exchange: null,
    };
    const stops = popularStops(p, 'buy');
    expect(stops.map(s => s.iconId).filter(Boolean)).toEqual(['bithumb']);
    expect(stops[stops.length - 1].label).toBe('지갑');
  });
});
