// ── 추천 경로 파생 로직 (순수 함수) ───────────────────────────────────────────────
// ExplorerContext의 allPaths/allRecommendedPaths/topRecommendedPaths useMemo에서
// 사용하던 순수 변환 로직을 추출한 모듈. 부작용/React 의존성 없이 입력→출력만 계산하므로
// 단위 테스트(golden 회귀)의 단일 기준이 된다.
//
// 변경 시 주의: 이 파일의 로직이 바뀌면 추천 리스트/필터 결과가 달라진다.
// frontend/src/pages/explorer/__fixtures__ 의 golden 회귀 테스트가 이를 감지한다.

import type { CheapestPathEntry, CheapestPathResponse, PathMode } from '../../types';
import type { Destination } from './flow';
import { isLightningPath, receivedAmount, usesGlobalExchange } from './pathMode';

/** 추천 경로 = 단일 경로 엔트리 + 어느 글로벌 거래소 응답에서 왔는지(_g) */
export type RecommendedPath = CheapestPathEntry & { _g: string };

/** 추천 리스트 제외 필터 상태. mode 를 생략하면 살 때(buy)로 본다. */
export interface RecommendFilterState {
  mode?: PathMode;
  destinationFilter: Destination;
  excludeExchanges: Set<string>;
  excludeGlobalExchanges: Set<string>;
  excludeServices: Set<string>;
  excludeOnchain: boolean;
  excludeLightning: boolean;
  excludeDisabled: boolean;
}

/** byGlobal 응답을 평탄화해 _g 태깅된 경로 배열로 만든다. (에러/빈 응답은 건너뜀) */
export function flattenPaths(
  byGlobal: Record<string, CheapestPathResponse | { error?: unknown }>,
): RecommendedPath[] {
  const out: RecommendedPath[] = [];
  for (const [g, d] of Object.entries(byGlobal)) {
    if (!d || (d as { error?: unknown }).error) continue;
    const paths = (d as CheapestPathResponse).all_paths;
    if (!paths) continue;
    for (const p of paths) out.push({ ...p, _g: g });
  }
  return out;
}

/**
 * 경로 중복 제거용 키.
 * USDT 경로는 네트워크(TRC20/BEP20 등)를 키에서 제외 → 같은 (국내→글로벌→출금방식) 조합에서
 * 가장 싼 네트워크 하나만 추천에 표시한다.
 */
export function recommendRouteKey(p: RecommendedPath): string {
  const isUsdt = p.transfer_coin === 'USDT';
  const isViaGlobal = p.route_variant?.endsWith('via_global') ?? false;
  const coinPart = isUsdt ? 'USDT' : isViaGlobal ? 'BTC_GLOBAL' : 'BTC_DIRECT';
  const globalPart = isUsdt || isViaGlobal ? p._g : '';
  const networkPart = isUsdt ? '' : p.network;
  return `${p.korean_exchange}|${coinPart}|${globalPart}|${networkPart}|${p.global_exit_mode}|${p.lightning_exit_provider ?? ''}`;
}

/**
 * 같은 라우트키의 대표 경로 선택 기준: 활성 경로가 중단(disabled) 경로를 항상 이기고,
 * 상태가 같으면 btc_received 큰 쪽.
 *
 * USDT 경로는 라우트키에서 네트워크가 빠지므로 한 거래소의 여러 네트워크가 한 키로 합쳐진다.
 * 출금 중단 네트워크는 수수료를 강제계산(제약 무시)해 수령량이 더 크게 나올 수 있는데,
 * 수령량만으로 대표를 뽑으면 그 거래소의 쓸 수 있는 네트워크가 통째로 가려진다.
 */
function isBetterRepresentative(
  candidate: RecommendedPath,
  current: RecommendedPath,
  mode: PathMode,
): boolean {
  const candidateDisabled = !!candidate.disabled;
  const currentDisabled = !!current.disabled;
  if (candidateDisabled !== currentDisabled) return !candidateDisabled;
  return receivedAmount(candidate, mode) > receivedAmount(current, mode);
}

