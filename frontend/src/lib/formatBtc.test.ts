import { describe, expect, it } from 'vitest';
import { SATS_PER_BTC, formatCurrency, formatFeeKrw, formatNumber, formatPercent, formatSats } from './formatBtc';

describe('formatBtc utils', () => {
  it('SATS_PER_BTC is 100_000_000', () => {
    expect(SATS_PER_BTC).toBe(100_000_000);
  });

  describe('formatNumber', () => {
    it('formats Korean locale with commas', () => {
      expect(formatNumber(1000000)).toBe('1,000,000');
    });

    it('defaults to 0 decimal places', () => {
      expect(formatNumber(1.5)).toBe('2');
    });

    it('respects maximumFractionDigits', () => {
      expect(formatNumber(1.5, 1)).toBe('1.5');
    });

    it('formats zero', () => {
      expect(formatNumber(0)).toBe('0');
    });
  });

  describe('formatSats', () => {
    it('converts BTC to sats', () => {
      expect(formatSats(0.001)).toBe('100,000 sats');
    });

    it('converts 1 BTC to 100,000,000 sats', () => {
      expect(formatSats(1)).toBe('100,000,000 sats');
    });
  });

  describe('formatCurrency', () => {
    it('shows KRW suffix for integer', () => {
      expect(formatCurrency(1000)).toBe('1,000 KRW');
    });

    it('shows 1 decimal for fractional value', () => {
      expect(formatCurrency(1000.5)).toBe('1,000.5 KRW');
    });
  });

  describe('formatPercent', () => {
    it('shows 2 decimals for value >= 1', () => {
      expect(formatPercent(1.5)).toBe('1.50%');
    });

    it('shows 3 decimals for value < 1', () => {
      expect(formatPercent(0.5)).toBe('0.500%');
    });
  });

  describe('formatFeeKrw', () => {
    it('returns dash for null', () => {
      expect(formatFeeKrw(null)).toBe('-');
    });

    it('returns dash for undefined', () => {
      expect(formatFeeKrw(undefined)).toBe('-');
    });

    it('formats fee with won sign', () => {
      expect(formatFeeKrw(5000)).toBe('₩5,000');
    });

    it('rounds fractional values', () => {
      expect(formatFeeKrw(5000.7)).toBe('₩5,001');
    });
  });
});
