import { Search, ShieldAlert, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

import { PathFilterBar } from '../components/cheapest-path/PathFilterBar';
import { PathMobileList } from '../components/cheapest-path/PathMobileList';
import { PathTable } from '../components/cheapest-path/PathTable';
import { RouteDetailPopup } from '../components/cheapest-path/RouteDetailPopup';
import { api } from '../lib/api';
import { fmtEx } from '../lib/exchangeNames';
import { formatCurrency, formatNumber, formatPercent, formatSats } from '../lib/formatBtc';
import { formatTopPathSequence, getFeeTone } from '../lib/pathUtils';
import { useCheapestPath } from '../hooks/useCheapestPath';
import { usePathFilters } from '../hooks/usePathFilters';
import type { AccessStats, PathMode } from '../types';

const DEFAULT_AMOUNT_MANWON = 100;

const FILTER_PRESETS = [
  { id: 'non_kyc',       label: '최소 KYC' },
  { id: 'cheapest',      label: '최저만' },
  { id: 'no_lightning',  label: '라이트닝 제외' },
  { id: 'with_lightning',label: '라이트닝 포함' },
] as const;
type FilterPresetId = typeof FILTER_PRESETS[number]['id'];

function formatFeeRateSatVb(value: number) {
  return `${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)} sat/vB`;
}

function categorizeFees(components: { label: string; amount_krw: number }[]) {
  let tradingFee = 0;
  let withdrawalFee = 0;
  let swapFee = 0;
  for (const c of components) {
    if (c.label.includes('스왑')) swapFee += c.amount_krw;
    else if (c.label.includes('출금') || c.label.includes('전송') || c.label.includes('네트워크')) withdrawalFee += c.amount_krw;
    else if (c.label.includes('매수') || c.label.includes('매도') || c.label.includes('KRW 전환')) tradingFee += c.amount_krw;
  }
  return { tradingFee, withdrawalFee, swapFee };
}

export function CheapestPathPage() {
  const mode: PathMode = 'buy';
  const [amountKrwInput, setAmountKrwInput] = useState(String(DEFAULT_AMOUNT_MANWON));
  const [amountUnit, setAmountUnit] = useState<'만원' | '억원'>('만원');
  const [globalExchange] = useState('binance');
  const [selectedPathId, setSelectedPathId] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [mobileRouteDetailOpen, setMobileRouteDetailOpen] = useState(false);
  const [expandedPathId, setExpandedPathId] = useState('');
  const [accessStats, setAccessStats] = useState<AccessStats | null>(null);
  const [activePreset, setActivePreset] = useState<FilterPresetId>('non_kyc');

  const { data, loading, submitting, setSubmitting, error, load } = useCheapestPath();
  const {
    filtersOpen, setFiltersOpen,
    pathShortcut, setPathShortcut,
    includeLightning, setIncludeLightning,
    cheapestComboOnly, setCheapestComboOnly,
    rankedPaths, filteredPaths,
    allDomesticNetworks, allGlobalExitOptions, allLightningProviders,
    excludedDomesticNetworks, excludedGlobalExitOptions, excludedLightningProviders,
    toggleDomesticNetwork, toggleGlobalExitOption, toggleLightningProvider,
  } = usePathFilters(data, mode);

  const activeGlobalExchange = data?.global_exchange ?? globalExchange;

  useEffect(() => {
    api.getAccessCount().then(setAccessStats).catch(() => setAccessStats(null));
  }, []);

  // 페이지 최초 로딩 시 기본값으로 자동 검색
  useEffect(() => {
    setHasSearched(true);
    load({ mode: 'buy', amountKrw: DEFAULT_AMOUNT_MANWON * 10000, globalExchange: 'binance' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bestVisiblePath = useMemo(() => filteredPaths[0] ?? null, [filteredPaths]);

  const selectedRoute = useMemo(() => {
    if (!data || !selectedPathId) return null;
    const visibleMatch = filteredPaths.find((item) => item.path_id === selectedPathId);
    if (visibleMatch) return { rank: visibleMatch.visibleRank, path: visibleMatch };
    const rankedMatch = rankedPaths.find((item) => item.path_id === selectedPathId);
    if (!rankedMatch) return null;
    return { rank: rankedMatch.rank, path: rankedMatch };
  }, [data, filteredPaths, rankedPaths, selectedPathId]);

  useEffect(() => {
    if (!selectedPathId) return;
    if (!filteredPaths.some((path) => path.path_id === selectedPathId)) {
      setSelectedPathId('');
    }
  }, [filteredPaths, selectedPathId]);

  useEffect(() => {
    if (!hasSearched || filteredPaths.length === 0) return;
    if (selectedPathId && filteredPaths.some((path) => path.path_id === selectedPathId)) return;
    setSelectedPathId(filteredPaths[0].path_id);
  }, [data, filteredPaths, hasSearched, selectedPathId]);

  useEffect(() => {
    if (mobileRouteDetailOpen && !selectedRoute) setMobileRouteDetailOpen(false);
  }, [mobileRouteDetailOpen, selectedRoute]);

  const applyPreset = useCallback((preset: FilterPresetId) => {
    setActivePreset(preset);
    switch (preset) {
      case 'non_kyc':
        setPathShortcut('non_kyc'); setIncludeLightning(true); setCheapestComboOnly(false); break;
      case 'cheapest':
        setPathShortcut('default'); setIncludeLightning(true); setCheapestComboOnly(true); break;
      case 'no_lightning':
        setPathShortcut('default'); setIncludeLightning(false); setCheapestComboOnly(false); break;
      case 'with_lightning':
        setPathShortcut('default'); setIncludeLightning(true); setCheapestComboOnly(false); break;
    }
  }, [setPathShortcut, setIncludeLightning, setCheapestComboOnly]);

  const handleSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setHasSearched(true);
    setSubmitting(true);
    const unitMultiplier = amountUnit === '만원' ? 10000 : 100000000;
    await load({ mode, amountKrw: Math.max((Number(amountKrwInput) || DEFAULT_AMOUNT_MANWON) * unitMultiplier, 10000), globalExchange });
  }, [amountKrwInput, amountUnit, globalExchange, load, mode, setSubmitting]);

  return (
    <div className="space-y-0 border border-dark-200">
      {/* Form */}
      <div className="border-b border-dark-200 bg-dark-500 px-4 py-3 sm:px-5">
        <div className="mb-2 flex items-center gap-1.5 text-xs text-bnb-muted">
          <Users size={11} />
          <span>누적 {accessStats?.total.toLocaleString('ko-KR') ?? '-'}회 · 오늘 {accessStats?.today.toLocaleString('ko-KR') ?? '-'}회</span>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="flex flex-wrap items-center gap-2">
            {/* Input 1: amount */}
            <input type="number" min={1} step={1} value={amountKrwInput} onChange={(e) => setAmountKrwInput(e.target.value)} className="w-20 border-b-2 border-brand-500 bg-transparent pb-1 text-2xl font-bold text-bnb-text outline-none placeholder:text-bnb-muted" placeholder="100" />
            {/* Input 2: unit */}
            <select value={amountUnit} onChange={(e) => setAmountUnit(e.target.value as '만원' | '억원')} className="border border-dark-200 bg-dark-400 px-2 py-1 text-sm font-semibold text-bnb-text outline-none focus:border-brand-500/50 cursor-pointer">
              <option value="만원">만원</option>
              <option value="억원">억원</option>
            </select>
            <div className="h-4 w-px bg-dark-200 mx-0.5" />
            {/* Input 3: filter preset */}
            {FILTER_PRESETS.map((p) => (
              <button key={p.id} type="button" onClick={() => applyPreset(p.id)} className={`px-2.5 py-1 text-xs font-semibold transition-colors border ${activePreset === p.id ? 'border-brand-500/40 bg-brand-500/10 text-brand-400' : 'border-dark-200 text-bnb-muted hover:text-bnb-text'}`}>
                {p.label}
              </button>
            ))}
            <button type="submit" disabled={submitting} className="ml-auto flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-dark-500 transition-colors disabled:opacity-50 bg-brand-600 hover:bg-brand-500">
              <Search size={11} />
              {submitting ? '검색 중' : '검색'}
            </button>
          </div>
        </form>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="border-b border-dark-200 bg-dark-400 px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-brand-400">최적 경로 계산 중</p>
              <p className="mt-1 text-sm text-bnb-muted">거래소·네트워크별 수수료를 다시 비교하고 있습니다.</p>
            </div>
            <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-bnb-muted">
              <span className="live-dot" aria-hidden="true" />
              로딩 중
            </div>
          </div>
          <div role="progressbar" aria-label="최적 경로 로딩" aria-valuetext="최적 경로를 계산하고 있습니다" className="loading-progress-track mt-3 h-1.5 w-full">
            <div className="loading-progress-bar" />
          </div>
        </div>
      ) : null}

      {/* Error */}
      {error ? (
        <div className="border-b border-dark-200 border-bnb-red/30 bg-bnb-red/10 p-5 text-bnb-red">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5" size={18} />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em]">경로 분석 실패</p>
              <p className="mt-2 text-sm font-medium">{error}</p>
              {data?.errors?.length ? (
                <ul className="mt-3 space-y-1 text-sm text-bnb-muted">
                  {data.errors.map((item, index) => (
                    <li key={`${item.stage}-${item.exchange}-${item.coin}-${index}`}>
                      {[item.exchange ? fmtEx(item.exchange) : null, item.coin].filter(Boolean).join(' / ')}: {item.error_message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Results */}
      {!loading && hasSearched && data && !error ? (
        <>
          {bestVisiblePath ? (
            <div className="border-b border-dark-200">
              <div className="bg-dark-400 p-4 sm:p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-brand-400">최적 경로</p>
                <div className="mt-3 space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="border border-brand-400/40 bg-brand-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-brand-400">1위</span>
                    <p className="text-lg font-semibold text-bnb-text sm:text-xl">{formatTopPathSequence(bestVisiblePath, activeGlobalExchange, mode)}</p>
                  </div>
                  <div className="divide-y divide-dark-200 border border-dark-200 sm:grid sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                    <div className="flex items-center justify-between bg-dark-500 px-3 py-2.5 sm:flex-col sm:items-start sm:p-4">
                      <p className="text-[11px] uppercase tracking-[0.24em] text-bnb-muted">수령 sats</p>
                      <p className="font-data font-semibold text-bnb-text sm:mt-1 sm:text-xl">{formatSats(bestVisiblePath.btc_received ?? 0)}</p>
                    </div>
                    <div className="flex items-center justify-between bg-dark-500 px-3 py-2.5 sm:flex-col sm:items-start sm:p-4">
                      <p className="text-[11px] uppercase tracking-[0.24em] text-bnb-muted">총 수수료</p>
                      <p className="font-data font-semibold text-brand-400 sm:mt-1 sm:text-xl">{formatCurrency(bestVisiblePath.total_fee_krw)}</p>
                    </div>
                    <div className="flex items-center justify-between bg-dark-500 px-3 py-2.5 sm:flex-col sm:items-start sm:p-4">
                      <p className="text-[11px] uppercase tracking-[0.24em] text-bnb-muted">수수료율</p>
                      <p className={`font-data font-semibold sm:mt-1 sm:text-xl ${getFeeTone(bestVisiblePath.fee_pct)}`}>{formatPercent(bestVisiblePath.fee_pct)}</p>
                    </div>
                  </div>
                  {bestVisiblePath.breakdown?.components && (() => {
                    const { tradingFee, withdrawalFee, swapFee } = categorizeFees(bestVisiblePath.breakdown.components);
                    return (
                      <div className="divide-y divide-dark-200 border border-dark-200 sm:grid sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                        <div className="flex items-center justify-between bg-dark-500 px-3 py-2.5 sm:flex-col sm:items-start sm:p-4">
                          <p className="text-[11px] uppercase tracking-[0.24em] text-bnb-muted">거래 수수료</p>
                          <p className="font-data font-semibold text-bnb-text sm:mt-1 sm:text-lg">{tradingFee > 0 ? formatCurrency(tradingFee) : '—'}</p>
                        </div>
                        <div className="flex items-center justify-between bg-dark-500 px-3 py-2.5 sm:flex-col sm:items-start sm:p-4">
                          <p className="text-[11px] uppercase tracking-[0.24em] text-bnb-muted">출금 수수료</p>
                          <p className="font-data font-semibold text-bnb-text sm:mt-1 sm:text-lg">{withdrawalFee > 0 ? formatCurrency(withdrawalFee) : '—'}</p>
                        </div>
                        <div className="flex items-center justify-between bg-dark-500 px-3 py-2.5 sm:flex-col sm:items-start sm:p-4">
                          <p className="text-[11px] uppercase tracking-[0.24em] text-bnb-muted">스왑 수수료</p>
                          <p className="font-data font-semibold text-bnb-text sm:mt-1 sm:text-lg">{swapFee > 0 ? formatCurrency(swapFee) : '—'}</p>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          ) : null}

          <div className="border-b border-dark-200 bg-dark-500">
            <PathFilterBar
              filtersOpen={filtersOpen}
              onToggleOpen={() => setFiltersOpen((v) => !v)}
              excludedDomesticNetworks={excludedDomesticNetworks}
              excludedGlobalExitOptions={excludedGlobalExitOptions}
              excludedLightningProviders={excludedLightningProviders}
              allDomesticNetworks={allDomesticNetworks}
              allGlobalExitOptions={allGlobalExitOptions}
              allLightningProviders={allLightningProviders}
              filteredCount={filteredPaths.length}
              totalCount={rankedPaths.length}
              includeLightning={includeLightning}
              cheapestComboOnly={cheapestComboOnly}
              onToggleDomesticNetwork={toggleDomesticNetwork}
              onToggleGlobalExitOption={toggleGlobalExitOption}
              onToggleLightningProvider={toggleLightningProvider}
              onToggleIncludeLightning={() => setIncludeLightning((v) => !v)}
              onToggleCheapestComboOnly={() => setCheapestComboOnly((v) => !v)}
            />
            <PathMobileList
              filteredPaths={filteredPaths}
              selectedPathId={selectedPathId}
              globalExchange={activeGlobalExchange}
              mode={mode}
              onSelectPath={setSelectedPathId}
              onOpenDetail={(pathId) => { setSelectedPathId(pathId); setMobileRouteDetailOpen(true); }}
            />
            <PathTable
              filteredPaths={filteredPaths}
              expandedPathId={expandedPathId}
              globalExchange={activeGlobalExchange}
              mode={mode}
              onToggleExpand={(pathId) => setExpandedPathId((prev) => prev === pathId ? '' : pathId)}
            />
          </div>
        </>
      ) : null}

      {mobileRouteDetailOpen && selectedRoute ? (
        <RouteDetailPopup selectedRoute={selectedRoute} globalExchange={activeGlobalExchange} mode={mode} onClose={() => setMobileRouteDetailOpen(false)} />
      ) : null}
    </div>
  );
}
