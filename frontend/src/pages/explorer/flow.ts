// ── Flow Graph ─────────────────────────────────────────────────────────────────
// 각 단계(phase)의 다음/이전 이동을 선언적으로 정의.
// 순서나 경로를 바꾸려면 이 파일의 FLOW 배열만 수정하면 된다.
// 새 단계 추가: steps/XStep.tsx 작성 → registry.tsx 등록 → 여기 FLOW에 끼워넣기.

export type Phase =
  | 'input' | 'domestic' | 'coin' | 'btc_method'
  | 'global' | 'global_exit_method' | 'network' | 'swap_service' | 'result';

export type CoinType = 'USDT' | 'BTC' | 'BTC_GLOBAL';

// 진행 방향(애니메이션) 판정용 선형 순서
export const PHASES: Phase[] = [
  'input', 'domestic', 'coin', 'btc_method',
  'global', 'network', 'global_exit_method', 'swap_service', 'result',
];

export const phaseIdx = (p: Phase) => PHASES.indexOf(p);

// FLOW 분기에 필요한 최소 상태
export type FlowState = {
  coin: CoinType | null;
  globalExitMethod: 'onchain' | 'lightning' | 'none' | null;
  swapSvc: string | null;
};

export const FLOW: ReadonlyArray<{ id: Phase; next: (s: FlowState) => Phase }> = [
  { id: 'domestic',           next: ()  => 'coin' },
  { id: 'coin',               next: (s) => s.coin === 'USDT' ? 'global' : 'btc_method' },
  { id: 'btc_method',         next: (s) => s.coin === 'BTC' ? 'result' : 'global' },
  { id: 'global',             next: (s) => s.coin === 'USDT' ? 'network' : 'global_exit_method' },
  { id: 'network',            next: ()  => 'global_exit_method' },
  { id: 'global_exit_method', next: (s) => s.globalExitMethod === 'none' ? 'result' : s.globalExitMethod === 'lightning' ? 'swap_service' : 'result' },
  { id: 'swap_service',       next: ()  => 'result' },
  { id: 'result',             next: ()  => 'result' },
];

export function flowNext(id: Phase, s: FlowState): Phase {
  return FLOW.find(f => f.id === id)?.next(s) ?? 'result';
}

export function flowPrev(id: Phase, s: FlowState): Phase | null {
  for (const step of FLOW) {
    if (step.id !== id && step.next(s) === id) return step.id;
  }
  return null;
}

export function flowSteps(s: FlowState): Phase[] {
  const seq: Phase[] = [];
  let cur: Phase = 'domestic';
  while (cur !== 'result') {
    seq.push(cur);
    cur = flowNext(cur, s);
  }
  seq.push('result');
  return seq;
}
