import { describe, expect, it } from 'vitest';
import { coveredHours, fmtHourKst, fmtUsdCompact, isSurging, longShare, maxHourTotal, parseNewsTime, sparkPoints } from './marketOverview';

describe('marketOverview', () => {
  it('달러를 짧게 쓴다', () => {
    expect(fmtUsdCompact(14_146_951)).toBe('$14.1M');
    expect(fmtUsdCompact(836_401)).toBe('$836K');
    expect(fmtUsdCompact(2_500_000_000)).toBe('$2.5B');
    expect(fmtUsdCompact(12)).toBe('$12');
  });

  it('스파크라인 좌표는 고가가 위(0), 저가가 아래(1)', () => {
    expect(sparkPoints([10, 20, 15])).toEqual([{ x: 0, y: 1 }, { x: 0.5, y: 0 }, { x: 1, y: 0.5 }]);
    expect(sparkPoints([5, 5])).toEqual([{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }]);
    expect(sparkPoints([])).toEqual([]);
  });

  it('롱 청산 비중과 시간별 최대치는 기록 없는 시간을 건너뛴다', () => {
    expect(longShare(75, 25)).toBe(75);
    expect(longShare(0, 0)).toBeNull();
    const hours = [
      { t: 'a', long: null, short: null },
      { t: 'b', long: 100, short: 50 },
      { t: 'c', long: 10, short: 0 },
    ];
    expect(maxHourTotal(hours)).toBe(150);
    expect(coveredHours(hours)).toBe(2);
  });

  it('급상승은 최근 6시간 기사 2건 이상', () => {
    expect(isSurging({ name: 'ETF', count: 9, recent: 2, items: [] })).toBe(true);
    expect(isSurging({ name: 'XRP', count: 21, recent: 1, items: [] })).toBe(false);
  });

  it('시간대 표기 없는 뉴스 시각은 UTC 로 읽는다', () => {
    expect(parseNewsTime('2026-11-08T20:30:31').toISOString()).toBe('2026-11-08T20:30:31.000Z');
    expect(parseNewsTime('2026-11-08T20:30:31+00:00').toISOString()).toBe('2026-11-08T20:30:31.000Z');
    expect(parseNewsTime('2026-11-08T20:40:44.011Z').toISOString()).toBe('2026-11-08T20:40:44.011Z');
  });

  it('차트 시각은 날짜와 한 번만 붙은 시로 쓴다(한국 시간)', () => {
    expect(fmtHourKst('2026-11-08T23:00:00+00:00')).toBe('11.9 08시');
    expect(fmtHourKst('2026-11-08T00:00:00+00:00')).toBe('11.8 09시');
  });
});
