import { describe, it, expect } from 'vitest';
import {
  filterDisabledWithdrawals,
  formatDisabledDuration,
  formatSuspensionReason,
  resolveDisabledNoticeLink,
} from './disabledNetworks';
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

describe('formatDisabledDuration', () => {
  const since = 1_788_000_000;
  const HOUR = 3600;
  const DAY = 86_400;

  it('중단 시작 시각이 없으면 null을 반환한다', () => {
    expect(formatDisabledDuration(null, since + DAY)).toBeNull();
    expect(formatDisabledDuration(undefined, since + DAY)).toBeNull();
  });

  it('1시간 미만은 분 단위로 표기한다', () => {
    expect(formatDisabledDuration(since, since + 25 * 60)).toBe('25분째');
  });

  it('하루 미만은 시간 단위로 표기한다', () => {
    expect(formatDisabledDuration(since, since + 5 * HOUR + 40 * 60)).toBe('5시간째');
  });

  it('하루 이상은 일 + 시간으로 표기한다', () => {
    expect(formatDisabledDuration(since, since + 3 * DAY + 4 * HOUR)).toBe('3일 4시간째');
  });

  it('일 단위로 딱 맞으면 시간을 생략한다', () => {
    expect(formatDisabledDuration(since, since + 12 * DAY)).toBe('12일째');
  });

  it('1분 미만이거나 시각이 미래면 "방금"으로 표기한다', () => {
    expect(formatDisabledDuration(since, since + 30)).toBe('방금');
    expect(formatDisabledDuration(since, since - 100)).toBe('방금');
  });

  it('전환 시점을 관측하지 못한 경우 하한값임을 "최소"로 알린다', () => {
    expect(formatDisabledDuration(since, since + 40 * DAY, { exact: false })).toBe('최소 40일째');
    expect(formatDisabledDuration(since, since + 40 * DAY, { exact: true })).toBe('40일째');
  });
});

describe('formatSuspensionReason', () => {
  it('알려진 영문 사유는 한국어로 옮긴다', () => {
    expect(formatSuspensionReason('System Maintenance')).toBe('시스템 점검');
  });

  it('대소문자와 앞뒤 공백이 달라도 같은 사유로 본다', () => {
    expect(formatSuspensionReason('  system maintenance ')).toBe('시스템 점검');
  });

  it('매핑에 없는 사유는 원문을 그대로 보여준다', () => {
    expect(formatSuspensionReason('Wallet Upgrade')).toBe('Wallet Upgrade');
  });

  it('사유가 없으면 null을 반환한다', () => {
    expect(formatSuspensionReason(null)).toBeNull();
    expect(formatSuspensionReason(undefined)).toBeNull();
    expect(formatSuspensionReason('   ')).toBeNull();
  });
});

describe('resolveDisabledNoticeLink', () => {
  const notice = { title: '테더(USDT) Tron 네트워크 출금 일시 중단 안내', url: 'https://feed.bithumb.com/notice/1654774' };

  it('사유와 공지가 모두 있으면 사유 문구 자체가 공지 링크가 된다', () => {
    const result = resolveDisabledNoticeLink('시스템 점검', notice);
    expect(result).toEqual({
      label: '사유: 시스템 점검',
      url: 'https://feed.bithumb.com/notice/1654774',
      title: '테더(USDT) Tron 네트워크 출금 일시 중단 안내',
    });
  });

  it('사유만 있으면 링크 없는 문구로 남는다', () => {
    const result = resolveDisabledNoticeLink('시스템 점검', null);
    expect(result).toEqual({ label: '사유: 시스템 점검', url: null, title: null });
  });

  it('거래소가 사유를 주지 않고 공지만 있으면 공지 링크를 따로 보여준다', () => {
    const result = resolveDisabledNoticeLink(null, notice);
    expect(result).toEqual({
      label: '중단 공지',
      url: 'https://feed.bithumb.com/notice/1654774',
      title: '테더(USDT) Tron 네트워크 출금 일시 중단 안내',
    });
  });

  it('사유도 공지도 없으면 아무것도 표시하지 않는다', () => {
    expect(resolveDisabledNoticeLink(null, null)).toBeNull();
    expect(resolveDisabledNoticeLink(null, undefined)).toBeNull();
  });

  it('공지에 url이 없으면 링크로 쓰지 않는다', () => {
    const result = resolveDisabledNoticeLink('시스템 점검', { title: '제목만 있는 공지', url: null });
    expect(result).toEqual({ label: '사유: 시스템 점검', url: null, title: null });
  });

  it('url 없는 공지만 있고 사유도 없으면 표시할 것이 없다', () => {
    expect(resolveDisabledNoticeLink(null, { title: '제목만 있는 공지', url: null })).toBeNull();
  });
});
