// ── Flow Graph ─────────────────────────────────────────────────────────────────
// 각 단계(phase)의 다음/이전 이동을 선언적으로 정의.
// 순서나 경로를 바꾸려면 이 파일의 BUY_FLOW / SELL_FLOW 배열만 수정하면 된다.
// 새 단계 추가: steps/XStep.tsx 작성 → registry.tsx 등록 → 여기 FLOW에 끼워넣기.
//
// 탐색 방향(mode)에 따라 그래프가 갈린다.
//  - 살 때(buy):  국내 거래소에서 사서 → 개인 지갑으로 받는다. 종착지가 지갑이라
//                 라이트닝 출금 뒤 '어떤 지갑으로 받을지'(destination)를 고르는 단계가 있다.
//  - 팔 때(sell): 개인 지갑에서 보내 → 국내 거래소에서 원화로 받는다. 종착지가 원화
//                 계좌로 고정이라 destination 단계가 없다. 출발점이 이미 개인 지갑이므로
//                 국내 BTC 를 해외로 옮기는 BTC_GLOBAL 경로도 존재하지 않는다.

import type { PathMode } from '../../types';

export type Phase =
  | 'input' | 'recommendation' | 'domestic' | 'coin' | 'btc_method'
  | 'global' | 'global_exit_method' | 'network' | 'destination' | 'swap_service' | 'result';

export type CoinType = 'USDT' | 'BTC' | 'BTC_GLOBAL';

// 종착지: 개인 온체인 지갑 / 라이트닝 지갑(LN 직접출금 종착). 살 때만 쓰인다.
export type Destination = 'personal' | 'lightning_wallet';

// 진행 방향(애니메이션) 판정용 선형 순서
export const PHASES: Phase[] = [
  'input', 'recommendation', 'domestic', 'coin', 'btc_method',
  'global', 'network', 'global_exit_method', 'destination', 'swap_service', 'result',
];

export const phaseIdx = (p: Phase) => PHASES.indexOf(p);

// FLOW 분기에 필요한 최소 상태
export type FlowState = {
  coin: CoinType | null;
  // 살 때는 '국내 거래소에서 지갑으로 보내는 방식', 팔 때는 '지갑에서 국내 거래소로 보내는 방식'
  btcMethod: 'onchain' | 'lightning' | null;
  globalExitMethod: 'onchain' | 'lightning' | 'none' | null;
  destination: Destination | null;
  swapSvc: string | null;
};

type FlowGraph = ReadonlyArray<{ id: Phase; next: (s: FlowState) => Phase }>;

export const BUY_FLOW: FlowGraph = [
  { id: 'domestic',           next: ()  => 'coin' },
  { id: 'coin',               next: (s) => s.coin === 'USDT' ? 'global' : 'btc_method' },
  { id: 'btc_method',         next: (s) => s.coin === 'BTC' ? 'result' : 'global' },
  { id: 'global',             next: (s) => s.coin === 'USDT' ? 'network' : 'global_exit_method' },
  { id: 'network',            next: ()  => 'global_exit_method' },
  { id: 'global_exit_method', next: (s) => s.globalExitMethod === 'lightning' ? 'destination' : 'result' },
  { id: 'destination',        next: (s) => s.destination === 'lightning_wallet' ? 'result' : 'swap_service' },
  { id: 'swap_service',       next: ()  => 'result' },
  { id: 'result',             next: ()  => 'result' },
];

// 팔 때의 그래프. 라이트닝을 고르면 개인 지갑의 온체인 BTC 를 라이트닝으로 바꿔줄
// 스왑 서비스를 골라야 하므로, BTC 직접 경로와 USDT 경유 경로 모두 swap_service 로 이어진다.
// 두 경로가 같은 단계로 합류하지만, 분기 조건이 서로 배타적이라(코인 선택 시 btcMethod 를
// 비우고, USDT 경로에서는 btcMethod 가 null) 역방향 탐색에서 충돌하지 않는다.
export const SELL_FLOW: FlowGraph = [
  { id: 'domestic',           next: ()  => 'coin' },
  { id: 'coin',               next: (s) => s.coin === 'USDT' ? 'global' : 'btc_method' },
  { id: 'btc_method',         next: (s) => s.btcMethod === 'lightning' ? 'swap_service' : 'result' },
  { id: 'global',             next: ()  => 'network' },
  { id: 'network',            next: ()  => 'global_exit_method' },
  { id: 'global_exit_method', next: (s) => s.globalExitMethod === 'lightning' ? 'swap_service' : 'result' },
  { id: 'swap_service',       next: ()  => 'result' },
  { id: 'result',             next: ()  => 'result' },
];

export function flowFor(mode: PathMode): FlowGraph {
  return mode === 'sell' ? SELL_FLOW : BUY_FLOW;
}

export function flowNext(id: Phase, s: FlowState, mode: PathMode = 'buy'): Phase {
  return flowFor(mode).find(f => f.id === id)?.next(s) ?? 'result';
}

export function flowPrev(id: Phase, s: FlowState, mode: PathMode = 'buy'): Phase | null {
  for (const step of flowFor(mode)) {
    if (step.id !== id && step.next(s) === id) return step.id;
  }
  return null;
}
