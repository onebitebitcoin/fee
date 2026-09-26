// ── 팔 때 마법사의 선택지 계산 ─────────────────────────────────────────────────
// 팔 때의 단계는 자금이 움직이는 순서를 따른다(flow.ts SELL_FLOW).
//   전송 방식 → (스왑 서비스) → 매도 경로 → (해외 거래소 → USDT 네트워크) → 국내 거래소
// 그래서 각 단계의 선택지는 '그 단계보다 앞에서 고른 조건'만으로 걸러야 한다.
// 살 때처럼 국내 거래소를 기준으로 거르면 국내 거래소를 아직 고르지 않은 앞 단계들이 비어 버린다.
//
// 모든 함수는 allData + 선택값만으로 결정되는 순수 함수다. ExplorerContext 가 mode === 'sell'
// 일 때 useMemo 로 호출한다.

import type { CheapestPathEntry, DisabledCheapestPathEntry } from '../../types';
import type { AllData, GlobalExchange } from './constants';
import { GLOBAL_EXCHANGES, bestByFee } from './constants';
import type { CoinType } from './flow';
import { isLightningPath, receivedAmount } from './pathMode';
import { computeSwapServiceOptions, type SwapServiceOption } from './derivations';

export interface SellSelection {
  sendMethod: 'onchain' | 'lightning' | null;
  swapSvc: string | null;
  coin: CoinType | null;
  global: GlobalExchange | null;
  network: string | null;
  domestic: string | null;
}

export const EMPTY_SELL_SELECTION: SellSelection = {
  sendMethod: null, swapSvc: null, coin: null, global: null, network: null, domestic: null,
};

/**
 * 선택된 조건을 모두 만족하는 매도 경로. 비어 있는(null) 조건은 거르지 않는다.
 *
 * BTC 직접 경로는 해외 거래소와 무관해 모든 해외 거래소 응답에 똑같이 실리므로
 * 첫 번째 응답에서만 가져온다. USDT 경유 경로는 해외 거래소별 응답에서 가져온다.
 * 출금 정지로 강제계산된 참고용 경로(disabled)는 선택지 계산에서 뺀다.
 */
function candidates(
  allData: AllData | null,
  sel: SellSelection,
  { includeDisabled = false }: { includeDisabled?: boolean } = {},
): CheapestPathEntry[] {
  if (!allData) return [];
  const byGlobal = allData.byGlobal;
  const btcPaths = sel.coin === 'USDT' || sel.global
    ? []
    : (Object.values(byGlobal)[0]?.all_paths ?? [])
        .filter(p => p.transfer_coin === 'BTC' && p.route_variant !== 'btc_via_global');
  const usdtSources = sel.global ? [sel.global] : GLOBAL_EXCHANGES;
  const usdtPaths = sel.coin === 'BTC'
    ? []
    : usdtSources.flatMap(g => (byGlobal[g]?.all_paths ?? []).filter(p => p.transfer_coin === 'USDT'));

  return [...btcPaths, ...usdtPaths].filter(p =>
    (includeDisabled || !p.disabled) &&
    (sel.sendMethod === null || isLightningPath(p, 'sell') === (sel.sendMethod === 'lightning')) &&
    (sel.swapSvc === null || p.lightning_exit_provider === sel.swapSvc) &&
    (sel.network === null || p.network === sel.network) &&
    (sel.domestic === null || p.korean_exchange === sel.domestic),
  );
}

/** 전송 방식 단계: 라이트닝으로 보내는 경로가 하나라도 있는지. */
export function sellHasLightning(allData: AllData | null): boolean {
  return candidates(allData, { ...EMPTY_SELL_SELECTION, sendMethod: 'lightning' })
    .some(p => !!p.lightning_exit_provider);
}

/** 스왑 서비스 단계: 라이트닝 경로에 쓰이는 온체인 → 라이트닝 스왑 서비스 목록. */
export function sellSwapServiceOptions(allData: AllData | null): SwapServiceOption[] {
  const lnPaths = candidates(allData, { ...EMPTY_SELL_SELECTION, sendMethod: 'lightning' })
    .filter(p => !!p.lightning_exit_provider);
  return computeSwapServiceOptions(lnPaths, 'sell');
}

/** 매도 경로 단계: 국내 직접(BTC) / 해외 경유(USDT) 중 실제 경로가 있는 것. */
export function sellCoinOptions(
  allData: AllData | null,
  sel: SellSelection,
): { coin: CoinType; best: CheapestPathEntry }[] {
  const upstream = { ...EMPTY_SELL_SELECTION, sendMethod: sel.sendMethod, swapSvc: sel.swapSvc };
  const opts: { coin: CoinType; best: CheapestPathEntry }[] = [];
  for (const coin of ['USDT', 'BTC'] as const) {
    const best = bestByFee(candidates(allData, { ...upstream, coin }), 'sell');
    if (best) opts.push({ coin, best });
  }
  return opts;
}

