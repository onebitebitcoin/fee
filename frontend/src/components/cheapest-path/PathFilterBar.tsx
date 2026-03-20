import { ChevronDown } from 'lucide-react';

import { localizeUiLabel } from '../../lib/localizeUi';

type GlobalExitOption = { mode: 'onchain' | 'lightning'; network: string };

type Props = {
  filtersOpen: boolean;
  onToggleOpen: () => void;
  excludedDomesticNetworks: string[];
  excludedGlobalExitOptions: string[];
  excludedLightningProviders: string[];
  allDomesticNetworks: string[];
  allGlobalExitOptions: GlobalExitOption[];
  allLightningProviders: string[];
  filteredCount: number;
  totalCount: number;
  onToggleDomesticNetwork: (network: string) => void;
  onToggleGlobalExitOption: (mode: 'onchain' | 'lightning', network: string) => void;
  onToggleLightningProvider: (provider: string) => void;
};

export function PathFilterBar({
  filtersOpen,
  onToggleOpen,
  excludedDomesticNetworks,
  excludedGlobalExitOptions,
  excludedLightningProviders,
  allDomesticNetworks,
  allGlobalExitOptions,
  allLightningProviders,
  filteredCount,
  totalCount,
  onToggleDomesticNetwork,
  onToggleGlobalExitOption,
  onToggleLightningProvider,
}: Props) {
  return (
    <div className="border-b border-dark-200 bg-dark-400 px-4 py-3 sm:px-5">
      <button
        type="button"
        onClick={onToggleOpen}
        className="flex w-full items-center gap-2"
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-bnb-muted">필터</span>
        {!filtersOpen && excludedDomesticNetworks.length > 0 && (
          <span className="rounded-full bg-dark-200 px-1.5 py-0.5 text-[10px] font-data text-bnb-muted">
            {excludedDomesticNetworks.length}개 제외
          </span>
        )}
        <ChevronDown size={12} className={`ml-auto text-bnb-muted transition-transform duration-200 ${filtersOpen ? 'rotate-180' : ''}`} />
      </button>
      {filtersOpen && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {allDomesticNetworks.map((network) => {
            const excluded = excludedDomesticNetworks.includes(network);
            return (
              <button
                key={network}
                type="button"
                onClick={() => onToggleDomesticNetwork(network)}
                className={`px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors border ${
                  excluded
                    ? 'border-dark-100 bg-dark-300 text-bnb-muted/40 line-through'
                    : 'border-brand-500/40 bg-brand-500/10 text-brand-400 hover:bg-brand-500/20'
                }`}
              >
                {localizeUiLabel(network)}
              </button>
            );
          })}
          {allGlobalExitOptions.map((option) => {
            const key = `${option.mode}::${option.network}`;
            const excluded = excludedGlobalExitOptions.includes(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => onToggleGlobalExitOption(option.mode, option.network)}
                className={`px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors border ${
                  excluded
                    ? 'border-dark-100 bg-dark-300 text-bnb-muted/40 line-through'
                    : 'border-brand-500/40 bg-brand-500/10 text-brand-400 hover:bg-brand-500/20'
                }`}
              >
                {option.mode === 'lightning' ? '⚡ ' : ''}{localizeUiLabel(option.network)}
              </button>
            );
          })}
          {allLightningProviders.map((provider) => {
            const excluded = excludedLightningProviders.includes(provider);
            return (
              <button
                key={provider}
                type="button"
                onClick={() => onToggleLightningProvider(provider)}
                className={`px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors border ${
                  excluded
                    ? 'border-dark-100 bg-dark-300 text-bnb-muted/40 line-through'
                    : 'border-yellow-500/40 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20'
                }`}
              >
                ⚡ {provider}
              </button>
            );
          })}
          <span className="ml-auto text-[11px] uppercase tracking-[0.2em] text-bnb-muted">
            {filteredCount}/{totalCount}
          </span>
        </div>
      )}
    </div>
  );
}
