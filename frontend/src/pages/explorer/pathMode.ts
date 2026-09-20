// ── 모드별 경로 해석 (단일 기준) ─────────────────────────────────────────────────
// 매수 응답과 매도 응답은 같은 envelope(best_path / top5 / all_paths / available_filters)을
// 쓰지만, 경로 엔트리 안쪽 필드가 세 곳에서 다르다. 그 차이를 화면마다 따로 분기하면
// 한 곳을 고쳐도 다른 곳이 남으므로 판정을 여기에 모은다.
//
//            | 살 때(buy)                  | 팔 때(sell)
//  수령량    | btc_received (지갑에 도착)   | krw_received (계좌에 입금)
//  라이트닝  | path_type === 'lightning_exit' | global_exit_mode === 'lightning'
//  종착지    | destination 필드 있음        | 필드 없음 (종착지가 원화 계좌로 고정)

import type { CheapestPathEntry, PathMode } from '../../types';

/**
 * 경로의 '수령량' 비교 기준값.
 *
 * 살 때는 개인 지갑에 도착하는 BTC 수량이고, 팔 때는 계좌에 입금되는 원화 금액이다.
 * 두 값은 단위가 달라(BTC 대 원) 서로 비교할 수 없으므로, 같은 모드의 경로끼리만
 * 이 함수의 반환값을 견줘야 한다.
 *
 * 값이 없으면 0 을 돌려준다. 정렬에서 값 없는 경로를 뒤로 보내려는 의도이고,
 * 실제 수령량이 0 이라는 뜻이 아니다.
 */
export function receivedAmount(p: CheapestPathEntry, mode: PathMode = 'buy'): number {
  return mode === 'sell' ? (p.krw_received ?? 0) : (p.btc_received ?? 0);
}

/**
 * 라이트닝 네트워크를 거치는 경로인지 판정한다.
 *
 * 살 때는 해외 거래소에서 라이트닝으로 '출금'하는 경로를 백엔드가 `path_type`으로 표시하고,
 * 팔 때는 개인 지갑의 온체인 BTC 를 라이트닝으로 바꿔 거래소에 '입금'하는 경로를
 * `global_exit_mode`로 표시한다. 필드 이름이 서로 달라 한쪽 기준만 쓰면 다른 모드에서
 * 라이트닝 경로가 통째로 온체인으로 분류된다.
 */
export function isLightningPath(p: CheapestPathEntry, mode: PathMode = 'buy'): boolean {
  return mode === 'sell'
    ? p.global_exit_mode === 'lightning'
    : p.path_type === 'lightning_exit';
}

/**
 * 해외 거래소를 실제로 경유하는 경로인지 판정한다(두 모드 공통).
 *
 * USDT 경로는 언제나 해외 거래소를 거친다. BTC 경로 중에서는 `route_variant`가
 * `..._via_global`인 것만 해당한다. `route_variant`가 없으면 경유하지 않는 것으로 본다
 * (판정 불가일 때 경유한다고 보면 BTC 직접 경로에 엉뚱한 해외 거래소가 붙는다).
 */
export function usesGlobalExchange(p: CheapestPathEntry): boolean {
  return p.transfer_coin === 'USDT' || (p.route_variant?.endsWith('via_global') ?? false);
}
