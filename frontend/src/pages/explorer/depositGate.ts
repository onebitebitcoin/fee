// ── 입금 관문 해석 (팔 때 전용) ────────────────────────────────────────────────
// 백엔드가 매도 경로마다 붙여 보낸 `deposit_gates` 를 화면이 어떻게 읽을지 정한다.
//
// 관문은 수수료와 성격이 다르다. 수수료는 얼마를 잃는지를 말하고, 관문은 그 경로를 애초에
// 실행할 수 있는지를 말한다. 그래서 수수료가 가장 싼 경로가 실행 불가능한 경로일 수 있고,
// 그 사실을 알리지 않으면 목록이 제일 싼 경로를 권하는 꼴이 된다.

import type { CheapestPathEntry, DepositGate, DepositGateLevel } from '../../types';

/** 심각도 순서 — 큰 값이 더 심각하다. */
const SEVERITY: Record<DepositGateLevel, number> = {
  blocked: 4,
  required: 3,
  review: 2,
  unknown: 1,
};

/**
 * 사용자가 선언한 사전 조건을 반영한, 지금도 남아 있는 관문.
 *
 * `walletRegistered` 는 "보낼 지갑을 입금할 거래소에 이미 등록해 두었다"는 사용자의 선언이다.
 * 그 선언은 `required`(등록만 하면 통과) 관문만 없앤다.
 *
 * `blocked` 는 없애지 않는다. 거래소가 등록을 받아주는 지갑 목록에 비트코인 온체인 지갑이
 * 아예 없어서 생긴 제약이라, 사용자가 무엇을 등록했든 그 경로가 뚫리지 않기 때문이다.
 * `unknown` 도 남긴다. 사용자의 선언으로 우리가 확인하지 못한 규정이 확인되지는 않는다.
 */
export function activeGates(p: CheapestPathEntry, walletRegistered: boolean): DepositGate[] {
  const gates = p.deposit_gates ?? [];
  if (!walletRegistered) return gates;
  return gates.filter(g => g.level !== 'required');
}

/** 남아 있는 관문 중 가장 심각한 수준. 관문이 없으면 null. */
export function gateSeverity(gates: DepositGate[]): DepositGateLevel | null {
  if (!gates.length) return null;
  return gates.reduce((worst, g) => (SEVERITY[g.level] > SEVERITY[worst] ? g.level : worst), gates[0].level);
}

/**
 * 추천 목록에서 아래로 내릴 경로인지.
 *
 * `blocked`·`required` 만 내린다. `unknown` 은 배지로만 알리고 순서를 건드리지 않는다.
 * 현재 확인된 규정이 적어 대부분의 경로가 `unknown` 인데, 이것까지 내리면 목록 전체가
 * 아래로 밀려 순서가 아무 정보도 주지 못하게 된다.
 */
export function isPathDemoted(p: CheapestPathEntry, walletRegistered: boolean): boolean {
  const level = gateSeverity(activeGates(p, walletRegistered));
  return level === 'blocked' || level === 'required';
}

/** 배지에 쓸 짧은 문구. */
export const GATE_BADGE: Record<DepositGateLevel, string> = {
  blocked: '입금 불가',
  required: '지갑 등록 필요',
  review: '입금 심사',
  unknown: '입금 확인 필요',
};

/** 배지 색. blocked 는 위험, 나머지는 주의·정보 수준으로 구분한다. */
export const GATE_BADGE_CLASS: Record<DepositGateLevel, string> = {
  blocked: 'bg-acc-red/15 text-acc-red',
  required: 'bg-acc-brand/15 text-acc-brand',
  review: 'bg-acc-brand/15 text-acc-brand',
  unknown: 'bg-fill-secondary text-label-tertiary',
};

/**
 * 입금 관문이 있는 경로를 목록 아래로 내린다.
 *
 * 수수료 정렬(`dedupAndSortPaths`)이 끝난 뒤에 적용하는 별도 단계다. 수수료 정렬 자체를
 * 건드리면 살 때의 추천 순서까지 달라지고, 그 순서를 고정한 golden 회귀 테스트가 깨진다.
 * 같은 구간 안에서는 원래의 수수료 순서를 그대로 유지한다(안정 정렬).
 */
export function sortByDepositGate<T extends CheapestPathEntry>(
  paths: T[],
  walletRegistered: boolean,
): T[] {
  const clean: T[] = [];
  const demoted: T[] = [];
  for (const p of paths) {
    (isPathDemoted(p, walletRegistered) ? demoted : clean).push(p);
  }
  return [...clean, ...demoted];
}
