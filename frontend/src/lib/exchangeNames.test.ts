import { describe, expect, it } from 'vitest';
import { fmtEx, fmtExFormer, fmtExWithFormer, getExchangeDomain, getFaviconUrl } from './exchangeNames';

describe('사명이 바뀐 거래소 (코빗 → 디지털엑스)', () => {
  it('표시명은 새 이름을 쓴다', () => {
    expect(fmtEx('korbit')).toBe('디지털엑스');
  });

  it('거래소 id 는 그대로 korbit 을 쓴다', () => {
    // 백엔드 응답·DB·경로 계산이 모두 이 id 를 기준으로 하므로 id 를 바꾸면 연결이 끊긴다.
    expect(fmtEx('KORBIT')).toBe('디지털엑스');
    expect(getExchangeDomain('korbit')).toBe('digitalx.miraeasset.com');
  });

  it('예전 이름을 남겨 검색과 상세 표기에 쓴다', () => {
    expect(fmtExFormer('korbit')).toBe('코빗');
    expect(fmtExWithFormer('korbit')).toBe('디지털엑스 (구 코빗)');
  });

  it('파비콘도 새 도메인에서 가져온다', () => {
    expect(getFaviconUrl('korbit', 24)).toContain('digitalx.miraeasset.com');
  });
});

describe('사명이 바뀐 적 없는 거래소', () => {
  it('예전 이름이 없다', () => {
    for (const id of ['upbit', 'bithumb', 'coinone', 'gopax', 'binance']) {
      expect(fmtExFormer(id)).toBeNull();
    }
  });

  it('새 이름만 표시한다', () => {
    expect(fmtExWithFormer('upbit')).toBe('업비트');
  });

  it('모르는 id 는 그대로 돌려준다', () => {
    expect(fmtEx('unknown-exchange')).toBe('unknown-exchange');
    expect(fmtExFormer('unknown-exchange')).toBeNull();
  });
});
