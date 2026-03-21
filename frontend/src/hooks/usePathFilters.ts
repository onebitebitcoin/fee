import { useMemo, useState } from 'react';

import { canonicalNetwork, getSellFirstHopKyc, sortAllPaths } from '../lib/pathUtils';
import type { CheapestPathResponse, PathMode } from '../types';
import type { VisibleRankedPath } from '../lib/pathUtils';

const CARF_FIRST_EXCHANGE: Record<string, string> = {
  upbit: '2027', bithumb: '2027', coinone: '2027', korbit: '2027', gopax: '2027',
  binance: '2028', okx: '2028', bybit: '2028', bitget: '2028', bitfinex: '2028',
  gate: '2027', kraken: '2029', coinbase: '2029',
};

/**
 * 글로벌 거래소의 CARF 정보 교환이 현재 연도 기준으로 이미 발효되었는지 반환.
 * carfFirstExchange <= 현재연도 이면 true (발효됨 → KYC 경로 제외 대상).
 * not_member 또는 carfFirstExchange가 null이면 false (비회원 → 발효 안 됨).
 */
function isGlobalExchangeCarfActive(exchangeId: string): boolean {
  const year = CARF_FIRST_EXCHANGE[exchangeId];
  if (!year) return false;
  return parseInt(year, 10) <= new Date().getFullYear();
}

const DEFAULT_EXCLUDED_NETWORKS = ['Aptos', 'Kaia', 'ERC20'];

export type PathShortcut = 'default' | 'non_kyc' | 'no_lightning';

export function usePathFilters(data: CheapestPathResponse | null, mode: PathMode) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [excludedDomesticNetworks, setExcludedDomesticNetworks] = useState<string[]>(DEFAULT_EXCLUDED_NETWORKS);
  const [includeAllUsdtNetworks, setIncludeAllUsdtNetworks] = useState(false);
  const [excludedGlobalExitOptions, setExcludedGlobalExitOptions] = useState<string[]>([]);
  const [excludedLightningProviders, setExcludedLightningProviders] = useState<string[]>([]);
  const [pathShortcut, setPathShortcut] = useState<PathShortcut>('non_kyc');
  const [includeLightning, setIncludeLightning] = useState(true);
  const [lightningOnly, setLightningOnly] = useState(false);
  const [cheapestComboOnly, setCheapestComboOnly] = useState(false);

  const toggleAllUsdtNetworks = () => {
    setIncludeAllUsdtNetworks((prev) => {
      const next = !prev;
      setExcludedDomesticNetworks(next ? [] : DEFAULT_EXCLUDED_NETWORKS);
      return next;
    });
  };

  const rankedPaths = useMemo(
    () => (data ? sortAllPaths(data.all_paths ?? [], data.mode ?? mode) : []),
    [data, mode],
  );

  const allDomesticNetworks = useMemo(() => {
    const raw = data?.available_filters?.domestic_withdrawal_networks ??
      Array.from(new Set(rankedPaths.map((p) => p.domestic_withdrawal_network))).sort();
    return Array.from(new Set(raw.map(canonicalNetwork))).sort();
  }, [data?.available_filters?.domestic_withdrawal_networks, rankedPaths]);

  const allGlobalExitOptions = useMemo(
    () => data?.available_filters?.global_exit_options ?? Array.from(new Set(rankedPaths.map((p) => `${p.global_exit_mode}::${p.global_exit_network}`))).sort().map((value) => {
      const [exitMode, network] = value.split('::');
      return { mode: exitMode as 'onchain' | 'lightning', network };
    }),
    [data?.available_filters?.global_exit_options, rankedPaths],
  );

  const allLightningProviders = useMemo(
    () => data?.available_filters?.lightning_exit_providers ?? Array.from(new Set(rankedPaths.map((p) => p.lightning_exit_provider).filter(Boolean))).sort() as string[],
    [data?.available_filters?.lightning_exit_providers, rankedPaths],
  );

  const filteredPaths = useMemo<VisibleRankedPath[]>(() => {
    let paths = rankedPaths.filter((path) => {
      const globalExitKey = `${path.global_exit_mode}::${path.global_exit_network}`;
      if (excludedDomesticNetworks.includes(canonicalNetwork(path.domestic_withdrawal_network))) return false;
      if (excludedGlobalExitOptions.includes(globalExitKey)) return false;
      if (path.lightning_exit_provider && excludedLightningProviders.includes(path.lightning_exit_provider)) return false;
      if (!includeLightning && path.global_exit_mode === 'lightning') return false;
      if (lightningOnly && path.global_exit_mode !== 'lightning') return false;
      if (pathShortcut === 'no_lightning' && path.global_exit_mode === 'lightning') return false;
      if (pathShortcut === 'non_kyc') {
        if (mode === 'sell') {
          if (getSellFirstHopKyc(path) !== 'non_kyc') return false;
        } else {
          if (path.exit_service_kyc_status != null) {
            // 라이트닝 경로: 출구 서비스 KYC 상태 기준 (기존 로직 유지)
            if (path.exit_service_kyc_status !== 'non_kyc') return false;
          } else {
            // 온체인 경로: KYC 거래소여도 CARF 미발효이면 출금 주소가 공유되지 않으므로 허용
            if (path.global_kyc_status !== 'non_kyc') {
              if (isGlobalExchangeCarfActive(data?.global_exchange ?? '')) return false;
            }
          }
        }
      }
      return true;
    });

    if (cheapestComboOnly) {
      const seen = new Set<string>();
      paths = paths.filter((path) => {
        const key = path.route_variant ?? `${path.transfer_coin}::${path.global_exit_mode}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    return paths.map((path, index) => ({ ...path, visibleRank: index + 1 }));
  }, [cheapestComboOnly, excludedDomesticNetworks, excludedGlobalExitOptions, excludedLightningProviders, includeLightning, lightningOnly, mode, pathShortcut, rankedPaths]);

  const toggleDomesticNetwork = (network: string) => {
    setExcludedDomesticNetworks((prev) =>
      prev.includes(network) ? prev.filter((n) => n !== network) : [...prev, network],
    );
  };

  const toggleGlobalExitOption = (exitMode: 'onchain' | 'lightning', network: string) => {
    const key = `${exitMode}::${network}`;
    setExcludedGlobalExitOptions((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key],
    );
  };

  const toggleLightningProvider = (provider: string) => {
    setExcludedLightningProviders((prev) =>
      prev.includes(provider) ? prev.filter((item) => item !== provider) : [...prev, provider],
    );
  };

  return {
    filtersOpen,
    setFiltersOpen,
    pathShortcut,
    setPathShortcut,
    includeLightning,
    setIncludeLightning,
    lightningOnly,
    setLightningOnly,
    cheapestComboOnly,
    setCheapestComboOnly,
    includeAllUsdtNetworks,
    toggleAllUsdtNetworks,
    excludedDomesticNetworks,
    excludedGlobalExitOptions,
    excludedLightningProviders,
    rankedPaths,
    allDomesticNetworks,
    allGlobalExitOptions,
    allLightningProviders,
    filteredPaths,
    toggleDomesticNetwork,
    toggleGlobalExitOption,
    toggleLightningProvider,
  };
}
