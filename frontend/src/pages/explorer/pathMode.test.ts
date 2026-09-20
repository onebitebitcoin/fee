import { describe, expect, it } from 'vitest';
import { isLightningPath, receivedAmount, usesGlobalExchange } from './pathMode';
import type { CheapestPathEntry } from '../../types';

/** 매수 응답 형태의 경로 엔트리 */
function buyPath(over: Partial<CheapestPathEntry> = {}): CheapestPathEntry {
  return {
    path_id: 'buy',
    korean_exchange: 'bithumb',
    transfer_coin: 'USDT',
    network: 'TRC20',
    domestic_withdrawal_network: 'TRC20',
    global_exit_mode: 'onchain',
    global_exit_network: 'Bitcoin',
    btc_received: 0.01,
    total_fee_krw: 1000,
    fee_pct: 0.1,
    ...over,
  } as CheapestPathEntry;
}

/** 매도 응답 형태의 경로 엔트리 — path_type·destination·btc_received 가 없다 */
function sellPath(over: Partial<CheapestPathEntry> = {}): CheapestPathEntry {
  return {
    path_id: 'sell',
    route_variant: 'usdt_via_global',
    korean_exchange: 'bithumb',
    transfer_coin: 'USDT',
    network: 'TRC20',
    domestic_withdrawal_network: 'TRC20',
    global_exit_mode: 'onchain',
    global_exit_network: 'Bitcoin',
    krw_received: 5_000_000,
    total_fee_krw: 1000,
    fee_pct: 0.1,
    ...over,
  } as CheapestPathEntry;
}

describe('receivedAmount — 모드마다 수령량 필드가 다르다', () => {
  it('살 때는 지갑에 도착하는 BTC(btc_received)를 본다', () => {
    expect(receivedAmount(buyPath({ btc_received: 0.025 }), 'buy')).toBe(0.025);
  });

  it('팔 때는 계좌에 입금되는 원화(krw_received)를 본다', () => {
    expect(receivedAmount(sellPath({ krw_received: 5_571_783 }), 'sell')).toBe(5_571_783);
  });

  it('모드를 생략하면 살 때로 본다', () => {
    expect(receivedAmount(buyPath({ btc_received: 0.03 }))).toBe(0.03);
  });

  it('해당 모드의 필드가 없으면 0 — 정렬에서 뒤로 밀기 위한 값이다', () => {
    // 매도 엔트리를 살 때 기준으로 읽으면 btc_received 가 없어 0 이 된다.
    expect(receivedAmount(sellPath(), 'buy')).toBe(0);
    expect(receivedAmount(buyPath(), 'sell')).toBe(0);
  });
});

describe('isLightningPath — 라이트닝 표시 필드가 모드마다 다르다', () => {
  it('살 때는 path_type 으로 판정한다', () => {
    expect(isLightningPath(buyPath({ path_type: 'lightning_exit' }), 'buy')).toBe(true);
    expect(isLightningPath(buyPath({ path_type: null }), 'buy')).toBe(false);
  });

  it('팔 때는 global_exit_mode 로 판정한다', () => {
    expect(isLightningPath(sellPath({ global_exit_mode: 'lightning' }), 'sell')).toBe(true);
    expect(isLightningPath(sellPath({ global_exit_mode: 'onchain' }), 'sell')).toBe(false);
  });

  it('매도 경로에는 path_type 이 없으므로 살 때 기준으로 읽으면 라이트닝을 놓친다', () => {
    // 이 단언은 두 기준을 섞어 쓰면 안 되는 이유를 고정해 둔다.
    const lnSell = sellPath({ global_exit_mode: 'lightning', lightning_exit_provider: 'Strike' });
    expect(isLightningPath(lnSell, 'sell')).toBe(true);
    expect(isLightningPath(lnSell, 'buy')).toBe(false);
  });

  it('매수의 온체인 경로는 global_exit_mode 가 onchain 이라 팔 때 기준으로도 라이트닝이 아니다', () => {
    expect(isLightningPath(buyPath({ global_exit_mode: 'onchain' }), 'sell')).toBe(false);
  });
});

describe('usesGlobalExchange — 해외 거래소 경유 여부(두 모드 공통)', () => {
  it('USDT 경로는 언제나 해외 거래소를 거친다', () => {
    expect(usesGlobalExchange(sellPath({ transfer_coin: 'USDT' }))).toBe(true);
    expect(usesGlobalExchange(buyPath({ transfer_coin: 'USDT' }))).toBe(true);
  });

  it('route_variant 가 via_global 로 끝나면 경유로 본다', () => {
    expect(usesGlobalExchange(buyPath({ transfer_coin: 'BTC', route_variant: 'btc_via_global' }))).toBe(true);
    expect(usesGlobalExchange(sellPath({ transfer_coin: 'USDT', route_variant: 'lightning_via_global' }))).toBe(true);
  });

  it('BTC 직접 경로는 경유하지 않는다', () => {
    expect(usesGlobalExchange(sellPath({ transfer_coin: 'BTC', route_variant: 'btc_direct' }))).toBe(false);
    expect(usesGlobalExchange(sellPath({ transfer_coin: 'BTC', route_variant: 'lightning_direct' }))).toBe(false);
  });

  it('route_variant 가 없으면 경유하지 않는 것으로 본다 (판정 불가 시 fail-closed)', () => {
    expect(usesGlobalExchange(buyPath({ transfer_coin: 'BTC', route_variant: undefined }))).toBe(false);
  });
});