/**
 * 평탄화된 경로를 라우트키로 dedup(활성 우선, 동일 상태면 btc_received 큰 쪽 유지) 후
 * 수수료 오름차순 → 동률 시 btc_received 내림차순 정렬한다.
 */
export function dedupAndSortPaths(allPaths: RecommendedPath[], mode: PathMode = 'buy'): RecommendedPath[] {
  if (!allPaths.length) return [];
  const best = new Map<string, RecommendedPath>();
  for (const p of allPaths) {
    const key = recommendRouteKey(p);
    const cur = best.get(key);
    if (!cur || isBetterRepresentative(p, cur, mode)) best.set(key, p);
  }
  return [...best.values()].sort((a, b) => {
    const diff = (a.total_fee_krw ?? 0) - (b.total_fee_krw ?? 0);
    if (diff !== 0) return diff;
    return receivedAmount(b, mode) - receivedAmount(a, mode);
  });
}

/**
 * 팔 때 USDT 입금망 제외. `excluded` 는 `network_key`(trc20/erc20/aptos 등) 집합이다.
 *
 * 다른 제외 필터와 달리 dedup **앞**에서 적용해야 한다. `recommendRouteKey` 가 USDT 경로에서
 * 네트워크를 키에서 빼기 때문에 (국내, 해외) 조합당 가장 싼 망 하나만 대표로 남는데, dedup 뒤에서
 * 그 대표를 빼면 조합 자체가 사라지고 다음 망으로 넘어가지 않는다.
 */
export function excludeUsdtNetworks<T extends CheapestPathEntry>(
  paths: T[],
  excluded: ReadonlySet<string>,
): T[] {
  if (!excluded.size) return paths;
  return paths.filter(p => p.transfer_coin !== 'USDT' || !p.network_key || !excluded.has(p.network_key));
}

/** 팔 때 망 제외 칩에 쓸 정규화 키 목록. dedup 전 전체 경로에서 뽑아야 제외한 망의 칩이 사라지지 않는다. */
export function usdtNetworkKeys(paths: CheapestPathEntry[]): string[] {
  const keys = new Set<string>();
  for (const p of paths) {
    if (p.transfer_coin === 'USDT' && p.network_key) keys.add(p.network_key);
  }
  return [...keys].sort();
}

/** 정규화 키의 표시명. 목록에 없는 키는 그대로 보여준다. */
export const USDT_NETWORK_LABEL: Record<string, string> = {
  trc20: 'Tron (TRC20)',
  erc20: 'Ethereum (ERC20)',
  aptos: 'Aptos',
  kaia: 'Kaia',
};

/** dedup·정렬된 추천 경로에 제외 필터를 적용한 표시용 목록. */
export function filterRecommendedPaths(
  paths: RecommendedPath[],
  state: RecommendFilterState,
): RecommendedPath[] {
  const {
    mode = 'buy', destinationFilter, excludeExchanges, excludeGlobalExchanges, excludeServices,
    excludeOnchain, excludeLightning, excludeDisabled,
  } = state;
  return paths.filter(p => {
    // 종착지 필터: 개인지갑 모드엔 personal 경로만, 라이트닝 지갑 모드엔 lightning_wallet 경로만.
    // 팔 때는 종착지가 원화 계좌 하나뿐이라 이 필터를 적용하지 않는다(경로에 destination 필드도 없다).
    if (mode !== 'sell' && (p.destination ?? 'personal') !== destinationFilter) return false;
    if (excludeExchanges.has(p.korean_exchange)) return false;
    if (usesGlobalExchange(p) && excludeGlobalExchanges.has(p._g)) return false;
    if (isLightningPath(p, mode)) {
      if (excludeLightning) return false;
      const svc = p.lightning_exit_provider;
      if (svc && excludeServices.has(svc)) return false;
    } else {
      if (excludeOnchain) return false;
    }
    if (excludeDisabled && p.disabled) return false;
    return true;
  });
}
