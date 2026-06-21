import { describe, it, expect } from 'vitest';
import { fmtAmountText } from './constants';

describe('fmtAmountText', () => {
  it('0.001 BTC 미만은 sats로 변환', () => {
    expect(fmtAmountText('0.0002 BTC')).toBe('20000 sats');
    expect(fmtAmountText('0.00001 BTC')).toBe('1000 sats');
  });

  it('지수 표기 + (N회) 접미사도 sats로 변환하고 접미사 유지', () => {
    expect(fmtAmountText('2e-06 BTC (2회)')).toBe('200 sats (2회)');
    expect(fmtAmountText('1e-06 BTC')).toBe('100 sats');
  });

  it('0.001 BTC 이상은 그대로 둔다', () => {
    expect(fmtAmountText('0.5 BTC')).toBe('0.5 BTC');
  });

  it('BTC 형식이 아니면 원문 유지', () => {
    expect(fmtAmountText('1000 sats')).toBe('1000 sats');
    expect(fmtAmountText('1 USDT')).toBe('1 USDT');
  });

  it('빈 값은 null', () => {
    expect(fmtAmountText(null)).toBeNull();
    expect(fmtAmountText(undefined)).toBeNull();
    expect(fmtAmountText('')).toBeNull();
  });
});
