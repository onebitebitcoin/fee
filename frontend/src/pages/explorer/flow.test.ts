import { describe, expect, it } from 'vitest';
import { flowNext, flowPrev, type FlowState, type Phase } from './flow';

const empty: FlowState = {
  coin: null, btcMethod: null, globalExitMethod: null, destination: null, swapSvc: null,
};
const state = (over: Partial<FlowState>): FlowState => ({ ...empty, ...over });

/** 시작 단계부터 result 까지 실제로 거쳐가는 단계 목록 */
function walk(s: FlowState, mode: 'buy' | 'sell'): Phase[] {
  const out: Phase[] = [];
  let phase: Phase = 'domestic';
  for (let i = 0; i < 12; i++) {
    out.push(phase);
    if (phase === 'result') break;
    const next = flowNext(phase, s, mode);
    if (next === phase) break;
    phase = next;
  }
  return out;
}

describe('SELL_FLOW — 팔 때의 단계 경로', () => {
  it('BTC 직접 온체인: 종착지 단계 없이 전송 방식에서 결과로 간다', () => {
    const s = state({ coin: 'BTC', btcMethod: 'onchain' });
    expect(walk(s, 'sell')).toEqual(['domestic', 'coin', 'btc_method', 'result']);
  });

  it('BTC 직접 라이트닝: 스왑 서비스를 거친다', () => {
    const s = state({ coin: 'BTC', btcMethod: 'lightning', swapSvc: 'Strike' });
    expect(walk(s, 'sell')).toEqual(['domestic', 'coin', 'btc_method', 'swap_service', 'result']);
  });

  it('USDT 경유 온체인: 해외 거래소와 네트워크를 거쳐 전송 방식에서 끝난다', () => {
    const s = state({ coin: 'USDT', globalExitMethod: 'onchain' });
    expect(walk(s, 'sell')).toEqual(['domestic', 'coin', 'global', 'network', 'global_exit_method', 'result']);
  });

  it('USDT 경유 라이트닝: 전송 방식 다음 스왑 서비스로 간다', () => {
    const s = state({ coin: 'USDT', globalExitMethod: 'lightning', swapSvc: 'Strike' });
    expect(walk(s, 'sell')).toEqual([
      'domestic', 'coin', 'global', 'network', 'global_exit_method', 'swap_service', 'result',
    ]);
  });

  it('종착지(destination) 단계는 어떤 매도 경로에도 나타나지 않는다', () => {
    const cases: FlowState[] = [
      state({ coin: 'BTC', btcMethod: 'onchain' }),
      state({ coin: 'BTC', btcMethod: 'lightning' }),
      state({ coin: 'USDT', globalExitMethod: 'onchain' }),
      state({ coin: 'USDT', globalExitMethod: 'lightning' }),
    ];
    for (const s of cases) {
      expect(walk(s, 'sell')).not.toContain('destination');
    }
  });
});

describe('flowPrev — 팔 때의 역방향 이동', () => {
  it('BTC 직접 라이트닝에서 스왑 서비스의 이전 단계는 전송 방식(btc_method)이다', () => {
    const s = state({ coin: 'BTC', btcMethod: 'lightning' });
    expect(flowPrev('swap_service', s, 'sell')).toBe('btc_method');
  });

  it('USDT 경유 라이트닝에서 스왑 서비스의 이전 단계는 해외 전송 방식이다', () => {
    // 두 경로가 같은 swap_service 로 합류하지만, btcMethod 가 비어 있어 분기가 겹치지 않는다.
    const s = state({ coin: 'USDT', globalExitMethod: 'lightning' });
    expect(flowPrev('swap_service', s, 'sell')).toBe('global_exit_method');
  });

  it('첫 단계(domestic)의 이전 단계는 없다', () => {
    expect(flowPrev('domestic', state({ coin: 'BTC' }), 'sell')).toBeNull();
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
