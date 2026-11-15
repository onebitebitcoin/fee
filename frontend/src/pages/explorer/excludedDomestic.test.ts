import { describe, expect, it } from 'vitest';
import { computeExcludedDomestic } from './derivations';
import type { AllData } from './constants';
import type { CheapestPathResponse } from '../../types';

function entry(excluded: CheapestPathResponse['excluded_korean_exchanges']): CheapestPathResponse {
  return { mode: 'buy', excluded_korean_exchanges: excluded } as unknown as CheapestPathResponse;
}

function allData(byGlobal: Record<string, CheapestPathResponse>): AllData {
  return { byGlobal, tickers: [], latestRunAt: null };
}

const gopaxErr = { exchange: 'gopax', errors: [{ exchange: 'gopax', coin: null, stage: 'ticker', error_message: 'Gopax 오류: 404', created_at: 1 }] };

describe('computeExcludedDomestic', () => {
  it('데이터가 없으면 빈 배열을 반환한다', () => {
    expect(computeExcludedDomestic(null, [])).toEqual([]);
  });

  it('글로벌 거래소별 응답에 중복으로 실린 제외 거래소를 한 번만 반환한다', () => {
    const data = allData({ binance: entry([gopaxErr]), okx: entry([gopaxErr]) });
    expect(computeExcludedDomestic(data, [])).toEqual(['gopax']);
  });

  it('필드가 없는 예전 응답도 처리한다', () => {
    const data = allData({ binance: entry(undefined) });
    expect(computeExcludedDomestic(data, [])).toEqual([]);
  });

  it('선택지로 이미 보이는 거래소는 제외 목록에서 뺀다', () => {
    const data = allData({ binance: entry([gopaxErr]) });
    expect(computeExcludedDomestic(data, ['gopax'])).toEqual([]);
  });
});
