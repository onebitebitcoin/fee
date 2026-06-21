import { describe, it, expect } from 'vitest';
import {
  buildReportQuery,
  parseReportContext,
  buildReportTemplate,
  isReportTemplate,
} from './reportTemplate';

describe('reportTemplate', () => {
  it('buildReportQuery → parseReportContext 왕복 일치', () => {
    const ctx = {
      koreanExchange: 'upbit', globalExchange: 'binance',
      coin: 'BTC', network: 'Bitcoin', amountKrw: 1_000_000, feeText: '12,345원',
    };
    const params = new URLSearchParams(buildReportQuery(ctx));
    expect(isReportTemplate(params)).toBe(true);
    const back = parseReportContext(params);
    expect(back.koreanExchange).toBe('upbit');
    expect(back.globalExchange).toBe('binance');
    expect(back.coin).toBe('BTC');
    expect(back.network).toBe('Bitcoin');
    expect(back.amountKrw).toBe(1_000_000);
    expect(back.feeText).toBe('12,345원');
  });

  it('빈 컨텍스트는 template=report만 포함', () => {
    const params = new URLSearchParams(buildReportQuery({}));
    expect(params.get('template')).toBe('report');
    expect(params.get('kx')).toBeNull();
  });

  it('buildReportTemplate 제목/본문 생성', () => {
    const { title, content } = buildReportTemplate({
      koreanExchange: 'upbit', globalExchange: 'binance',
      coin: 'BTC', network: 'Bitcoin', amountKrw: 1_000_000,
    });
    expect(title).toBe('[제보] upbit → binance 경로 관련');
    expect(content).toContain('- 경로: upbit → binance (BTC, Bitcoin)');
    expect(content).toContain('- 금액: 1,000,000원');
    expect(content).toContain('■ 문제점');
    expect(content).toContain('■ 의견');
  });

  it('경로/금액 미지정 시 안전한 기본값', () => {
    const { title, content } = buildReportTemplate({});
    expect(title).toContain('(경로 미지정)');
    expect(content).toContain('(금액 미지정)');
  });

  it('isReportTemplate false 케이스', () => {
    expect(isReportTemplate(new URLSearchParams(''))).toBe(false);
    expect(isReportTemplate(new URLSearchParams('template=other'))).toBe(false);
  });
});
