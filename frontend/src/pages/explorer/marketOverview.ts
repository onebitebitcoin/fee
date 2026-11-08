// 첫 화면 시세 카드 보강(24시간 가격 추이·청산)과 뉴스 키워드 카드의 순수 계산 함수.
import type { LiquidationHour, NewsKeyword } from '../../types';

/** 달러 금액을 짧게 쓴다: 1,412만 달러 → "$14.1M", 83만 → "$836K". */
export function fmtUsdCompact(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${Math.round(v / 1e3)}K`;
  return `$${Math.round(v)}`;
}

/** 0~1 범위로 정규화한 스파크라인 좌표. y 는 위가 0(고가). 값이 하나뿐이면 가운데에 둔다. */
export function sparkPoints(values: number[]): { x: number; y: number }[] {
  if (values.length === 0) return [];
  const hi = Math.max(...values), lo = Math.min(...values), span = hi - lo;
  const n = values.length;
  return values.map((v, i) => ({ x: n === 1 ? 0.5 : i / (n - 1), y: span === 0 ? 0.5 : (hi - v) / span }));
}

/** 롱 청산 비중(0~100). 둘 다 0 이면 null — 막대를 그리지 않는다. */
export function longShare(totalLong: number, totalShort: number): number | null {
  const sum = totalLong + totalShort;
  return sum > 0 ? (totalLong / sum) * 100 : null;
}

/** 기록이 있는 시간 중 가장 큰 롱+숏 합계. 막대 높이의 기준. */
export function maxHourTotal(hours: LiquidationHour[]): number {
  return hours.reduce((m, h) => (h.long == null ? m : Math.max(m, h.long + (h.short ?? 0))), 0);
}

/** 기록이 있는 시간 수. 수집을 시작한 지 24시간이 안 됐으면 24 보다 작다. */
export function coveredHours(hours: LiquidationHour[]): number {
  return hours.filter(h => h.long != null).length;
}

/** 급상승: 최근 6시간 안에 2건 이상. */
export function isSurging(k: NewsKeyword): boolean {
  return k.recent >= 2;
}

/** my-news 의 crawled_at 은 시간대 표기가 빠진 경우가 있다. 빠졌으면 UTC 로 읽는다. */
export function parseNewsTime(at: string): Date {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(at) ? at : `${at}Z`);
}

/** 차트 양 끝 시각 — 한국 시간 '11.8 09시'. Intl 의 ko-KR 시 표기에는 이미 '시'가 붙으므로 숫자만 꺼내 조립한다. */
export function fmtHourKst(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    month: 'numeric', day: 'numeric', hour: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Seoul',
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  return `${get('month')}.${get('day')} ${get('hour')}시`;
}

export function fmtTimeKst(d: Date): string {
  return new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Seoul' }).format(d);
}
