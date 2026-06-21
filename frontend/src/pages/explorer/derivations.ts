// ── ExplorerContext 순수 파생 로직 ────────────────────────────────────────────
// allData + 선택값(domestic/coin/global/network 등)만으로 결정되는 순수 함수 모음.
// ExplorerContext가 useMemo로 호출한다(deps는 context가 관리). 부수효과·React 의존 없음 → 단위 테스트 가능.

import type { CheapestPathEntry, DisabledCheapestPathEntry } from '../../types';
import type { AllData, GlobalExchange } from './constants';
import { GLOBAL_EXCHANGES, GLOBAL_INFO, bestByFee } from './constants';
import type { CoinType, Destination } from './flow';

export type PathWithG = CheapestPathEntry & { _g: string };

/** liveKimp 실패 시 fallback — 티커 스냅샷 usd_krw_rate(포렉스) 기준 김프 계산. */
export function computeSnapshotKimp(allData: AllData | null): Record<string, number> {
  if (!allData) return {};
  const ref = allData.byGlobal['binance'] ?? Object.values(allData.byGlobal)[0];
  if (!ref) return {};
  const gkrw = ref.global_btc_price_usd * ref.usd_krw_rate;
  const result: Record<string, number> = {};
  for (const t of allData.tickers) {
    if (t.currency === 'KRW' && t.pair?.includes('BTC') && t.price && gkrw)
      result[t.exchange] = ((t.price - gkrw) / gkrw) * 100;
  }
  return result;
}

/** 선택한 국내 거래소의 BTC/KRW 가격. */
export function computeDomesticBtcKrw(allData: AllData | null, domestic: string | null): number | null {
  if (!allData || !domestic) return null;
  return allData.tickers.find(t =>
    t.exchange === domestic && t.currency === 'KRW' && t.pair?.includes('BTC'),
  )?.price ?? null;
}

/** 한국 거래소 24h 거래량 맵 — KRW 단위 (BTC 거래량 × BTC/KRW 기준가). */
export function computeKoreaVolumeMap(allData: AllData | null): Record<string, number> {
  const ref = allData?.byGlobal['binance'] ?? Object.values(allData?.byGlobal ?? {})[0];
  const btcKrw = ref ? ref.global_btc_price_usd * ref.usd_krw_rate : 0;
  const m: Record<string, number> = {};
  for (const t of (allData?.tickers ?? [])) {
    if (t.currency === 'KRW' && t.pair?.includes('BTC') && t.volume_24h_btc && btcKrw) {
      m[t.exchange] = t.volume_24h_btc * btcKrw;  // KRW
    }
  }
  return m;
}

/** 국내 거래소 옵션 — 거래소별 최저 수수료 + 거래량 내림차순. */
export function computeDomesticOptions(
  allData: AllData | null,
  koreaVolumeMap: Record<string, number>,
): { exchange: string; best: number }[] {
  const map = new Map<string, number>();
  for (const data of Object.values(allData?.byGlobal ?? {}))
    for (const p of data.all_paths) {
      const cur = map.get(p.korean_exchange) ?? Infinity;
      const fee = p.total_fee_krw ?? Infinity;
      if (fee < cur) map.set(p.korean_exchange, fee);
    }
  return [...map.entries()]
    .map(([exchange, best]) => ({ exchange, best }))
    .sort((a, b) => (koreaVolumeMap[b.exchange] ?? 0) - (koreaVolumeMap[a.exchange] ?? 0));
}

/** 코인 옵션 — 선택 국내 거래소 기준 USDT/BTC_GLOBAL/BTC 최저 경로. */
export function computeCoinOptions(
  allData: AllData | null,
  domestic: string | null,
): { coin: CoinType; best: CheapestPathEntry }[] {
  if (!allData || !domestic) return [];
  const anyData = Object.values(allData.byGlobal)[0];
  const paths = (anyData?.all_paths ?? []).filter(p => p.korean_exchange === domestic);
  const opts: { coin: CoinType; best: CheapestPathEntry }[] = [];
  const u  = bestByFee(paths.filter(p => p.transfer_coin === 'USDT'));
  const b  = bestByFee(paths.filter(p => p.transfer_coin === 'BTC' && p.route_variant !== 'btc_via_global'));
  const bg = bestByFee(paths.filter(p => p.route_variant === 'btc_via_global'));
  if (u)  opts.push({ coin: 'USDT',       best: u });
  if (bg) opts.push({ coin: 'BTC_GLOBAL',  best: bg });
  if (b)  opts.push({ coin: 'BTC',         best: b });
  return opts;
}

