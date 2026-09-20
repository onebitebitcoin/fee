import { describe, expect, it } from 'vitest';
import { activeGates, gateSeverity, isPathDemoted, sortByDepositGate } from './depositGate';
import type { CheapestPathEntry, DepositGate, DepositGateLevel } from '../../types';

function gate(level: DepositGateLevel, kind: DepositGate['kind'] = 'personal_wallet'): DepositGate {
  return { kind, level, label: `${level} 라벨`, desc: `${level} 설명` };
}

function path(over: Partial<CheapestPathEntry> = {}): CheapestPathEntry {
  return {
    path_id: 'p',
    korean_exchange: 'upbit',
    transfer_coin: 'BTC',
    network: 'Bitcoin',
    domestic_withdrawal_network: 'Bitcoin',
    global_exit_mode: 'onchain',
    global_exit_network: 'Bitcoin',
    krw_received: 5_000_000,
    total_fee_krw: 2000,
    fee_pct: 0.04,
    deposit_gates: [],
    ...over,
  } as CheapestPathEntry;
}

describe('activeGates — 사용자가 선언한 사전 조건 반영', () => {
  it('등록하지 않았다고 하면 모든 관문이 남는다', () => {
    const p = path({ deposit_gates: [gate('required'), gate('unknown')] });
    expect(activeGates(p, false)).toHaveLength(2);
  });

  it('등록했다고 하면 required 관문만 사라진다', () => {
    const p = path({ deposit_gates: [gate('required'), gate('unknown')] });
    const remaining = activeGates(p, true);
    expect(remaining.map(g => g.level)).toEqual(['unknown']);
  });

  it('blocked 는 등록 선언으로 사라지지 않는다', () => {
    // 거래소가 등록을 받는 지갑 목록에 비트코인 온체인 지갑이 아예 없어서 생긴 제약이라,
    // 사용자가 무엇을 등록했든 이 경로는 뚫리지 않는다.
    const p = path({ deposit_gates: [gate('blocked')] });
    expect(activeGates(p, true).map(g => g.level)).toEqual(['blocked']);
  });

  it('관문 필드가 없으면 빈 배열이다 (살 때의 경로)', () => {
    const p = path({ deposit_gates: undefined });
    expect(activeGates(p, false)).toEqual([]);
  });
});

describe('gateSeverity — 가장 심각한 수준', () => {
  it('관문이 없으면 null', () => {
    expect(gateSeverity([])).toBeNull();
  });

  it('여럿이면 더 심각한 쪽을 고른다', () => {
    expect(gateSeverity([gate('unknown'), gate('blocked')])).toBe('blocked');
    expect(gateSeverity([gate('unknown'), gate('required')])).toBe('required');
    expect(gateSeverity([gate('review'), gate('unknown')])).toBe('review');
  });
});

describe('isPathDemoted — 목록 아래로 내릴 경로', () => {
  it('blocked 와 required 는 내린다', () => {
    expect(isPathDemoted(path({ deposit_gates: [gate('blocked')] }), false)).toBe(true);
    expect(isPathDemoted(path({ deposit_gates: [gate('required')] }), false)).toBe(true);
  });

  it('unknown 은 내리지 않는다', () => {
    // 확인된 규정이 적어 대부분의 경로가 unknown 인데, 이것까지 내리면 순서가 정보를 잃는다.
    expect(isPathDemoted(path({ deposit_gates: [gate('unknown')] }), false)).toBe(false);
  });

  it('등록했다고 선언하면 required 경로는 내려가지 않는다', () => {
    expect(isPathDemoted(path({ deposit_gates: [gate('required')] }), true)).toBe(false);
  });
});

describe('sortByDepositGate — 관문 경로를 아래로', () => {
  it('막힌 경로가 더 싸도 아래로 내려간다', () => {
    const cheapBlocked = path({ path_id: 'cheap-blocked', total_fee_krw: 2350, deposit_gates: [gate('blocked')] });
    const pricyClean = path({ path_id: 'pricy-clean', total_fee_krw: 7981, deposit_gates: [] });
    const out = sortByDepositGate([cheapBlocked, pricyClean], false);
    expect(out.map(p => p.path_id)).toEqual(['pricy-clean', 'cheap-blocked']);
  });

  it('같은 구간 안에서는 원래 순서를 유지한다 (안정 정렬)', () => {
    const a = path({ path_id: 'a', deposit_gates: [] });
    const b = path({ path_id: 'b', deposit_gates: [] });
    const c = path({ path_id: 'c', deposit_gates: [gate('blocked')] });
    const d = path({ path_id: 'd', deposit_gates: [gate('required')] });
    expect(sortByDepositGate([a, c, b, d], false).map(p => p.path_id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('관문이 없으면 순서를 바꾸지 않는다 (살 때)', () => {
    const paths = [path({ path_id: '1' }), path({ path_id: '2' }), path({ path_id: '3' })];
    expect(sortByDepositGate(paths, false).map(p => p.path_id)).toEqual(['1', '2', '3']);
  });
});
