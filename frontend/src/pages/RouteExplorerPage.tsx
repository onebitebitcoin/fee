import { useMemo, useState } from 'react';
import {
  ArrowDown, ArrowRight, Award, Bitcoin, ChevronDown,
  Globe, MapPin, RefreshCw, Shield, TrendingDown, Zap,
} from 'lucide-react';

import { api } from '../lib/api';
import { fmtEx } from '../lib/exchangeNames';
import { formatFeeKrw, formatPercent, formatSats } from '../lib/formatBtc';
import type { CheapestPathEntry, CheapestPathResponse, TickerRow } from '../types';

// ── Constants ────────────────────────────────────────────────────────────────

const GLOBAL_EXCHANGES = ['binance', 'okx', 'bybit', 'bitget', 'kraken', 'coinbase'] as const;
type GlobalExchange = typeof GLOBAL_EXCHANGES[number];
type Phase = 'input' | 'loading' | 'domestic' | 'coin' | 'global' | 'network' | 'trade_method' | 'exit_mode' | 'swap_service' | 'result';
type CoinType = 'USDT' | 'BTC';
type TradeMethod = 'usdt_taker' | 'fdusd_maker';
type ExitMode = 'onchain' | 'lightning';

interface AllData {
  byGlobal: Record<string, CheapestPathResponse>;
  tickers: TickerRow[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isFdusdPath(p: CheapestPathEntry): boolean {
  return p.breakdown?.components.some(c => c.label.includes('FDUSD')) ?? false;
}

function bestByBtc(paths: CheapestPathEntry[]): CheapestPathEntry | null {
  return paths.length ? paths.reduce((a, b) => (a.btc_received ?? 0) > (b.btc_received ?? 0) ? a : b) : null;
}

const SWAP_DISPLAY: Record<string, string> = {
  strike: 'Strike', boltz: 'Boltz', oksusu: 'CornWallet',
  coinos: 'Coinos', walletofsatoshi: 'WalletOfSatoshi',
};

// ── Main Component ────────────────────────────────────────────────────────────

export function RouteExplorerPage() {
  const [phase, setPhase]                       = useState<Phase>('input');
  const [amountInput, setAmountInput]           = useState('100');
  const [amountUnit, setAmountUnit]             = useState<'만원' | '억원'>('만원');
  const [allData, setAllData]                   = useState<AllData | null>(null);
  const [failedExchanges, setFailedExchanges]   = useState<string[]>([]);
  const [selectedDomestic, setSelectedDomestic] = useState<string | null>(null);
  const [selectedCoin, setSelectedCoin]         = useState<CoinType | null>(null);
  const [selectedGlobal, setSelectedGlobal]     = useState<GlobalExchange | null>(null);
  const [selectedNetwork, setSelectedNetwork]   = useState<string | null>(null);
  const [selectedTradeMethod, setSelectedTradeMethod] = useState<TradeMethod | null>(null);
  const [selectedExitMode, setSelectedExitMode] = useState<ExitMode | null>(null);
  const [selectedSwapService, setSelectedSwapService] = useState<string | null>(null);
  const [error, setError]                       = useState<string | null>(null);

  const amountKrw = parseFloat(amountInput || '0') * (amountUnit === '만원' ? 10_000 : 100_000_000);

  // ── Derived: step options ──────────────────────────────────────────────────

  const domesticTakerFees = useMemo(() => {
    if (!allData) return {} as Record<string, number>;
    const fees: Record<string, number> = {};
    for (const t of allData.tickers) {
      if (t.currency === 'KRW' && t.taker_fee_pct != null && t.pair?.includes('BTC')) {
        fees[t.exchange] = t.taker_fee_pct;
      }
    }
    return fees;
  }, [allData]);

  const domesticOptions = useMemo(() => {
    if (!allData) return [] as { exchange: string; bestBtc: number }[];
    const map = new Map<string, number>();
    for (const data of Object.values(allData.byGlobal)) {
      for (const p of data.all_paths) {
        const cur = map.get(p.korean_exchange) ?? 0;
        if ((p.btc_received ?? 0) > cur) map.set(p.korean_exchange, p.btc_received ?? 0);
      }
    }
    return [...map.entries()]
      .map(([exchange, bestBtc]) => ({ exchange, bestBtc }))
      .sort((a, b) => b.bestBtc - a.bestBtc);
  }, [allData]);

  const coinOptions = useMemo(() => {
    if (!allData || !selectedDomestic) return [] as { coin: CoinType; best: CheapestPathEntry }[];
    const anyData = Object.values(allData.byGlobal)[0];
    if (!anyData) return [];
    const paths = anyData.all_paths.filter(p => p.korean_exchange === selectedDomestic);
    const opts: { coin: CoinType; best: CheapestPathEntry }[] = [];
    const usdtBest = bestByBtc(paths.filter(p => p.transfer_coin === 'USDT'));
    const btcBest  = bestByBtc(paths.filter(p => p.transfer_coin === 'BTC'));
    if (usdtBest) opts.push({ coin: 'USDT', best: usdtBest });
    if (btcBest)  opts.push({ coin: 'BTC',  best: btcBest  });
    return opts;
  }, [allData, selectedDomestic]);

  const globalOptions = useMemo(() => {
    if (!allData || !selectedDomestic || selectedCoin !== 'USDT') return [];
    return GLOBAL_EXCHANGES.map(g => {
      const paths = (allData.byGlobal[g]?.all_paths ?? []).filter(p =>
        p.korean_exchange === selectedDomestic && p.transfer_coin === 'USDT',
      );
      const best = bestByBtc(paths);
      if (!best) return null;
      const hasLightning = paths.some(p => p.global_exit_mode === 'lightning');
      return { exchange: g, best, hasLightning };
    }).filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => (b.best.btc_received ?? 0) - (a.best.btc_received ?? 0));
  }, [allData, selectedDomestic, selectedCoin]);

  const networkOptions = useMemo(() => {
    if (!allData || !selectedDomestic || !selectedCoin) return [] as { network: string; best: CheapestPathEntry }[];
    let paths: CheapestPathEntry[];
    if (selectedCoin === 'BTC') {
      const anyData = Object.values(allData.byGlobal)[0];
      paths = (anyData?.all_paths ?? []).filter(p =>
        p.korean_exchange === selectedDomestic && p.transfer_coin === 'BTC',
      );
    } else {
      if (!selectedGlobal) return [];
      paths = (allData.byGlobal[selectedGlobal]?.all_paths ?? []).filter(p =>
        p.korean_exchange === selectedDomestic && p.transfer_coin === 'USDT',
      );
    }
    const map = new Map<string, CheapestPathEntry>();
    for (const p of paths) {
      const cur = map.get(p.network);
      if (!cur || (p.btc_received ?? 0) > (cur.btc_received ?? 0)) map.set(p.network, p);
    }
    return [...map.entries()].map(([network, best]) => ({ network, best }));
  }, [allData, selectedDomestic, selectedCoin, selectedGlobal]);

  const tradeMethodOptions = useMemo(() => {
    if (!allData || !selectedDomestic || selectedCoin !== 'USDT' || !selectedGlobal || !selectedNetwork)
      return [] as { id: TradeMethod; label: string; sublabel: string; best: CheapestPathEntry }[];
    const paths = (allData.byGlobal[selectedGlobal]?.all_paths ?? []).filter(p =>
      p.korean_exchange === selectedDomestic && p.transfer_coin === 'USDT' && p.network === selectedNetwork,
    );
    const opts: { id: TradeMethod; label: string; sublabel: string; best: CheapestPathEntry }[] = [];
    const takerBest = bestByBtc(paths.filter(p => !isFdusdPath(p)));
    const fdusdBest = bestByBtc(paths.filter(p =>  isFdusdPath(p)));
    if (takerBest) opts.push({ id: 'usdt_taker',   label: 'USDT → BTC',          sublabel: 'Taker 시장가 매수',               best: takerBest });
    if (fdusdBest) opts.push({ id: 'fdusd_maker', label: 'USDT → FDUSD → BTC', sublabel: 'FDUSD Maker 0% 프로모션 적용',     best: fdusdBest });
    return opts;
  }, [allData, selectedDomestic, selectedCoin, selectedGlobal, selectedNetwork]);

  const exitModeOptions = useMemo(() => {
    if (!allData || !selectedDomestic || !selectedCoin) return [] as { id: ExitMode; label: string; sublabel: string; best: CheapestPathEntry }[];
    if (selectedCoin === 'BTC') {
      const anyData = Object.values(allData.byGlobal)[0];
      const best = bestByBtc((anyData?.all_paths ?? []).filter(p =>
        p.korean_exchange === selectedDomestic && p.transfer_coin === 'BTC' && p.network === selectedNetwork,
      ));
      return best ? [{ id: 'onchain' as ExitMode, label: '온체인 출금', sublabel: 'Bitcoin 네트워크', best }] : [];
    }
    if (!selectedGlobal || !selectedNetwork) return [];
    const paths = (allData.byGlobal[selectedGlobal]?.all_paths ?? []).filter(p =>
      p.korean_exchange === selectedDomestic && p.transfer_coin === 'USDT' &&
      p.network === selectedNetwork &&
      (selectedTradeMethod === 'fdusd_maker' ? isFdusdPath(p) : !isFdusdPath(p)),
    );
    const opts: { id: ExitMode; label: string; sublabel: string; best: CheapestPathEntry }[] = [];
    const onchainBest  = bestByBtc(paths.filter(p => p.global_exit_mode === 'onchain'));
    const lightningBest = bestByBtc(paths.filter(p => p.global_exit_mode === 'lightning'));
    if (onchainBest)   opts.push({ id: 'onchain',   label: '온체인 출금',   sublabel: 'Bitcoin 주소로 직접 출금',    best: onchainBest });
    if (lightningBest) opts.push({ id: 'lightning', label: '⚡ Lightning 출금', sublabel: 'LN 채널 → 스왑 서비스 → 온체인', best: lightningBest });
    return opts;
  }, [allData, selectedDomestic, selectedCoin, selectedGlobal, selectedNetwork, selectedTradeMethod]);

  const swapServiceOptions = useMemo(() => {
    if (!allData || !selectedDomestic || selectedCoin !== 'USDT' || !selectedGlobal || !selectedNetwork || selectedExitMode !== 'lightning')
      return [] as { service: string; display: string; best: CheapestPathEntry }[];
    const paths = (allData.byGlobal[selectedGlobal]?.all_paths ?? []).filter(p =>
      p.korean_exchange === selectedDomestic && p.transfer_coin === 'USDT' &&
      p.network === selectedNetwork && p.global_exit_mode === 'lightning' &&
      (selectedTradeMethod === 'fdusd_maker' ? isFdusdPath(p) : !isFdusdPath(p)),
    );
    const map = new Map<string, CheapestPathEntry>();
    for (const p of paths) {
      const svc = p.lightning_exit_provider ?? p.swap_service ?? 'unknown';
      const cur = map.get(svc);
      if (!cur || (p.btc_received ?? 0) > (cur.btc_received ?? 0)) map.set(svc, p);
    }
    return [...map.entries()]
      .map(([service, best]) => ({ service, display: SWAP_DISPLAY[service] ?? service, best }))
      .sort((a, b) => (b.best.btc_received ?? 0) - (a.best.btc_received ?? 0));
  }, [allData, selectedDomestic, selectedCoin, selectedGlobal, selectedNetwork, selectedTradeMethod, selectedExitMode]);

  // ── Final matched path ─────────────────────────────────────────────────────

  const matchedPath = useMemo((): CheapestPathEntry | null => {
    if (!allData || !selectedDomestic || !selectedCoin || !selectedNetwork || !selectedExitMode) return null;
    if (selectedCoin === 'BTC') {
      const anyData = Object.values(allData.byGlobal)[0];
      return (anyData?.all_paths ?? []).find(p =>
        p.korean_exchange === selectedDomestic && p.transfer_coin === 'BTC' && p.network === selectedNetwork,
      ) ?? null;
    }
    if (!selectedGlobal) return null;
    const paths = (allData.byGlobal[selectedGlobal]?.all_paths ?? []).filter(p =>
      p.korean_exchange === selectedDomestic && p.transfer_coin === 'USDT' &&
      p.network === selectedNetwork && p.global_exit_mode === selectedExitMode &&
      (selectedTradeMethod === 'fdusd_maker' ? isFdusdPath(p) : !isFdusdPath(p)),
    );
    if (selectedExitMode === 'lightning' && selectedSwapService) {
      return paths.find(p => (p.lightning_exit_provider ?? p.swap_service) === selectedSwapService) ?? null;
    }
    return paths[0] ?? null;
  }, [allData, selectedDomestic, selectedCoin, selectedGlobal, selectedNetwork, selectedTradeMethod, selectedExitMode, selectedSwapService]);

  // ── API fetch ──────────────────────────────────────────────────────────────

  async function handleSearch() {
    if (!amountKrw || amountKrw < 10_000) return;
    setPhase('loading');
    setSelectedDomestic(null); setSelectedCoin(null); setSelectedGlobal(null);
    setSelectedNetwork(null); setSelectedTradeMethod(null);
    setSelectedExitMode(null); setSelectedSwapService(null);
    setAllData(null); setError(null); setFailedExchanges([]);
    try {
      const [tickerRes, ...pathResults] = await Promise.all([
        api.getTickers().catch(() => ({ last_run: null, items: [] as TickerRow[] })),
        ...GLOBAL_EXCHANGES.map(g =>
          api.getCheapestPath({ mode: 'buy', amountKrw, globalExchange: g }).catch(() => null),
        ),
      ]);
      const byGlobal: Record<string, CheapestPathResponse> = {};
      const failed: string[] = [];
      GLOBAL_EXCHANGES.forEach((g, i) => {
        const r = pathResults[i];
        if (r && !r.error) byGlobal[g] = r;
        else failed.push(g);
      });
      if (Object.keys(byGlobal).length === 0) throw new Error('모든 거래소 조회 실패');
      if (failed.length) setFailedExchanges(failed);
      setAllData({ byGlobal, tickers: tickerRes.items });
      setPhase('domestic');
    } catch (e) {
      setError(e instanceof Error ? e.message : '데이터 로드 오류');
      setPhase('input');
    }
  }

  // ── Step handlers ──────────────────────────────────────────────────────────

  function handleDomesticSelect(ex: string) {
    setSelectedDomestic(ex);
    setSelectedCoin(null); setSelectedGlobal(null); setSelectedNetwork(null);
    setSelectedTradeMethod(null); setSelectedExitMode(null); setSelectedSwapService(null);
    setPhase('coin');
  }

  function handleCoinSelect(coin: CoinType) {
    setSelectedCoin(coin);
    setSelectedGlobal(null); setSelectedNetwork(null);
    setSelectedTradeMethod(null); setSelectedExitMode(null); setSelectedSwapService(null);
    setPhase(coin === 'BTC' ? 'network' : 'global');
  }

  function handleGlobalSelect(g: GlobalExchange) {
    setSelectedGlobal(g);
    setSelectedNetwork(null); setSelectedTradeMethod(null);
    setSelectedExitMode(null); setSelectedSwapService(null);
    setPhase('network');
  }

  function handleNetworkSelect(network: string) {
    setSelectedNetwork(network);
    setSelectedTradeMethod(null); setSelectedExitMode(null); setSelectedSwapService(null);
    if (selectedCoin === 'BTC') {
      setSelectedExitMode('onchain');
      setPhase('result');
    } else {
      setPhase('trade_method');
    }
  }

  function handleTradeMethodSelect(tm: TradeMethod) {
    setSelectedTradeMethod(tm);
    setSelectedExitMode(null); setSelectedSwapService(null);
    setPhase('exit_mode');
  }

  function handleExitModeSelect(mode: ExitMode) {
    setSelectedExitMode(mode);
    setSelectedSwapService(null);
    setPhase(mode === 'lightning' ? 'swap_service' : 'result');
  }

  function handleSwapServiceSelect(svc: string) {
    setSelectedSwapService(svc);
    setPhase('result');
  }

  function handleReset() {
    setPhase('input'); setAllData(null); setFailedExchanges([]);
    setSelectedDomestic(null); setSelectedCoin(null); setSelectedGlobal(null);
    setSelectedNetwork(null); setSelectedTradeMethod(null);
    setSelectedExitMode(null); setSelectedSwapService(null); setError(null);
  }

  function goBackTo(p: Phase) {
    setPhase(p);
    if (p === 'domestic') { setSelectedCoin(null); setSelectedGlobal(null); setSelectedNetwork(null); setSelectedTradeMethod(null); setSelectedExitMode(null); setSelectedSwapService(null); }
    if (p === 'coin')     { setSelectedGlobal(null); setSelectedNetwork(null); setSelectedTradeMethod(null); setSelectedExitMode(null); setSelectedSwapService(null); }
    if (p === 'global')   { setSelectedNetwork(null); setSelectedTradeMethod(null); setSelectedExitMode(null); setSelectedSwapService(null); }
    if (p === 'network')  { setSelectedTradeMethod(null); setSelectedExitMode(null); setSelectedSwapService(null); }
    if (p === 'trade_method') { setSelectedExitMode(null); setSelectedSwapService(null); }
    if (p === 'exit_mode')    { setSelectedSwapService(null); }
  }

  // ── Phase ordering for "is step done" check ────────────────────────────────

  const PHASE_ORDER: Phase[] = ['input', 'loading', 'domestic', 'coin', 'global', 'network', 'trade_method', 'exit_mode', 'swap_service', 'result'];
  const phaseIdx = (p: Phase) => PHASE_ORDER.indexOf(p);
  const isPast = (p: Phase) => phaseIdx(phase) > phaseIdx(p);
  const isActive = (p: Phase) => phase === p;

  const showSteps = phase !== 'input' && phase !== 'loading';

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-dark-500 text-bnb-text">

      {/* Header */}
      <header className="sticky top-0 z-10 bg-dark-400 border-b border-dark-200">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bitcoin className="w-5 h-5 text-brand-500" />
            <span className="font-semibold text-sm">BTC 출금 경로 탐색</span>
          </div>
          {allData && (
            <button onClick={handleReset} className="flex items-center gap-1 text-xs text-bnb-muted hover:text-bnb-text transition-colors">
              <RefreshCw className="w-3 h-3" /> 초기화
            </button>
          )}
        </div>
        {showSteps && (
          <div className="max-w-2xl mx-auto px-4 pb-2 flex items-center gap-1 text-xs overflow-x-auto">
            {[
              { label: `₩${amountInput}${amountUnit}`, done: true },
              { label: selectedDomestic ? fmtEx(selectedDomestic) : '국내 거래소', done: !!selectedDomestic },
              { label: selectedCoin ?? '출금 코인', done: !!selectedCoin },
              ...(selectedCoin !== 'BTC' ? [{ label: selectedGlobal ? fmtEx(selectedGlobal) : '해외 거래소', done: !!selectedGlobal }] : []),
              { label: selectedNetwork ?? '네트워크', done: !!selectedNetwork },
              ...(selectedCoin !== 'BTC' ? [{ label: selectedTradeMethod === 'fdusd_maker' ? 'FDUSD' : selectedTradeMethod ? 'Taker' : '매수 방식', done: !!selectedTradeMethod }] : []),
              { label: selectedExitMode ?? '출금 방식', done: !!selectedExitMode },
              ...(selectedExitMode === 'lightning' ? [{ label: selectedSwapService ? (SWAP_DISPLAY[selectedSwapService] ?? selectedSwapService) : '스왑 서비스', done: !!selectedSwapService }] : []),
            ].map((s, i, arr) => (
              <span key={i} className="flex items-center gap-1 whitespace-nowrap">
                <span className={s.done ? 'text-brand-500 font-medium' : 'text-bnb-muted'}>{s.label}</span>
                {i < arr.length - 1 && <ArrowRight className={`w-3 h-3 flex-shrink-0 ${s.done ? 'text-brand-500' : 'text-dark-100'}`} />}
              </span>
            ))}
          </div>
        )}
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-3">

        {/* Step 0: Amount */}
        <StepCard dimmed={showSteps}>
          <p className="text-xs text-bnb-muted mb-2">투자 금액</p>
          <div className="flex items-center gap-3">
            <span className="text-brand-500 text-xl font-bold">₩</span>
            <input type="number" value={amountInput} onChange={e => setAmountInput(e.target.value)}
              disabled={showSteps}
              className="flex-1 bg-transparent text-2xl font-bold outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              placeholder="100" min="1"
            />
            <div className="flex gap-1">
              {(['만원', '억원'] as const).map(u => (
                <button key={u} onClick={() => setAmountUnit(u)} disabled={showSteps}
                  className={`text-xs px-2 py-1 rounded transition-all ${amountUnit === u ? 'bg-brand-500 text-dark-500 font-bold' : 'text-bnb-muted hover:text-bnb-text'}`}
                >{u}</button>
              ))}
            </div>
          </div>
          <p className="text-xs text-bnb-muted mt-1">= ₩{(amountKrw || 0).toLocaleString('ko-KR')}</p>
          {phase === 'input' && (
            <button onClick={handleSearch} disabled={!amountKrw || amountKrw < 10_000}
              className="mt-4 w-full py-2.5 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:opacity-30 text-dark-500 font-bold text-sm transition-all active:scale-[0.98]"
            >
              경로 탐색 시작
            </button>
          )}
        </StepCard>

        {error && <p className="text-bnb-red text-sm text-center">{error}</p>}

        {/* Loading */}
        {phase === 'loading' && (
          <div className="flex flex-col items-center gap-4 py-12">
            <div className="relative">
              <Bitcoin className="w-12 h-12 text-brand-500 animate-pulse" />
              <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-brand-500">
                <span className="absolute inset-0 rounded-full bg-brand-400 animate-live-ping" />
              </span>
            </div>
            <p className="text-bnb-muted text-sm">6개 글로벌 거래소 실시간 조회 중...</p>
            <div className="flex gap-1.5">
              {[0,1,2].map(i => <span key={i} className="w-2 h-2 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
            </div>
          </div>
        )}

        {/* Step 1: 국내 거래소 */}
        {showSteps && (
          <StepCard dimmed={!isActive('domestic') && !isPast('domestic')} animate>
            <StepHeader icon={<MapPin className="w-3 h-3" />} label="1. 출발 거래소 (국내)"
              done={isPast('domestic') || isActive('coin') || isPast('coin')}
              onEdit={isPast('domestic') ? () => goBackTo('domestic') : undefined}
            />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
              {domesticOptions.map(({ exchange, bestBtc }, idx) => {
                const takerFee = domesticTakerFees[exchange];
                const refGlobalKrw = (() => {
                  const ref = allData?.byGlobal['binance'] ?? Object.values(allData?.byGlobal ?? {})[0];
                  return ref ? ref.global_btc_price_usd * ref.usd_krw_rate : 0;
                })();
                const domesticPrice = allData?.tickers.find(
                  t => t.exchange === exchange && t.currency === 'KRW' && t.pair?.includes('BTC'),
                )?.price;
                const kimchi = domesticPrice && refGlobalKrw
                  ? ((domesticPrice - refGlobalKrw) / refGlobalKrw) * 100
                  : null;
                return (
                  <ChoiceBtn key={exchange} selected={selectedDomestic === exchange}
                    onClick={() => handleDomesticSelect(exchange)} disabled={isPast('domestic')}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-sm">{fmtEx(exchange)}</span>
                      {idx === 0 && (
                        <span className="text-[10px] font-bold bg-brand-500 text-dark-500 px-1.5 py-0.5 rounded">최적</span>
                      )}
                    </div>
                    <div className="text-xs text-bnb-muted font-data mt-0.5">{formatSats(bestBtc)}</div>
                    {takerFee != null && (
                      <div className="text-xs text-dark-100 mt-1">거래 수수료 {takerFee.toFixed(2)}%</div>
                    )}
                    {kimchi != null && (
                      <div className={`text-xs mt-0.5 font-medium ${kimchi > 2 ? 'text-bnb-red' : kimchi > 0 ? 'text-brand-400' : 'text-bnb-green'}`}>
                        {kimchi >= 0 ? `+${kimchi.toFixed(1)}%` : `${kimchi.toFixed(1)}%`} 김프
                      </div>
                    )}
                  </ChoiceBtn>
                );
              })}
            </div>
          </StepCard>
        )}

        {/* Step 2: 출금 코인 */}
        {showSteps && (isPast('domestic') || isActive('coin') || isPast('coin')) && (
          <StepCard dimmed={!isActive('coin') && !isPast('coin')} animate>
            <StepHeader icon={<Bitcoin className="w-3 h-3" />} label="2. 국내 출금 코인"
              done={isPast('coin')}
              onEdit={isPast('coin') ? () => goBackTo('coin') : undefined}
            />
            <div className="grid grid-cols-2 gap-2 mt-3">
              {coinOptions.map(({ coin, best }) => (
                <ChoiceBtn key={coin} selected={selectedCoin === coin}
                  onClick={() => handleCoinSelect(coin)} disabled={isPast('coin')}
                >
                  <div className="font-semibold text-sm">{coin === 'USDT' ? '💵 USDT' : '₿ BTC'}</div>
                  <div className="text-xs text-bnb-muted mt-0.5">
                    {coin === 'USDT' ? '해외 거래소 경유' : '직접 온체인 출금'}
                  </div>
                  <FeeTag path={best} />
                </ChoiceBtn>
              ))}
            </div>
          </StepCard>
        )}

        {/* Step 3: 해외 거래소 (USDT only) */}
        {showSteps && selectedCoin === 'USDT' && (isPast('coin') || isActive('global') || isPast('global')) && (
          <StepCard dimmed={!isActive('global') && !isPast('global')} animate>
            <StepHeader icon={<Globe className="w-3 h-3" />} label="3. 경유 거래소 (해외)"
              done={isPast('global')}
              onEdit={isPast('global') ? () => goBackTo('global') : undefined}
            />
            {failedExchanges.length > 0 && (
              <p className="mt-2 text-xs text-bnb-muted bg-dark-400 rounded px-3 py-1.5">
                데이터 없음: {failedExchanges.map(fmtEx).join(', ')} — 비교에서 제외됨
              </p>
            )}
            <div className="space-y-2 mt-3">
              {globalOptions.map(({ exchange, best, hasLightning }) => (
                <ChoiceBtn key={exchange} selected={selectedGlobal === exchange}
                  onClick={() => handleGlobalSelect(exchange)} disabled={isPast('global')}
                  horizontal
                >
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-sm">{fmtEx(exchange)}</span>
                      {hasLightning && <Zap className="w-3 h-3 text-yellow-400" />}
                    </div>
                    <div className="text-xs text-bnb-muted mt-0.5">{hasLightning ? 'Lightning 출금 지원' : '온체인 출금'}</div>
                  </div>
                  <FeeTag path={best} align="right" />
                </ChoiceBtn>
              ))}
            </div>
          </StepCard>
        )}

        {/* Step 4: 네트워크 */}
        {showSteps && (selectedCoin === 'BTC' ? isPast('coin') : isPast('global')) && (
          <StepCard dimmed={!isActive('network') && !isPast('network')} animate>
            <StepHeader icon={<ArrowDown className="w-3 h-3" />}
              label={`${selectedCoin === 'BTC' ? '3' : '4'}. 출금 네트워크`}
              done={isPast('network')}
              onEdit={isPast('network') ? () => goBackTo('network') : undefined}
            />
            <div className="space-y-2 mt-3">
              {networkOptions.map(({ network, best }) => (
                <ChoiceBtn key={network} selected={selectedNetwork === network}
                  onClick={() => handleNetworkSelect(network)} disabled={isPast('network')}
                  horizontal
                >
                  <div>
                    <div className="font-semibold text-sm">{network}</div>
                    {best.breakdown?.components.find(c => c.label.includes('출금')) && (
                      <div className="text-xs text-bnb-muted mt-0.5">
                        출금 수수료: {best.breakdown.components.find(c => c.label.includes('출금'))?.amount_text}
                      </div>
                    )}
                  </div>
                  <FeeTag path={best} align="right" />
                </ChoiceBtn>
              ))}
            </div>
          </StepCard>
        )}

        {/* Step 5: 매수 방식 (USDT only) */}
        {showSteps && selectedCoin === 'USDT' && isPast('network') && (
          <StepCard dimmed={!isActive('trade_method') && !isPast('trade_method')} animate>
            <StepHeader icon={<TrendingDown className="w-3 h-3" />} label="5. 해외 매수 방식"
              done={isPast('trade_method')}
              onEdit={isPast('trade_method') ? () => goBackTo('trade_method') : undefined}
            />
            <div className="space-y-2 mt-3">
              {tradeMethodOptions.map(({ id, label, sublabel, best }) => (
                <ChoiceBtn key={id} selected={selectedTradeMethod === id}
                  onClick={() => handleTradeMethodSelect(id)} disabled={isPast('trade_method')}
                  horizontal
                >
                  <div>
                    <div className="font-semibold text-sm">{label}</div>
                    <div className="text-xs text-bnb-muted mt-0.5">{sublabel}</div>
                  </div>
                  <FeeTag path={best} align="right" />
                </ChoiceBtn>
              ))}
            </div>
          </StepCard>
        )}

        {/* Step 6: 출금 방식 */}
        {showSteps && (selectedCoin === 'BTC' ? isPast('network') : isPast('trade_method')) && (
          <StepCard dimmed={!isActive('exit_mode') && !isPast('exit_mode')} animate>
            <StepHeader icon={<Shield className="w-3 h-3" />}
              label={`${selectedCoin === 'BTC' ? '4' : '6'}. 출금 방식`}
              done={isPast('exit_mode')}
              onEdit={isPast('exit_mode') ? () => goBackTo('exit_mode') : undefined}
            />
            <div className="space-y-2 mt-3">
              {exitModeOptions.map(({ id, label, sublabel, best }) => (
                <ChoiceBtn key={id} selected={selectedExitMode === id}
                  onClick={() => handleExitModeSelect(id)} disabled={isPast('exit_mode')}
                  horizontal
                >
                  <div>
                    <div className="flex items-center gap-1.5 font-semibold text-sm">
                      {id === 'lightning' && <Zap className="w-3.5 h-3.5 text-yellow-400" />}
                      <span>{label}</span>
                    </div>
                    <div className="text-xs text-bnb-muted mt-0.5">{sublabel}</div>
                  </div>
                  <FeeTag path={best} align="right" />
                </ChoiceBtn>
              ))}
            </div>
          </StepCard>
        )}

        {/* Step 7: 스왑 서비스 (Lightning only) */}
        {showSteps && selectedExitMode === 'lightning' && (isPast('exit_mode') || isActive('swap_service') || isPast('swap_service')) && (
          <StepCard dimmed={!isActive('swap_service') && !isPast('swap_service')} animate>
            <StepHeader icon={<Zap className="w-3 h-3" />} label="7. LN → 온체인 스왑 서비스"
              done={isPast('swap_service')}
              onEdit={isPast('swap_service') ? () => goBackTo('swap_service') : undefined}
            />
            <div className="space-y-2 mt-3">
              {swapServiceOptions.map(({ service, display, best }) => {
                const swapComp = best.breakdown?.components.find(c => c.label.includes('스왑'));
                return (
                  <ChoiceBtn key={service} selected={selectedSwapService === service}
                    onClick={() => handleSwapServiceSelect(service)} disabled={isPast('swap_service')}
                    horizontal
                  >
                    <div>
                      <div className="font-semibold text-sm">{display}</div>
                      <div className="text-xs text-bnb-muted mt-0.5">
                        스왑 수수료: {swapComp ? formatFeeKrw(swapComp.amount_krw) : '0'}
                        {swapComp?.rate_pct != null ? ` (${swapComp.rate_pct.toFixed(2)}%)` : ''}
                      </div>
                    </div>
                    <FeeTag path={best} align="right" />
                  </ChoiceBtn>
                );
              })}
            </div>
          </StepCard>
        )}

        {/* Result: Fee Waterfall */}
        {phase === 'result' && matchedPath && (
          <StepCard animate>
            <StepHeader icon={<Award className="w-3 h-3" />} label="수수료 경로 상세" done />
            <div className="mt-4 space-y-1">
              {/* Starting amount */}
              <div className="flex justify-between items-center text-sm py-1.5">
                <span className="text-bnb-muted">투자 금액</span>
                <span className="font-bold font-data text-base">₩{amountKrw.toLocaleString('ko-KR')}</span>
              </div>

              {/* Fee components as waterfall */}
              {(matchedPath.breakdown?.components ?? []).map((c, i) => (
                <div key={i} className="flex justify-between items-start text-sm py-1.5 border-t border-dark-200/50 pl-2">
                  <div>
                    <div className="text-bnb-muted">{c.label}</div>
                    {c.amount_text && <div className="text-xs text-dark-100 mt-0.5">{c.amount_text}</div>}
                  </div>
                  <div className="text-right flex-shrink-0 ml-4">
                    <div className="text-bnb-red font-data font-medium">-{formatFeeKrw(c.amount_krw)}</div>
                    {c.rate_pct != null && (
                      <div className="text-xs text-bnb-muted">{c.rate_pct.toFixed(3)}%</div>
                    )}
                  </div>
                </div>
              ))}

              {/* Total fee */}
              <div className="flex justify-between items-center text-sm py-2 border-t border-dark-100 font-bold">
                <span className="text-bnb-muted">총 수수료</span>
                <div className="text-right">
                  <div className="text-bnb-red font-data">-{formatFeeKrw(matchedPath.total_fee_krw)}</div>
                  <div className="text-xs text-bnb-muted font-normal">{formatPercent(matchedPath.fee_pct)}</div>
                </div>
              </div>

              {/* Final BTC */}
              <div className="mt-2 bg-brand-500/10 border border-brand-500/30 rounded-xl p-4">
                <div className="text-xs text-brand-600 mb-1">최종 수령</div>
                <div className="text-3xl font-bold font-data text-brand-400">{formatSats(matchedPath.btc_received ?? 0)}</div>
                <div className="flex items-center gap-2 mt-2 text-xs text-bnb-muted">
                  <span>{fmtEx(selectedDomestic!)}</span>
                  <ArrowRight className="w-3 h-3" />
                  {selectedGlobal && <><span>{fmtEx(selectedGlobal)}</span><ArrowRight className="w-3 h-3" /></>}
                  {selectedExitMode === 'lightning' && <Zap className="w-3 h-3 text-yellow-400" />}
                  <span>개인 지갑</span>
                </div>
              </div>
            </div>
          </StepCard>
        )}

        {phase === 'result' && !matchedPath && (
          <p className="text-bnb-red text-sm text-center py-8">선택한 경로에 해당하는 데이터가 없습니다.</p>
        )}
      </main>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StepCard({ children, dimmed, animate }: { children: React.ReactNode; dimmed?: boolean; animate?: boolean }) {
  return (
    <div className={`bg-dark-300 border border-dark-200 rounded-xl p-4 transition-opacity duration-300 ${dimmed ? 'opacity-35 pointer-events-none' : ''} ${animate ? 'animate-fade-in-up' : ''}`}>
      {children}
    </div>
  );
}

function StepHeader({ icon, label, done, onEdit }: { icon: React.ReactNode; label: string; done: boolean; onEdit?: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] transition-colors ${done ? 'bg-brand-500 text-dark-500' : 'bg-dark-200 text-bnb-muted'}`}>
          {icon}
        </span>
        <span className="text-xs font-semibold text-bnb-muted uppercase tracking-wide">{label}</span>
      </div>
      {onEdit && (
        <button onClick={onEdit} className="text-xs text-brand-500 hover:text-brand-400 transition-colors">변경</button>
      )}
    </div>
  );
}

function ChoiceBtn({ children, selected, onClick, disabled, horizontal }: {
  children: React.ReactNode;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
  horizontal?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${horizontal ? 'w-full flex items-center justify-between' : 'text-left'} p-3 rounded-lg border transition-all active:scale-[0.98] disabled:cursor-default
        ${selected ? 'border-brand-500 bg-brand-500/10' : 'border-dark-200 hover:border-dark-100 hover:bg-dark-200/40'}`}
    >
      {children}
    </button>
  );
}

function FeeTag({ path, align }: { path: CheapestPathEntry; align?: 'right' }) {
  return (
    <div className={`flex-shrink-0 ml-3 ${align === 'right' ? 'text-right' : ''}`}>
      <div className="font-bold text-sm font-data">{formatSats(path.btc_received ?? 0)}</div>
      <div className="text-xs text-bnb-muted">수수료 {formatPercent(path.fee_pct)}</div>
    </div>
  );
}