/** 해외 거래소 단계: 비트코인을 팔아 USDT 로 바꿀 거래소를 수수료 오름차순으로. */
export function sellGlobalOptions(
  allData: AllData | null,
  sel: SellSelection,
): { exchange: GlobalExchange; best: CheapestPathEntry }[] {
  const upstream = { ...EMPTY_SELL_SELECTION, sendMethod: sel.sendMethod, swapSvc: sel.swapSvc, coin: sel.coin };
  return GLOBAL_EXCHANGES
    .map(exchange => ({ exchange, best: bestByFee(candidates(allData, { ...upstream, global: exchange }), 'sell') }))
    .filter((o): o is { exchange: GlobalExchange; best: CheapestPathEntry } => o.best !== null)
    .sort((a, b) => {
      const diff = (a.best.total_fee_krw ?? 0) - (b.best.total_fee_krw ?? 0);
      if (diff !== 0) return diff;
      return receivedAmount(b.best, 'sell') - receivedAmount(a.best, 'sell');
    });
}

function networkUpstream(sel: SellSelection): SellSelection {
  return { ...EMPTY_SELL_SELECTION, sendMethod: sel.sendMethod, swapSvc: sel.swapSvc, coin: sel.coin, global: sel.global };
}

/** 네트워크 단계: 고른 해외 거래소에서 USDT 를 국내로 보낼 망. 망마다 가장 싼 경로를 대표로 둔다. */
export function sellNetworkOptions(
  allData: AllData | null,
  sel: SellSelection,
): { network: string; best: CheapestPathEntry }[] {
  if (!sel.global) return [];
  const byNetwork = new Map<string, CheapestPathEntry[]>();
  for (const p of candidates(allData, networkUpstream(sel))) {
    byNetwork.set(p.network, [...(byNetwork.get(p.network) ?? []), p]);
  }
  return [...byNetwork.entries()]
    .map(([network, paths]) => ({ network, best: bestByFee(paths, 'sell')! }));
}

/**
 * 비활성 네트워크: 고른 해외 거래소에서 출금이 멈춘 USDT 망.
 * 국내 거래소를 아직 고르지 않았으므로 어느 국내 거래소에서든 정상으로 쓸 수 있는 망은 뺀다.
 */
export function sellDisabledNetworkOptions(
  allData: AllData | null,
  sel: SellSelection,
): DisabledCheapestPathEntry[] {
  if (!allData || !sel.global) return [];
  const enabled = new Set(sellNetworkOptions(allData, sel).map(o => o.network));
  const seen = new Set<string>();
  const out: DisabledCheapestPathEntry[] = [];
  const push = (entry: DisabledCheapestPathEntry) => {
    if (enabled.has(entry.network) || seen.has(entry.network)) return;
    seen.add(entry.network);
    out.push(entry);
  };
  const source = allData.byGlobal[sel.global];
  for (const p of source?.disabled_paths ?? []) {
    if (p.transfer_coin === 'USDT') push(p);
  }
  for (const p of candidates(allData, networkUpstream(sel), { includeDisabled: true })) {
    if (!p.disabled) continue;
    push({
      korean_exchange: p.korean_exchange,
      transfer_coin: 'USDT',
      network: p.network,
      reason: p.disabled_reason === 'disabled' ? null : p.disabled_reason,
      suspension_message: p.suspension_message,
      notice_url: p.notice_url,
      notice_published_at: p.notice_published_at,
      notice_title: p.notice_title,
    });
  }
  return out;
}

/** 국내 거래소 단계(마지막 선택): 앞의 선택으로 도달할 수 있는 거래소를 거래량 순으로. */
export function sellDomesticOptions(
  allData: AllData | null,
  sel: SellSelection,
  koreaVolumeMap: Record<string, number>,
): { exchange: string; best: number }[] {
  const byExchange = new Map<string, number>();
  for (const p of candidates(allData, { ...sel, domestic: null })) {
    const fee = p.total_fee_krw ?? Infinity;
    if (fee < (byExchange.get(p.korean_exchange) ?? Infinity)) byExchange.set(p.korean_exchange, fee);
  }
  return [...byExchange.entries()]
    .map(([exchange, best]) => ({ exchange, best }))
    .sort((a, b) => (koreaVolumeMap[b.exchange] ?? 0) - (koreaVolumeMap[a.exchange] ?? 0));
}

/**
 * 결과 경로: 모든 선택을 만족하는 가장 싼 경로. 국내 거래소를 고르기 전에는 없다.
 * 추천 목록에서 고른 경로가 출금 정지 참고용일 수 있으므로 disabled 경로도 포함한다.
 */
export function sellResultPath(allData: AllData | null, sel: SellSelection): CheapestPathEntry | null {
  if (!sel.domestic || !sel.coin) return null;
  return bestByFee(candidates(allData, sel, { includeDisabled: true }), 'sell');
}
