import { describe, it, expect } from 'vitest';
import { buildPathSteps } from './pathUtils';
import type { CheapestPathEntry } from '../types';

const basePath: Partial<CheapestPathEntry> = {
  korean_exchange: 'bithumb',
  transfer_coin: 'USDT',
  domestic_withdrawal_network: 'TRC20',
  global_exit_mode: 'onchain',
  global_exit_network: 'Bitcoin',
  btc_received: 0.009,
  breakdown: { total_fee_krw: 1000, components: [] },
};

describe('buildPathSteps - carfFirstExchange', () => {
  it('sets carfFirstExchange on Korean exchange step in buy mode', () => {
    const steps = buildPathSteps(basePath as CheapestPathEntry, 'binance', 'buy');
    const koreanStep = steps.find((s) => s.rawName === 'bithumb');
    expect(koreanStep?.carfFirstExchange).toBe('2027');
  });

  it('sets carfFirstExchange on global exchange step in buy mode', () => {
    const steps = buildPathSteps(basePath as CheapestPathEntry, 'binance', 'buy');
    const globalStep = steps.find((s) => s.rawName === 'binance');
    expect(globalStep?.carfFirstExchange).toBe('2028');
  });

  it('does not set carfFirstExchange on wallet step', () => {
    const steps = buildPathSteps(basePath as CheapestPathEntry, 'binance', 'buy');
    const walletStep = steps.find((s) => s.label === '개인 지갑');
    expect(walletStep?.carfFirstExchange).toBeUndefined();
  });
});
