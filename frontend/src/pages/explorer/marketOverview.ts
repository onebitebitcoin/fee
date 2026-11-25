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

/** 순위는 최근 기사에 가중치를 둬서 1위가 기사 수 최대가 아닐 수 있다. 막대 길이는 가장 많은 기사 수를 기준으로 잡는다. */
export function maxIssueCount(rank: NewsKeyword[]): number {
  return Math.max(1, ...rank.map(k => k.count));
}

/** 내보내기 파일의 집계 범위(window_hours). 이 필드가 없던 예전 파일은 24시간 집계였다. */
export function windowLabel(hours: number | null | undefined): string {
  return `최근 ${hours ?? 24}시간`;
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

/** 선물 신호 한 줄 판정. tone 은 색을 고른다: up 초록(매수 쪽), down 빨강(매도 쪽), warn 주황(과열), flat 기본색. */
export type SignalTone = 'up' | 'down' | 'warn' | 'flat';
export interface SignalReading { label: string; tone: SignalTone }

/** 펀딩비(8시간, %) → 롱·숏 쏠림. 평소 기준값은 +0.01% 근처다. 쏠림이 심하면 반대 방향 청산이 몰리기 쉬워 과열만 경고색을 쓴다. */
export const FUNDING_HOT_PCT = 0.03;
export function fundingReading(ratePct: number): SignalReading {
  if (ratePct >= FUNDING_HOT_PCT) return { label: '롱 과열', tone: 'warn' };
  if (ratePct <= -0.01) return { label: '숏 과열', tone: 'warn' };
  if (ratePct < 0) return { label: '숏 우세', tone: 'flat' };
  return { label: '균형', tone: 'flat' };
}

/** 펀딩비 막대의 점 위치(0~100). ±0.05% 를 양 끝으로 자른다. */
export function fundingGaugePos(ratePct: number): number {
  const clamped = Math.max(-0.05, Math.min(0.05, ratePct));
  return ((clamped + 0.05) / 0.1) * 100;
}

/** 미결제약정 변화와 가격 방향을 묶어 읽는다. 변화가 1% 미만이면 포지션이 거의 그대로다. */
export const OI_FLAT_PCT = 1;
export function positionReading(oiChangePct: number, priceChangePct: number): SignalReading {
  if (Math.abs(oiChangePct) < OI_FLAT_PCT) return { label: '관망', tone: 'flat' };
  const up = priceChangePct >= 0;
  if (oiChangePct > 0) return up ? { label: '매수 유입', tone: 'up' } : { label: '매도 유입', tone: 'down' };
  return up ? { label: '숏 청산 반등', tone: 'up' } : { label: '롱 정리', tone: 'down' };
}

/** 부호를 붙인 퍼센트. */
export function signedPct(v: number, digits: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`;
}
