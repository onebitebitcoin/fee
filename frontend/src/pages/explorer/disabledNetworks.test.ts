import { describe, it, expect } from 'vitest';
import { filterDisabledWithdrawals } from './disabledNetworks';
import type { WithdrawalRow } from '../../types';

function row(p: Partial<WithdrawalRow>): WithdrawalRow {
  return {
    exchange: 'bithumb',
    coin: 'BTC',
    source: 'api',
    network_label: 'Bitcoin',
    enabled: true,
    ...p,
  };
}

describe('filterDisabledWithdrawals', () => {
  it('enabled=false인 BTC/USDT 행만 통과시킨다', () => {
    const rows = [
      row({ exchange: 'okx', coin: 'BTC', network_label: 'Lightning', enabled: false }),
      row({ exchange: 'upbit', coin: 'BTC', network_label: 'Bitcoin', enabled: true }),
      row({ exchange: 'bithumb', coin: 'USDT', network_label: 'TRC20', enabled: false }),
    ];
    const result = filterDisabledWithdrawals(rows);
    expect(result).toHaveLength(2);
    expect(result.every(r => !r.enabled)).toBe(true);
  });

  it('BTC/USDT 외 코인은 비활성이어도 제외한다', () => {
    const rows = [
      row({ exchange: 'okx', coin: 'ETH', network_label: 'ERC20', enabled: false }),
      row({ exchange: 'okx', coin: 'SOL', network_label: 'Solana', enabled: false }),
    ];
    expect(filterDisabledWithdrawals(rows)).toHaveLength(0);
  });

  it('거래소 → 코인 → 네트워크 순으로 정렬한다', () => {
    const rows = [
      row({ exchange: 'okx', coin: 'USDT', network_label: 'TRC20', enabled: false }),
      row({ exchange: 'bithumb', coin: 'USDT', network_label: 'TRC20', enabled: false }),
      row({ exchange: 'okx', coin: 'BTC', network_label: 'Lightning', enabled: false }),
    ];
    const result = filterDisabledWithdrawals(rows);
    expect(result.map(r => `${r.exchange}:${r.coin}`)).toEqual([
      'bithumb:USDT',
      'okx:BTC',
      'okx:USDT',
    ]);
  });

  it('거래소×코인×네트워크 중복은 한 번만 남긴다', () => {
    const rows = [
      row({ exchange: 'okx', coin: 'BTC', network_label: 'Lightning', enabled: false }),
      row({ exchange: 'okx', coin: 'BTC', network_label: 'Lightning', enabled: false }),
    ];
    expect(filterDisabledWithdrawals(rows)).toHaveLength(1);
  });

  it('비활성 행이 없으면 빈 배열을 반환한다', () => {
    const rows = [row({ enabled: true }), row({ coin: 'USDT', enabled: true })];
    expect(filterDisabledWithdrawals(rows)).toEqual([]);
  });

  it('레거시 BTC 온체인 망(BTC (SegWit) 등)은 비활성이어도 제외한다', () => {
    const rows = [
      row({ exchange: 'binance', coin: 'BTC', network_label: 'BTC (SegWit)', enabled: false }),
      row({ exchange: 'okx', coin: 'BTC', network_label: 'Bitcoin (Legacy)', enabled: false }),
    ];
    expect(filterDisabledWithdrawals(rows)).toHaveLength(0);
  });

  it('네이티브/라이트닝 BTC 망은 segwit 표기가 있어도 제외하지 않는다', () => {
    const rows = [
      row({ exchange: 'binance', coin: 'BTC', network_label: 'Bitcoin', enabled: false }),
      row({ exchange: 'okx', coin: 'BTC', network_label: 'Native SegWit', enabled: false }),
      row({ exchange: 'bitget', coin: 'BTC', network_label: 'Lightning Network', enabled: false }),
    ];
    expect(filterDisabledWithdrawals(rows)).toHaveLength(3);
  });
});
