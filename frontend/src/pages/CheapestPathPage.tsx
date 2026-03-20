import { Search, ShieldAlert, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

import { PathFilterBar } from '../components/cheapest-path/PathFilterBar';
import { PathMobileList } from '../components/cheapest-path/PathMobileList';
import { PathTable } from '../components/cheapest-path/PathTable';
import { PathTimeline } from '../components/cheapest-path/PathTimeline';
import { RouteDetailPopup } from '../components/cheapest-path/RouteDetailPopup';
import { GLOBAL_EXCHANGES, KOREAN_EXCHANGES } from '../data/carfData';
import { api } from '../lib/api';
import { fmtEx } from '../lib/exchangeNames';
import { formatCurrency, formatNumber, formatPercent, formatSats } from '../lib/formatBtc';
import { formatTopPathSequence, getFeeTone } from '../lib/pathUtils';
import { useCheapestPath } from '../hooks/useCheapestPath';
import { usePathFilters } from '../hooks/usePathFilters';
import type { AccessStats, PathMode } from '../types';

const CARF_2027_IDS = new Set([
  ...KOREAN_EXCHANGES.filter((e) => e.carfGroup === '2027').map((e) => e.id),
  ...GLOBAL_EXCHANGES.filter((e) => e.carfGroup === '2027').map((e) => e.id),
]);

const DEFAULT_AMOUNT_MANWON = 100;

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
  const [mode, setMode] = useState<PathMode>('buy');
  const [amountKrwInput, setAmountKrwInput] = useState(String(DEFAULT_AMOUNT_MANWON));
  const [amountBtcInput, setAmountBtcInput] = useState('0.01');
  const [walletUtxoCountInput, setWalletUtxoCountInput] = useState('1');
  const [globalExchange] = useState('binance');
  const [selectedPathId, setSelectedPathId] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [mobileRouteDetailOpen, setMobileRouteDetailOpen] = useState(false);
  const [expandedPathId, setExpandedPathId] = useState('');
  const [accessStats, setAccessStats] = useState<AccessStats | null>(null);
  const [carfBlackbox, setCarfBlackbox] = useState(false);

  const { data, loading, submitting, setSubmitting, error, load } = useCheapestPath();
  const {
    filtersOpen, setFiltersOpen,
    pathShortcut, setPathShortcut,
    rankedPaths, filteredPaths,
    allDomesticNetworks, allGlobalExitOptions, allLightningProviders,
    excludedDomesticNetworks, excludedGlobalExitOptions, excludedLightningProviders,
    toggleDomesticNetwork, toggleGlobalExitOption, toggleLightningProvider,
  } = usePathFilters(data, mode);

  const activeGlobalExchange = data?.global_exchange ?? globalExchange;

  const isCarfAffected = useCallback(
    (koreanExchange: string) => CARF_2027_IDS.has(koreanExchange) || CARF_2027_IDS.has(activeGlobalExchange),
    [activeGlobalExchange],
  );

  useEffect(() => {
    api.getAccessCount().then(setAccessStats).catch(() => setAccessStats(null));
  }, []);

  useEffect(() => {
    setPathShortcut(mode === 'sell' ? 'default' : 'non_kyc');
  }, [mode, setPathShortcut]);

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

  const handleSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setHasSearched(true);
    setSubmitting(true);
    await load(
      mode === 'sell'
        ? { mode, amountBtc: Math.max(Number(amountBtcInput) || 0.01, 0.00000001), walletUtxoCount: Math.max(Math.floor(Number(walletUtxoCountInput) || 1), 1), globalExchange }
        : { mode, amountKrw: Math.max((Number(amountKrwInput) || DEFAULT_AMOUNT_MANWON) * 10000, 10000), globalExchange },
    );
  }, [mode, amountBtcInput, walletUtxoCountInput, amountKrwInput, globalExchange, load, setSubmitting]);

  return (
    <div className="space-y-0 border border-dark-200">
      {/* Form */}
      <div className="border-b border-dark-200 bg-dark-500 px-4 py-4 sm:px-5 sm:py-5">
        <div className="mb-3 flex items-center gap-3 text-xs text-bnb-muted">
          <Users size={13} />
          <span>누적 {accessStats ? accessStats.total.toLocaleString('ko-KR') : '-'}회</span>
          <span className="text-dark-100">|</span>
          <span>오늘 {accessStats ? accessStats.today.toLocaleString('ko-KR') : '-'}회</span>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setMode('buy')} className={`px-3 py-1.5 text-xs font-semibold transition-colors border ${mode === 'buy' ? 'border-brand-500/40 bg-brand-500/10 text-brand-400' : 'border-dark-200 text-bnb-muted hover:text-bnb-text'}`}>
              비트코인 살 때
            </button>
            <button type="button" onClick={() => setMode('sell')} className={`px-3 py-1.5 text-xs font-semibold transition-colors border ${mode === 'sell' ? 'border-bnb-red/40 bg-bnb-red/10 text-bnb-red' : 'border-dark-200 text-bnb-muted hover:text-bnb-text'}`}>
              비트코인 팔 때
            </button>
            <span className="text-dark-100">|</span>
            <button type="button" onClick={() => setCarfBlackbox((v) => !v)} className={`px-3 py-1.5 text-xs font-semibold transition-colors border ${carfBlackbox ? 'border-amber-500/40 bg-amber-500/10 text-amber-400' : 'border-dark-200 text-bnb-muted hover:text-bnb-text'}`}>
              CARF 2027 블랙박스
            </button>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-x-3">
            <label className="flex max-w-[8rem] flex-col gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-bnb-muted">{mode === 'sell' ? '보유 BTC' : '투입 금액(만원)'}</span>
              {mode === 'sell' ? (
                <input type="number" min={0.00000001} step={0.00000001} value={amountBtcInput} onChange={(e) => setAmountBtcInput(e.target.value)} className="w-full border-b-2 border-bnb-red bg-transparent pb-1 text-left text-2xl font-bold text-bnb-text outline-none placeholder:text-bnb-muted sm:text-center" placeholder="0.01" />
              ) : (
                <input type="number" min={1} step={1} value={amountKrwInput} onChange={(e) => setAmountKrwInput(e.target.value)} className="w-full border-b-2 border-brand-500 bg-transparent pb-1 text-left text-2xl font-bold text-bnb-text outline-none placeholder:text-bnb-muted sm:text-center" placeholder="100" />
              )}
            </label>
            <span className="text-sm font-medium leading-relaxed text-bnb-muted sm:text-lg">
              {mode === 'sell' ? (
                '개인지갑의 비트코인을 한국 거래소 원화로 되돌리는 역방향 매도 경로를 비교합니다.'
              ) : (
                <span className="flex flex-wrap items-baseline gap-x-1 gap-y-1">
                  <span>원화로 비트코인을 살 때</span>
                  {(['non_kyc', 'default', 'no_lightning'] as const).map((shortcut, i) => {
                    const labels = { non_kyc: '신원인증 최소화 + 최저 수수료', default: '최저 수수료만', no_lightning: '라이트닝 제외 + 최저 수수료' };
                    const isActive = pathShortcut === shortcut;
                    return (
                      <span key={shortcut} className="inline-flex items-baseline gap-x-1">
                        {i > 0 && <span className="text-dark-100">/</span>}
                        <button
                          type="button"
                          onClick={() => setPathShortcut(shortcut)}
                          className={`underline-offset-2 transition-colors ${isActive ? 'font-semibold text-brand-400 underline' : 'text-bnb-muted hover:text-bnb-text'}`}
                        >
                          {labels[shortcut]}
                        </button>
                      </span>
                    );
                  })}
                  <span>기준으로 경로를 비교합니다.</span>
                </span>
              )}
            </span>
            <button type="submit" disabled={submitting} className={`flex w-full items-center justify-center gap-2 px-5 py-2 text-sm font-semibold uppercase tracking-[0.24em] text-dark-500 transition-colors disabled:opacity-50 sm:w-auto ${mode === 'sell' ? 'border border-bnb-red bg-bnb-red hover:bg-bnb-red/90' : 'border border-brand-600 bg-brand-600 hover:bg-brand-500'}`}>
              <Search size={13} />
              {submitting ? '검색 중...' : '검색'}
            </button>
          </div>
          {mode === 'sell' ? (
            <div className="mt-4 grid gap-3 border border-dark-200 bg-dark-400/40 p-3 sm:grid-cols-[minmax(0,10rem)_1fr] sm:items-end">
              <label className="flex flex-col gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-bnb-muted">지갑 UTXO 개수</span>
                <input type="number" min={1} step={1} value={walletUtxoCountInput} onChange={(e) => setWalletUtxoCountInput(e.target.value)} className="w-full border border-dark-200 bg-dark-500 px-3 py-2 text-base font-semibold text-bnb-text outline-none transition-colors focus:border-bnb-red" aria-label="지갑 UTXO 개수" />
              </label>
              <div className="space-y-1.5">
                <p className="text-xs text-bnb-text">Native SegWit(P2WPKH) · 받는 주소 1개 + 거스름돈 1개 기준으로 전송 수수료를 추정합니다.</p>
                {data?.mode === 'sell' && data.wallet_fee_estimate ? (
                  <div className="space-y-1 text-xs text-bnb-muted">
                    <p>
                      mempool.space 중간 수수료 <span className="font-data text-bnb-text">{formatFeeRateSatVb(data.wallet_fee_estimate.medium_fee_rate_sat_vb)}</span>
                      {' '}· 예상 크기 <span className="font-data text-bnb-text">{formatNumber(data.wallet_fee_estimate.estimated_tx_vbytes)} vB</span>
                      {' '}· 전송 수수료 <span className="font-data text-bnb-red">{formatNumber(data.wallet_fee_estimate.fee_sats)} sats</span>
                    </p>
                    <p>{formatNumber(data.wallet_fee_estimate.utxo_count)} UTXO 입력 기준 · 약 <span className="font-data text-bnb-text">{formatCurrency(data.wallet_fee_estimate.fee_krw)}</span></p>
                  </div>
                ) : (
                  <p className="text-xs text-bnb-muted">검색 시 현재 mempool.space 중간 수수료율로 지갑 전송 수수료를 함께 계산합니다.</p>
                )}
              </div>
            </div>
          ) : null}
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
            <div className={`border-b border-dark-200 ${carfBlackbox && isCarfAffected(bestVisiblePath.korean_exchange) ? 'opacity-30 grayscale pointer-events-none' : ''}`}>
              <div className="bg-dark-400 p-4 sm:p-5">
                <p className={`text-[11px] font-semibold uppercase tracking-[0.3em] ${mode === 'sell' ? 'text-bnb-red' : 'text-brand-400'}`}>{mode === 'sell' ? '비트코인 팔 때 경로' : '최적 경로'}</p>
                <div className="mt-3 space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="border border-brand-400/40 bg-brand-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-brand-400">1위</span>
                    <p className="text-lg font-semibold text-bnb-text sm:text-xl">{formatTopPathSequence(bestVisiblePath, activeGlobalExchange, mode)}</p>
                  </div>
                  <div className="border border-dark-200 bg-dark-500/60 p-3">
                    <PathTimeline path={bestVisiblePath} globalExchange={activeGlobalExchange} mode={mode} />
                  </div>
                  <div className="divide-y divide-dark-200 border border-dark-200 sm:grid sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                    <div className="flex items-center justify-between bg-dark-500 px-3 py-2.5 sm:flex-col sm:items-start sm:p-4">
                      <p className="text-[11px] uppercase tracking-[0.24em] text-bnb-muted">{mode === 'sell' ? '예상 KRW 수령' : '수령 sats'}</p>
                      <p className="font-data font-semibold text-bnb-text sm:mt-1 sm:text-xl">{mode === 'sell' ? formatCurrency(bestVisiblePath.krw_received ?? 0) : formatSats(bestVisiblePath.btc_received ?? 0)}</p>
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
                        <div className="flex items-center justify-between bg-dark-500/60 px-3 py-2 sm:flex-col sm:items-start sm:p-3">
                          <p className="text-[10px] uppercase tracking-[0.22em] text-bnb-muted">거래 수수료</p>
                          <p className="font-data text-sm font-semibold text-bnb-text sm:mt-1">{tradingFee > 0 ? formatCurrency(tradingFee) : '—'}</p>
                        </div>
                        <div className="flex items-center justify-between bg-dark-500/60 px-3 py-2 sm:flex-col sm:items-start sm:p-3">
                          <p className="text-[10px] uppercase tracking-[0.22em] text-bnb-muted">출금 수수료</p>
                          <p className="font-data text-sm font-semibold text-bnb-text sm:mt-1">{withdrawalFee > 0 ? formatCurrency(withdrawalFee) : '—'}</p>
                        </div>
                        <div className="flex items-center justify-between bg-dark-500/60 px-3 py-2 sm:flex-col sm:items-start sm:p-3">
                          <p className="text-[10px] uppercase tracking-[0.22em] text-bnb-muted">스왑 수수료</p>
                          <p className="font-data text-sm font-semibold text-bnb-text sm:mt-1">{swapFee > 0 ? formatCurrency(swapFee) : '—'}</p>
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
              onToggleDomesticNetwork={toggleDomesticNetwork}
              onToggleGlobalExitOption={toggleGlobalExitOption}
              onToggleLightningProvider={toggleLightningProvider}
            />
            <PathMobileList
              filteredPaths={filteredPaths}
              selectedPathId={selectedPathId}
              globalExchange={activeGlobalExchange}
              mode={mode}
              carfBlackbox={carfBlackbox}
              isCarfAffected={isCarfAffected}
              onSelectPath={setSelectedPathId}
              onOpenDetail={(pathId) => { setSelectedPathId(pathId); setMobileRouteDetailOpen(true); }}
            />
            <PathTable
              filteredPaths={filteredPaths}
              expandedPathId={expandedPathId}
              globalExchange={activeGlobalExchange}
              mode={mode}
              carfBlackbox={carfBlackbox}
              isCarfAffected={isCarfAffected}
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
