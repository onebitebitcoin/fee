import { useMemo, useState } from 'react';

import { canonicalNetwork, getSellFirstHopKyc, sortAllPaths } from '../lib/pathUtils';
import type { CheapestPathResponse, PathMode } from '../types';
import type { VisibleRankedPath } from '../lib/pathUtils';

const DEFAULT_EXCLUDED_NETWORKS = ['Aptos', 'Kaia', 'ERC20'];

export type PathShortcut = 'default' | 'non_kyc' | 'no_lightning';

export function usePathFilters(data: CheapestPathResponse | null, mode: PathMode) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [excludedDomesticNetworks, setExcludedDomesticNetworks] = useState<string[]>(DEFAULT_EXCLUDED_NETWORKS);
  const [excludedGlobalExitOptions, setExcludedGlobalExitOptions] = useState<string[]>([]);
  const [excludedLightningProviders, setExcludedLightningProviders] = useState<string[]>([]);
  const [pathShortcut, setPathShortcut] = useState<PathShortcut>('non_kyc');

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
    return rankedPaths.filter((path) => {
      const globalExitKey = `${path.global_exit_mode}::${path.global_exit_network}`;
      if (excludedDomesticNetworks.includes(canonicalNetwork(path.domestic_withdrawal_network))) return false;
      if (excludedGlobalExitOptions.includes(globalExitKey)) return false;
      if (path.lightning_exit_provider && excludedLightningProviders.includes(path.lightning_exit_provider)) return false;
      if (pathShortcut === 'no_lightning' && path.global_exit_mode === 'lightning') return false;
      if (pathShortcut === 'non_kyc') {
        const beforeWalletKyc = mode === 'sell'
          ? getSellFirstHopKyc(path)
          : (path.exit_service_kyc_status ?? path.global_kyc_status);
        if (beforeWalletKyc !== 'non_kyc') return false;
      }
      return true;
    }).map((path, index) => ({ ...path, visibleRank: index + 1 }));
  }, [excludedDomesticNetworks, excludedGlobalExitOptions, excludedLightningProviders, mode, pathShortcut, rankedPaths]);

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
