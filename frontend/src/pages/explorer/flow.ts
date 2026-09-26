// ── Flow Graph ─────────────────────────────────────────────────────────────────
// 각 단계(phase)의 다음/이전 이동을 선언적으로 정의.
// 순서나 경로를 바꾸려면 이 파일의 BUY_FLOW / SELL_FLOW 배열만 수정하면 된다.
// 새 단계 추가: steps/XStep.tsx 작성 → registry.tsx 등록 → 여기 FLOW에 끼워넣기.
//
// 탐색 방향(mode)에 따라 그래프가 갈린다.
//  - 살 때(buy):  국내 거래소에서 사서 → 개인 지갑으로 받는다. 종착지가 지갑이라
//                 라이트닝 출금 뒤 '어떤 지갑으로 받을지'(destination)를 고르는 단계가 있다.
//  - 팔 때(sell): 개인 지갑에서 보내 → 국내 거래소에서 원화로 받는다. 단계도 자금이
//                 움직이는 순서를 따른다. 지갑에서 보내는 방식을 먼저 고르고, 해외 거래소를
//                 거친다면 그 거래소와 USDT 네트워크를 고른 뒤, 원화를 받을 국내 거래소를
//                 마지막에 고른다. 종착지가 원화 계좌로 고정이라 destination 단계가 없고,
//                 출발점이 이미 개인 지갑이므로 BTC_GLOBAL 경로도 존재하지 않는다.

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

// 팔 때의 선형 순서. 선택을 바꿨을 때 뒤쪽 선택을 비우는 기준으로도 쓴다.
export const SELL_PHASES: Phase[] = [
  'input', 'recommendation', 'btc_method', 'swap_service', 'coin',
  'global', 'network', 'domestic', 'result',
];

export const phaseIdx = (p: Phase, mode: PathMode = 'buy') =>
  (mode === 'sell' ? SELL_PHASES : PHASES).indexOf(p);

/**
 * 팔 때 phase 에서 선택을 바꾸면 비워야 하는 뒤쪽 선택 단계들.
 * 뒤 단계의 선택지는 앞 단계의 선택으로 걸러진 것이라 앞이 바뀌면 더 이상 유효하지 않다.
 * 선택값이 없는 단계(input/recommendation/result)는 넣지 않는다.
 */
export function sellPhasesAfter(phase: Phase): Phase[] {
  const idx = SELL_PHASES.indexOf(phase);
  if (idx < 0) return [];
  return SELL_PHASES.slice(idx + 1).filter(p => p !== 'result');
}

/** 마법사의 첫 단계. '내 경로 찾기'로 들어오면 이 단계부터 시작한다. */
export function flowStart(mode: PathMode): Phase {
  return mode === 'sell' ? 'btc_method' : 'domestic';
}

// FLOW 분기에 필요한 최소 상태
export type FlowState = {
  coin: CoinType | null;
  // 살 때는 '국내 거래소에서 지갑으로 보내는 방식', 팔 때는 '개인 지갑에서 첫 거래소로 보내는 방식'
  // (팔 때는 경로 종류와 무관하게 이 값 하나가 전송 방식을 쥐고, globalExitMethod 는 쓰지 않는다)
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

// 팔 때의 그래프. 전송 방식이 라이트닝이면 개인 지갑의 온체인 BTC 를 라이트닝으로 바꿔줄
// 스왑 서비스를 바로 다음에 고른다. 그다음 매도 경로(국내 직접 / 해외 경유)를 고르고,
// 해외 경유라면 해외 거래소와 USDT 네트워크를 거쳐 국내 거래소에서 끝난다.
// coin 으로 들어오는 단계가 둘(btc_method, swap_service)이지만 btc_method 가 앞에 있고
// 라이트닝일 때는 btc_method 가 coin 을 가리키지 않으므로 역방향 탐색이 충돌하지 않는다.
export const SELL_FLOW: FlowGraph = [
  { id: 'btc_method',   next: (s) => s.btcMethod === 'lightning' ? 'swap_service' : 'coin' },
  { id: 'swap_service', next: ()  => 'coin' },
  { id: 'coin',         next: (s) => s.coin === 'USDT' ? 'global' : 'domestic' },
  { id: 'global',       next: ()  => 'network' },
  { id: 'network',      next: ()  => 'domestic' },
  { id: 'domestic',     next: ()  => 'result' },
  { id: 'result',       next: ()  => 'result' },
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
