import { describe, expect, it } from 'vitest';
import { flowNext, flowPrev, flowStart, phaseIdx, sellPhasesAfter, type FlowState, type Phase } from './flow';

const empty: FlowState = {
  coin: null, btcMethod: null, globalExitMethod: null, destination: null, swapSvc: null,
};
const state = (over: Partial<FlowState>): FlowState => ({ ...empty, ...over });

/** 시작 단계부터 result 까지 실제로 거쳐가는 단계 목록 */
function walk(s: FlowState, mode: 'buy' | 'sell'): Phase[] {
  const out: Phase[] = [];
  let phase: Phase = flowStart(mode);
  for (let i = 0; i < 12; i++) {
    out.push(phase);
    if (phase === 'result') break;
    const next = flowNext(phase, s, mode);
    if (next === phase) break;
    phase = next;
  }
  return out;
}

describe('SELL_FLOW — 팔 때의 단계 경로 (자금이 움직이는 순서)', () => {
  it('첫 단계는 개인 지갑에서 보내는 방식(btc_method)이다', () => {
    expect(flowStart('sell')).toBe('btc_method');
    expect(flowStart('buy')).toBe('domestic');
  });

  it('국내 직접 온체인: 전송 방식 → 매도 경로 → 국내 거래소 → 결과', () => {
    const s = state({ coin: 'BTC', btcMethod: 'onchain' });
    expect(walk(s, 'sell')).toEqual(['btc_method', 'coin', 'domestic', 'result']);
  });

  it('국내 직접 라이트닝: 전송 방식 바로 다음에 스왑 서비스를 고른다', () => {
    const s = state({ coin: 'BTC', btcMethod: 'lightning', swapSvc: 'Strike' });
    expect(walk(s, 'sell')).toEqual(['btc_method', 'swap_service', 'coin', 'domestic', 'result']);
  });

  it('해외 경유 온체인: 해외 거래소와 네트워크를 거쳐 국내 거래소에서 끝난다', () => {
    const s = state({ coin: 'USDT', btcMethod: 'onchain' });
    expect(walk(s, 'sell')).toEqual(['btc_method', 'coin', 'global', 'network', 'domestic', 'result']);
  });

  it('해외 경유 라이트닝: 스왑 서비스 → 해외 거래소 → 네트워크 → 국내 거래소', () => {
    const s = state({ coin: 'USDT', btcMethod: 'lightning', swapSvc: 'Strike' });
    expect(walk(s, 'sell')).toEqual([
      'btc_method', 'swap_service', 'coin', 'global', 'network', 'domestic', 'result',
    ]);
  });

  it('종착지·해외 출금 방식 단계는 어떤 매도 경로에도 나타나지 않는다', () => {
    const cases: FlowState[] = [
      state({ coin: 'BTC', btcMethod: 'onchain' }),
      state({ coin: 'BTC', btcMethod: 'lightning' }),
      state({ coin: 'USDT', btcMethod: 'onchain' }),
      state({ coin: 'USDT', btcMethod: 'lightning' }),
    ];
    for (const s of cases) {
      expect(walk(s, 'sell')).not.toContain('destination');
      expect(walk(s, 'sell')).not.toContain('global_exit_method');
    }
  });

  it('선형 순서에서도 국내 거래소가 마지막 선택 단계다', () => {
    expect(phaseIdx('btc_method', 'sell')).toBeLessThan(phaseIdx('swap_service', 'sell'));
    expect(phaseIdx('swap_service', 'sell')).toBeLessThan(phaseIdx('coin', 'sell'));
    expect(phaseIdx('network', 'sell')).toBeLessThan(phaseIdx('domestic', 'sell'));
    expect(phaseIdx('domestic', 'sell')).toBeLessThan(phaseIdx('result', 'sell'));
  });
});

describe('flowPrev — 팔 때의 역방향 이동', () => {
  it('온체인이면 매도 경로의 이전 단계는 전송 방식이다', () => {
    expect(flowPrev('coin', state({ btcMethod: 'onchain' }), 'sell')).toBe('btc_method');
  });

  it('라이트닝이면 매도 경로의 이전 단계는 스왑 서비스다', () => {
    expect(flowPrev('coin', state({ btcMethod: 'lightning' }), 'sell')).toBe('swap_service');
  });

  it('국내 직접이면 국내 거래소의 이전 단계는 매도 경로, 해외 경유면 네트워크다', () => {
    expect(flowPrev('domestic', state({ coin: 'BTC', btcMethod: 'onchain' }), 'sell')).toBe('coin');
    expect(flowPrev('domestic', state({ coin: 'USDT', btcMethod: 'onchain' }), 'sell')).toBe('network');
  });

  it('첫 단계(btc_method)의 이전 단계는 없다', () => {
    expect(flowPrev('btc_method', state({ btcMethod: 'onchain' }), 'sell')).toBeNull();
  });
});

describe('BUY_FLOW — 살 때의 경로는 그대로 유지된다', () => {
  it('BTC 직접: 출금 방식에서 결과로 간다', () => {
    const s = state({ coin: 'BTC', btcMethod: 'onchain' });
    expect(walk(s, 'buy')).toEqual(['domestic', 'coin', 'btc_method', 'result']);
  });

  it('USDT 라이트닝 개인지갑: 종착지와 스왑 서비스를 모두 거친다', () => {
    const s = state({ coin: 'USDT', globalExitMethod: 'lightning', destination: 'personal', swapSvc: 'Strike' });
    expect(walk(s, 'buy')).toEqual([
      'domestic', 'coin', 'global', 'network', 'global_exit_method', 'destination', 'swap_service', 'result',
    ]);
  });

  it('USDT 라이트닝 지갑 종착: 스왑 없이 결과로 간다', () => {
    const s = state({ coin: 'USDT', globalExitMethod: 'lightning', destination: 'lightning_wallet' });
    expect(walk(s, 'buy')).toEqual([
      'domestic', 'coin', 'global', 'network', 'global_exit_method', 'destination', 'result',
    ]);
  });

  it('모드를 생략하면 살 때 그래프를 쓴다', () => {
    const s = state({ coin: 'USDT', globalExitMethod: 'lightning' });
    expect(flowNext('global_exit_method', s)).toBe('destination');
  });
});

describe('sellPhasesAfter — 팔 때 선택을 바꾸면 비울 단계', () => {
  it('전송 방식을 바꾸면 그 뒤의 선택을 모두 비운다', () => {
    expect(sellPhasesAfter('btc_method')).toEqual(['swap_service', 'coin', 'global', 'network', 'domestic']);
  });

  it('해외 거래소를 바꾸면 네트워크와 국내 거래소만 비우고 앞의 선택은 남긴다', () => {
    expect(sellPhasesAfter('global')).toEqual(['network', 'domestic']);
  });

  it('마지막 선택인 국내 거래소를 바꾸면 비울 것이 없다', () => {
    expect(sellPhasesAfter('domestic')).toEqual([]);
  });

  it('선택 단계가 아닌 곳에서는 아무것도 비우지 않는다', () => {
    expect(sellPhasesAfter('destination')).toEqual([]);
  });
});