/** 글로벌 거래소 옵션 — 선택(국내/코인) 기준 최저 수수료 정렬. */
export function computeGlobalOptions(
  allData: AllData | null,
  domestic: string | null,
  coin: CoinType | null,
): { exchange: GlobalExchange; best: CheapestPathEntry }[] {
  if (!allData || !domestic) return [];
  return GLOBAL_EXCHANGES
    .map(g => {
      let paths = (allData.byGlobal[g]?.all_paths ?? []).filter(p =>
        p.korean_exchange === domestic,
      );
      if (coin === 'USDT') {
        paths = paths.filter(p => p.transfer_coin === 'USDT');
      } else if (coin === 'BTC_GLOBAL') {
        paths = paths.filter(p => p.route_variant === 'btc_via_global');
      }
      const best = bestByFee(paths);
      if (!best) return null;
      return { exchange: g, best };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => {
      const diff = (a.best.total_fee_krw ?? 0) - (b.best.total_fee_krw ?? 0);
      if (diff !== 0) return diff;
      return (b.best.btc_received ?? 0) - (a.best.btc_received ?? 0);
    });
}

/** 네트워크 옵션 — 선택(국내/코인/글로벌) 기준 네트워크별 최저 경로. */
export function computeNetworkOptions(
  allData: AllData | null,
  domestic: string | null,
  coin: CoinType | null,
  global: GlobalExchange | null,
): { network: string; best: CheapestPathEntry }[] {
  if (!allData || !domestic || !coin) return [];
  let paths: CheapestPathEntry[];
  if (coin === 'BTC') {
    paths = (Object.values(allData.byGlobal)[0]?.all_paths ?? [])
      .filter(p => p.korean_exchange === domestic && p.transfer_coin === 'BTC' && p.route_variant !== 'btc_via_global');
  } else if (coin === 'BTC_GLOBAL') {
    if (!global) return [];
    paths = (allData.byGlobal[global]?.all_paths ?? [])
      .filter(p => p.korean_exchange === domestic && p.route_variant === 'btc_via_global');
  } else {
    if (!global) return [];
    paths = (allData.byGlobal[global]?.all_paths ?? [])
      .filter(p => p.korean_exchange === domestic && p.transfer_coin === 'USDT');
  }
  const map = new Map<string, CheapestPathEntry>();
  for (const p of paths) {
    const cur = map.get(p.network);
    const pFee = p.total_fee_krw ?? Infinity;
    const curFee = cur ? (cur.total_fee_krw ?? Infinity) : Infinity;
    if (!cur || pFee < curFee || (pFee === curFee && (p.btc_received ?? 0) > (cur.btc_received ?? 0))) {
      map.set(p.network, p);
    }
  }
  return [...map.entries()].map(([n, best]) => ({ network: n, best }));
}

/** 비활성 네트워크 옵션 — disabled_paths 중 선택 국내/코인 일치분. */
export function computeDisabledNetworkOptions(
  allData: AllData | null,
  domestic: string | null,
  coin: CoinType | null,
  global: GlobalExchange | null,
): DisabledCheapestPathEntry[] {
  if (!allData || !domestic || !coin) return [];
  const transferCoin = coin === 'USDT' ? 'USDT' : 'BTC';
  const source = coin === 'USDT' || coin === 'BTC_GLOBAL'
    ? (global ? allData.byGlobal[global] : null)
    : Object.values(allData.byGlobal)[0];
  return (source?.disabled_paths ?? []).filter(
    p => p.korean_exchange === domestic && p.transfer_coin === transferCoin,
  );
}

/** 현재 글로벌 선택에서 라이트닝 exit 경로 가용 여부 (network 선택 전). */
export function computeHasLightningPaths(
  allData: AllData | null,
  domestic: string | null,
  global: GlobalExchange | null,
  coin: CoinType | null,
  network: string | null,
): boolean {
  if (!allData || !domestic || !global) return false;
  if (coin === 'USDT') {
    return (allData.byGlobal[global]?.all_paths ?? []).some(p =>
      p.korean_exchange === domestic &&
      p.transfer_coin === 'USDT' &&
      (network ? p.network === network : true) &&
      p.path_type === 'lightning_exit',
    );
  }
  if (coin === 'BTC_GLOBAL') {
    return (allData.byGlobal[global]?.all_paths ?? []).some(p =>
      p.korean_exchange === domestic &&
      p.route_variant === 'btc_via_global' &&
      p.path_type === 'lightning_exit',
    );
  }
  return false;
}

/** 글로벌 거래소 라이트닝 출금 지원 여부: 실제 경로 존재 → 정적 메타데이터 폴백. */
export function computeGlobalSupportsLightning(allData: AllData | null, g: string | null): boolean {
  return !!g && (
    (allData?.byGlobal[g]?.all_paths ?? []).some(p => p.path_type === 'lightning_exit') ||
    (GLOBAL_INFO[g as keyof typeof GLOBAL_INFO]?.lightning ?? false)
  );
}

/** 현재 선택(국내/코인/글로벌/네트워크) 기준의 lightning_exit 경로 집합 — 종착지·스왑 단계 공유. */
export function computeCurrentLightningPaths(
  allData: AllData | null,
  domestic: string | null,
  coin: CoinType | null,
  global: GlobalExchange | null,
  network: string | null,
  globalExitMethod: 'onchain' | 'lightning' | 'none' | null,
): CheapestPathEntry[] {
  const isBtcGlobalLightning = coin === 'BTC_GLOBAL' && globalExitMethod === 'lightning';
  if (!allData || !domestic || (!isBtcGlobalLightning && !network)) return [];
  const basePaths = coin === 'BTC'
    ? (Object.values(allData.byGlobal)[0]?.all_paths ?? []).filter(p =>
        p.korean_exchange === domestic && p.transfer_coin === 'BTC' && p.route_variant !== 'btc_via_global' && p.network === network)
    : coin === 'BTC_GLOBAL'
      ? global
        ? (allData.byGlobal[global]?.all_paths ?? []).filter(p =>
            p.korean_exchange === domestic && p.route_variant === 'btc_via_global')
        : []
      : global
        ? (allData.byGlobal[global]?.all_paths ?? []).filter(p =>
            p.korean_exchange === domestic && p.transfer_coin === 'USDT' && p.network === network)
        : [];
  return basePaths.filter(p => p.path_type === 'lightning_exit' && p.lightning_exit_provider);
}

/** 종착지 단계 가용성: 라이트닝 지갑(직접출금) / 개인지갑(스왑 경유) 경로 존재 여부. */
export function computeLightningExitInfo(currentLightningPaths: CheapestPathEntry[]): {
  hasLightningWallet: boolean;
  hasPersonal: boolean;
} {
  return {
    hasLightningWallet: currentLightningPaths.some(p => p.destination === 'lightning_wallet'),
    hasPersonal:        currentLightningPaths.some(p => (p.destination ?? 'personal') === 'personal'),
  };
}

export interface SwapServiceOption {
  name: string;
  fee_pct: number;
  fee_fixed_sat: number;
  kyc: boolean;
  btc_received: number;
  source_url: string | null;
}

/** 가용 라이트닝 스왑 서비스 (개인지갑 종착, network/destination → swap_service 단계). */
export function computeSwapServiceOptions(currentLightningPaths: CheapestPathEntry[]): SwapServiceOption[] {
  const svcMap = new Map<string, SwapServiceOption>();
  // 스왑 경유(personal)만 — 라이트닝 지갑 직접출금(__direct__)은 종착지 단계에서 분리됨
  for (const p of currentLightningPaths.filter(p => p.destination !== 'lightning_wallet')) {
    const name = p.lightning_exit_provider!;
    const existing = svcMap.get(name);
    if (!existing || (p.btc_received ?? 0) > existing.btc_received) {
      const swapComp = p.breakdown?.components.find(c => c.label.toLowerCase().includes('스왑'));
      const minerComp = p.breakdown?.components.find(c => c.label.toLowerCase().includes('네트워크 수수료') || c.label.toLowerCase().includes('miner fee'));
      const fee_pct = swapComp?.rate_pct ?? 0;
      const fee_fixed_sat = minerComp?.amount_text
        ? parseInt(minerComp.amount_text.replace(/,/g, '').replace(' sats', ''), 10) || 0
        : 0;
      svcMap.set(name, {
        name,
        fee_pct,
        fee_fixed_sat,
        kyc: p.exit_service_kyc_status === 'kyc',
        btc_received: p.btc_received ?? 0,
        source_url: swapComp?.source_url ?? null,
      });
    }
  }
  return [...svcMap.values()].sort((a, b) => b.btc_received - a.btc_received);
}

/** 결과 경로 — 마법사 전체 선택(종착지/스왑 포함)으로 단일 최적 경로 결정. */
export function computeResultPath(
  allData: AllData | null,
  domestic: string | null,
  coin: CoinType | null,
  global: GlobalExchange | null,
  network: string | null,
  swapSvc: string | null,
  globalExitMethod: 'onchain' | 'lightning' | 'none' | null,
  destination: Destination | null,
): CheapestPathEntry | null {
  const isBtcGlobalLightning = coin === 'BTC_GLOBAL' && globalExitMethod === 'lightning';
  const isNone = globalExitMethod === 'none';
  if (!allData || !domestic || !coin || (!isBtcGlobalLightning && !isNone && !network)) return null;
  let basePaths = coin === 'BTC'
    ? (Object.values(allData.byGlobal)[0]?.all_paths ?? []).filter(p =>
        p.korean_exchange === domestic && p.transfer_coin === 'BTC' && p.route_variant !== 'btc_via_global' && p.network === network)
    : coin === 'BTC_GLOBAL'
      ? global
        ? (allData.byGlobal[global]?.all_paths ?? []).filter(p =>
            p.korean_exchange === domestic && p.route_variant === 'btc_via_global' &&
            (isBtcGlobalLightning || isNone || p.network === network))
        : []
      : global
        ? (allData.byGlobal[global]?.all_paths ?? []).filter(p =>
            p.korean_exchange === domestic && p.transfer_coin === 'USDT' && (isNone || p.network === network))
        : [];
  if (globalExitMethod === 'onchain') {
    basePaths = basePaths.filter(p => p.path_type !== 'lightning_exit');
  } else if (globalExitMethod === 'lightning') {
    basePaths = basePaths.filter(p => p.path_type === 'lightning_exit');
    // 종착지 분기: 라이트닝 지갑 → 직접출금 경로만, 개인지갑 → 스왑 경유 경로만
    if (destination === 'lightning_wallet') {
      basePaths = basePaths.filter(p => p.destination === 'lightning_wallet');
    } else if (destination === 'personal') {
      basePaths = basePaths.filter(p => (p.destination ?? 'personal') === 'personal');
    }
  }
  if (swapSvc) {
    const filtered = basePaths.filter(p => p.lightning_exit_provider === swapSvc);
    if (filtered.length > 0) return bestByFee(filtered);
  }
  return bestByFee(basePaths);
}

/** 대안 경로 — 결과 경로와 동일 종착지의 상위 3개. */
export function computeAltPaths(
  allRecommendedPaths: PathWithG[],
  resultPath: CheapestPathEntry | null,
): PathWithG[] {
  if (!allRecommendedPaths.length) return [];
  const destFilter = (resultPath?.destination ?? 'personal') as Destination;
  return allRecommendedPaths
    .filter(p => (p.destination ?? 'personal') === destFilter)
    .slice(0, 3);
}
