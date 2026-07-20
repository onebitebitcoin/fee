import { describe, expect, it } from 'vitest';
import { buildTimeline, timelinePhases, type TimelineSelection } from './timeline';

const empty: TimelineSelection = {
  domestic: null, coin: null, global: null, network: null,
  btcMethod: null, globalExitMethod: null, destination: null, swapSvc: null,
};

const sel = (over: Partial<TimelineSelection>): TimelineSelection => ({ ...empty, ...over });

describe('timelinePhases — FLOW 분기를 그대로 따른다', () => {
  it('USDT 경로: domestic → coin → global → network', () => {
    const s = sel({ domestic: 'upbit', coin: 'USDT', global: 'binance', network: 'TRC20' });
    expect(timelinePhases(s, 'network')).toEqual(['domestic', 'coin', 'global', 'network']);
  });

  it('BTC 직접 경로: coin에서 btc_method로 분기 후 결과로 끝난다', () => {
    const s = sel({ domestic: 'upbit', coin: 'BTC', btcMethod: 'onchain' });
    expect(timelinePhases(s, 'result')).toEqual(['domestic', 'coin', 'btc_method', 'result']);
  });

  it('BTC 경유 경로: btc_method 다음 global로 간다', () => {
    const s = sel({ domestic: 'upbit', coin: 'BTC_GLOBAL', btcMethod: 'onchain', global: 'binance' });
    expect(timelinePhases(s, 'global')).toEqual(['domestic', 'coin', 'btc_method', 'global']);
  });

  it('라이트닝 + 개인지갑: destination 다음 swap_service까지 이어진다', () => {
    const s = sel({
      domestic: 'bithumb', coin: 'USDT', global: 'binance', network: 'Aptos',
      globalExitMethod: 'lightning', destination: 'personal', swapSvc: 'Strike',
    });
    expect(timelinePhases(s, 'swap_service')).toEqual([
      'domestic', 'coin', 'global', 'network', 'global_exit_method', 'destination', 'swap_service',
    ]);
  });

  it('라이트닝 + 라이트닝 지갑: swap_service를 건너뛴다', () => {
    const s = sel({
      domestic: 'bithumb', coin: 'USDT', global: 'binance', network: 'Aptos',
      globalExitMethod: 'lightning', destination: 'lightning_wallet',
    });
    expect(timelinePhases(s, 'result')).toEqual([
      'domestic', 'coin', 'global', 'network', 'global_exit_method', 'destination', 'result',
    ]);
  });

  it('마법사 밖 단계(input/recommendation)는 빈 배열', () => {
    expect(timelinePhases(empty, 'input')).toEqual([]);
    expect(timelinePhases(empty, 'recommendation')).toEqual([]);
  });
});

describe('buildTimeline — 라벨·값·상태', () => {
  it('선택값을 한글 라벨로 보여주고 현재 단계만 current', () => {
    const s = sel({ domestic: 'upbit', coin: 'USDT', global: 'binance' });
    const steps = buildTimeline(s, 'global');
    expect(steps.map(x => [x.label, x.value, x.state])).toEqual([
      ['국내 거래소', '업비트', 'done'],
      ['이동 방식', 'USDT 경유', 'done'],
      ['해외 거래소', '바이낸스', 'current'],
    ]);
  });

  it('거래소·스왑 서비스 단계만 파비콘 id를 갖는다', () => {
    const s = sel({ domestic: 'upbit', coin: 'USDT', global: 'binance', network: 'TRC20' });
    const byPhase = Object.fromEntries(buildTimeline(s, 'network').map(x => [x.phase, x.iconId]));
    expect(byPhase.domestic).toBe('upbit');
    expect(byPhase.global).toBe('binance');
    expect(byPhase.coin).toBeNull();
    expect(byPhase.network).toBeNull();
  });

  it('아직 고르지 않은 현재 단계는 value가 null', () => {
    const s = sel({ domestic: 'upbit', coin: 'USDT' });
    const steps = buildTimeline(s, 'global');
    expect(steps.at(-1)).toMatchObject({ phase: 'global', value: null, state: 'current' });
  });

  it('종착지·해외 출금 방식도 한글로 변환한다', () => {
    const s = sel({
      domestic: 'bithumb', coin: 'USDT', global: 'binance', network: 'Aptos',
      globalExitMethod: 'lightning', destination: 'lightning_wallet',
    });
    const steps = buildTimeline(s, 'destination');
    expect(steps.find(x => x.phase === 'global_exit_method')?.value).toBe('라이트닝');
    expect(steps.find(x => x.phase === 'destination')?.value).toBe('라이트닝 지갑');
  });
});
