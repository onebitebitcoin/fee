import { useMemo, useState } from 'react';
import {
  ArrowDown, ArrowRight, ArrowsClockwise, Coin,
  CurrencyDollar, EyeSlash, Globe, Lightning, MapPin,
  ShieldCheck, TrendDown, Trophy,
} from '@phosphor-icons/react';

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
type Preference = 'cheapest' | 'non_kyc' | 'lightning';

interface AllData {
  byGlobal: Record<string, CheapestPathResponse>;
  tickers: TickerRow[];
  latestRunAt: number | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isFdusdPath(p: CheapestPathEntry): boolean {
  return p.breakdown?.components.some(c => c.label.includes('FDUSD')) ?? false;
}

function bestByBtc(paths: CheapestPathEntry[]): CheapestPathEntry | null {
  return paths.length ? paths.reduce((a, b) => (a.btc_received ?? 0) > (b.btc_received ?? 0) ? a : b) : null;
}

function applyPreference(paths: CheapestPathEntry[], pref: Preference): CheapestPathEntry[] {
  if (pref === 'lightning') {
    const f = paths.filter(p => p.global_exit_mode === 'lightning');
    return f.length ? f : paths;
  }
  if (pref === 'non_kyc') {
    const f = paths.filter(p =>
      p.domestic_kyc_status !== 'kyc' &&
      p.global_kyc_status !== 'kyc' &&
      (p.exit_service_kyc_status == null || p.exit_service_kyc_status === 'non_kyc'),
    );
    return f.length ? f : paths;
  }
  return paths;
}

const SWAP_DISPLAY: Record<string, string> = {
  strike: 'Strike', boltz: 'Boltz', oksusu: 'CornWallet',
  coinos: 'Coinos', walletofsatoshi: 'WalletOfSatoshi',
};

// CARF / jurisdiction data (source: OECD 2025 Monitoring Update)
const EXCHANGE_CARF: Record<string, { country: string; carfYear: number; fatca: boolean; risk: 'low' | 'med' | 'high' }> = {
  binance:  { country: 'UAE',    carfYear: 2028, fatca: false, risk: 'med'  },
  okx:      { country: '세이셸', carfYear: 2028, fatca: false, risk: 'low'  },
  bybit:    { country: 'UAE',    carfYear: 2028, fatca: false, risk: 'low'  },
  bitget:   { country: '세이셸', carfYear: 2028, fatca: false, risk: 'low'  },
  kraken:   { country: '미국',   carfYear: 2028, fatca: true,  risk: 'high' },
  coinbase: { country: '미국',   carfYear: 2028, fatca: true,  risk: 'high' },
};

// Swap service metadata
const SWAP_META: Record<string, { kyc: boolean; custodial: boolean; risk: 'low' | 'med' | 'high' }> = {
  strike:          { kyc: true,  custodial: true,  risk: 'med' },
  boltz:           { kyc: false, custodial: false, risk: 'low' },
  oksusu:          { kyc: false, custodial: false, risk: 'low' },
  coinos:          { kyc: false, custodial: true,  risk: 'med' },
  walletofsatoshi: { kyc: false, custodial: true,  risk: 'med' },
};

const PREF_OPTIONS = [
  { id: 'cheapest'  as Preference, Icon: TrendDown,  label: '최저 수수료', sub: 'KYC 무관'   },
  { id: 'non_kyc'   as Preference, Icon: EyeSlash,   label: '비KYC 우선', sub: '신원 미제출' },
  { id: 'lightning' as Preference, Icon: Lightning,  label: 'Lightning',  sub: 'LN 경유'    },
];

function fmtTime(ts: number | null): string {
  if (!ts) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Seoul',
  }).format(new Date(ts * 1000));
}

// ── Main Component ────────────────────────────────────────────────────────────

export function RouteExplorerPage() {
  const [phase, setPhase]                             = useState<Phase>('input');
  const [amountInput, setAmountInput]                 = useState('100');
  const [amountUnit, setAmountUnit]                   = useState<'만원' | '억원'>('만원');
  const [allData, setAllData]                         = useState<AllData | null>(null);
  const [failedExchanges, setFailedExchanges]         = useState<string[]>([]);
  const [selectedDomestic, setSelectedDomestic]       = useState<string | null>(null);
  const [selectedCoin, setSelectedCoin]               = useState<CoinType | null>(null);
  const [selectedGlobal, setSelectedGlobal]           = useState<GlobalExchange | null>(null);
  const [selectedNetwork, setSelectedNetwork]         = useState<string | null>(null);
  const [selectedTradeMethod, setSelectedTradeMethod] = useState<TradeMethod | null>(null);
  const [selectedExitMode, setSelectedExitMode]       = useState<ExitMode | null>(null);
  const [selectedSwapService, setSelectedSwapService] = useState<string | null>(null);
  const [preference, setPreference]                   = useState<Preference>('cheapest');
  const [error, setError]                             = useState<string | null>(null);

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

  const allTaggedPaths = useMemo(() => {
    if (!allData) return [] as (CheapestPathEntry & { _g: string })[];
    return Object.entries(allData.byGlobal).flatMap(([g, d]) =>
      d.all_paths.map(p => ({ ...p, _g: g })),
    );
  }, [allData]);

  const recDomestic = useMemo(() => {
    const best = bestByBtc(applyPreference(allTaggedPaths, preference));
    return best?.korean_exchange ?? null;
  }, [allTaggedPaths, preference]);

  const recGlobal = useMemo(() => {
    if (!selectedDomestic) return null;
    const paths = allTaggedPaths.filter(p => p.korean_exchange === selectedDomestic);
    const best = bestByBtc(applyPreference(paths, preference)) as (CheapestPathEntry & { _g: string }) | null;
    return best?._g ?? null;
  }, [allTaggedPaths, selectedDomestic, preference]);

  const recNetwork = useMemo(() => {
    if (!selectedDomestic || !selectedGlobal) return null;
    const paths = (allData?.byGlobal[selectedGlobal]?.all_paths ?? [])
      .filter(p => p.korean_exchange === selectedDomestic && p.transfer_coin === (selectedCoin ?? 'USDT'));
    const best = bestByBtc(applyPreference(paths, preference));
    return best?.network ?? null;
  }, [allData, selectedDomestic, selectedGlobal, selectedCoin, preference]);

  const recTradeMethod = useMemo(() => {
    if (!selectedDomestic || !selectedGlobal || !selectedNetwork) return null;
    const paths = (allData?.byGlobal[selectedGlobal]?.all_paths ?? [])
      .filter(p => p.korean_exchange === selectedDomestic && p.transfer_coin === 'USDT' && p.network === selectedNetwork);
    const best = bestByBtc(applyPreference(paths, preference));
    if (!best) return null;
    return isFdusdPath(best) ? 'fdusd_maker' : 'usdt_taker';
  }, [allData, selectedDomestic, selectedGlobal, selectedNetwork, preference]);

  const recExitMode = useMemo(() => {
    if (!selectedDomestic || !selectedGlobal || !selectedNetwork) return null;
    const paths = (allData?.byGlobal[selectedGlobal]?.all_paths ?? [])
      .filter(p => p.korean_exchange === selectedDomestic && p.transfer_coin === 'USDT' && p.network === selectedNetwork);
    const best = bestByBtc(applyPreference(paths, preference));
    return (best?.global_exit_mode as ExitMode | undefined) ?? null;
  }, [allData, selectedDomestic, selectedGlobal, selectedNetwork, preference]);

  const recSwapService = useMemo(() => {
    if (!selectedDomestic || !selectedGlobal || !selectedNetwork) return null;
    const paths = (allData?.byGlobal[selectedGlobal]?.all_paths ?? [])
      .filter(p => p.korean_exchange === selectedDomestic && p.transfer_coin === 'USDT' && p.network === selectedNetwork && p.global_exit_mode === 'lightning');
    const best = bestByBtc(applyPreference(paths, preference));
    return best ? (best.lightning_exit_provider ?? best.swap_service ?? null) : null;
  }, [allData, selectedDomestic, selectedGlobal, selectedNetwork, preference]);

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
    if (takerBest) opts.push({ id: 'usdt_taker',  label: 'USDT → BTC',         sublabel: 'Taker 시장가 매수',            best: takerBest });
    if (fdusdBest) opts.push({ id: 'fdusd_maker', label: 'USDT → FDUSD → BTC', sublabel: 'FDUSD Maker 0% 프로모션 적용', best: fdusdBest });
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
    const onchainBest   = bestByBtc(paths.filter(p => p.global_exit_mode === 'onchain'));
    const lightningBest = bestByBtc(paths.filter(p => p.global_exit_mode === 'lightning'));
    if (onchainBest)   opts.push({ id: 'onchain',   label: '온체인 출금',    sublabel: 'Bitcoin 주소로 직접 출금',        best: onchainBest });
    if (lightningBest) opts.push({ id: 'lightning', label: 'Lightning 출금', sublabel: 'LN 채널 → 스왑 서비스 → 온체인', best: lightningBest });
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
      const latestRunAt = Object.values(byGlobal)[0]?.last_run?.completed_at ?? null;
      setAllData({ byGlobal, tickers: tickerRes.items, latestRunAt });
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
    if (p === 'domestic')     { setSelectedCoin(null); setSelectedGlobal(null); setSelectedNetwork(null); setSelectedTradeMethod(null); setSelectedExitMode(null); setSelectedSwapService(null); }
    if (p === 'coin')         { setSelectedGlobal(null); setSelectedNetwork(null); setSelectedTradeMethod(null); setSelectedExitMode(null); setSelectedSwapService(null); }
    if (p === 'global')       { setSelectedNetwork(null); setSelectedTradeMethod(null); setSelectedExitMode(null); setSelectedSwapService(null); }
    if (p === 'network')      { setSelectedTradeMethod(null); setSelectedExitMode(null); setSelectedSwapService(null); }
    if (p === 'trade_method') { setSelectedExitMode(null); setSelectedSwapService(null); }
    if (p === 'exit_mode')    { setSelectedSwapService(null); }
  }

  const PHASE_ORDER: Phase[] = ['input', 'loading', 'domestic', 'coin', 'global', 'network', 'trade_method', 'exit_mode', 'swap_service', 'result'];
  const phaseIdx  = (p: Phase) => PHASE_ORDER.indexOf(p);
  const isPast    = (p: Phase) => phaseIdx(phase) > phaseIdx(p);
  const isActive  = (p: Phase) => phase === p;

  const showSteps = phase !== 'input' && phase !== 'loading';

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-dark-500 text-bnb-text">

      {/* Header */}
      <header className="sticky top-0 z-10 bg-dark-400/95 backdrop-blur-sm border-b border-dark-200">
        <div className="max-w-2xl md:max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Coin className="w-5 h-5 text-brand-500" weight="fill" />
            <span className="font-semibold text-sm tracking-tight">BTC 출금 경로 탐색</span>
          </div>
          {allData && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 text-xs text-bnb-muted hover:text-bnb-text transition-colors"
            >
              <ArrowsClockwise className="w-3.5 h-3.5" />
              <span>초기화</span>
            </button>
          )}
        </div>

        {/* Breadcrumb — full-width scroll on mobile, hidden scrollbar */}
        {showSteps && (
          <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden border-t border-dark-200/40">
            <div className="flex items-center gap-1 text-xs px-4 py-2 min-w-max">
              {(([
                { label: `₩${amountInput}${amountUnit}`, done: true, back: null },
                { label: selectedDomestic ? fmtEx(selectedDomestic) : '국내 거래소', done: !!selectedDomestic, back: 'domestic' as Phase },
                { label: selectedCoin ?? '출금 코인', done: !!selectedCoin, back: 'coin' as Phase },
                ...(selectedCoin !== 'BTC' ? [{ label: selectedGlobal ? fmtEx(selectedGlobal) : '해외 거래소', done: !!selectedGlobal, back: 'global' as Phase }] : []),
                { label: selectedNetwork ?? '네트워크', done: !!selectedNetwork, back: 'network' as Phase },
                ...(selectedCoin !== 'BTC' ? [{ label: selectedTradeMethod === 'fdusd_maker' ? 'FDUSD' : selectedTradeMethod ? 'Taker' : '매수 방식', done: !!selectedTradeMethod, back: 'trade_method' as Phase }] : []),
                { label: selectedExitMode ?? '출금 방식', done: !!selectedExitMode, back: 'exit_mode' as Phase },
                ...(selectedExitMode === 'lightning' ? [{ label: selectedSwapService ? (SWAP_DISPLAY[selectedSwapService] ?? selectedSwapService) : '스왑 서비스', done: !!selectedSwapService, back: 'swap_service' as Phase }] : []),
              ] as { label: string; done: boolean; back: Phase | null }[])).map((s, i, arr) => (
                <span key={i} className="flex items-center gap-1 whitespace-nowrap">
                  {s.back && isPast(s.back) ? (
                    <button
                      onClick={() => goBackTo(s.back!)}
                      className="text-brand-500/70 hover:text-brand-400 font-medium transition-colors"
                    >
                      {s.label}
                    </button>
                  ) : (
                    <span className={s.done ? 'text-brand-500 font-medium' : 'text-bnb-muted'}>{s.label}</span>
                  )}
                  {i < arr.length - 1 && (
                    <ArrowRight className={`w-3 h-3 flex-shrink-0 ${s.done ? 'text-brand-500' : 'text-dark-100'}`} />
                  )}
                </span>
              ))}
            </div>
          </div>
        )}
      </header>

      <main className="max-w-2xl md:max-w-3xl mx-auto px-4 py-6 space-y-4">

        {/* Step 0: Amount + Preference */}
        <StepCard active={isActive('input')} dimmed={showSteps && !isActive('input')}>
          {allData?.latestRunAt && (
            <div className="flex items-center gap-1.5 text-xs text-bnb-muted mb-3 pb-2.5 border-b border-dark-200">
              <span className="w-1.5 h-1.5 rounded-full bg-bnb-green flex-shrink-0" />
              데이터 기준: {fmtTime(allData.latestRunAt)} KST
            </div>
          )}

          <p className="text-xs text-bnb-muted mb-2">투자 금액</p>
          <div className="flex items-center gap-3">
            <span className="text-brand-500 text-xl font-bold flex-shrink-0">₩</span>
            <input
              type="number"
              value={amountInput}
              onChange={e => setAmountInput(e.target.value)}
              disabled={showSteps}
              className="flex-1 min-w-0 bg-transparent text-2xl font-bold outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              placeholder="100"
              min="1"
            />
            <div className="flex gap-1 flex-shrink-0">
              {(['만원', '억원'] as const).map(u => (
                <button
                  key={u}
                  onClick={() => setAmountUnit(u)}
                  disabled={showSteps}
                  className={`text-xs px-2 py-1 rounded transition-all ${amountUnit === u ? 'bg-brand-500 text-dark-500 font-bold' : 'text-bnb-muted hover:text-bnb-text'}`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-bnb-muted mt-1">= ₩{(amountKrw || 0).toLocaleString('ko-KR')}</p>

          {/* Preference selector */}
          <div className="mt-4">
            <p className="text-xs text-bnb-muted mb-2">경로 우선순위</p>
            <div className="grid grid-cols-3 gap-2">
              {PREF_OPTIONS.map(({ id, Icon, label, sub }) => (
                <button
                  key={id}
                  onClick={() => { if (!showSteps) setPreference(id); }}
                  disabled={showSteps}
                  className={`p-2.5 rounded-lg border text-left transition-all ${
                    preference === id
                      ? 'border-brand-500 bg-brand-500/10'
                      : 'border-dark-200 hover:border-dark-100'
                  }`}
                >
                  <Icon className={`w-4 h-4 transition-colors ${preference === id ? 'text-brand-500' : 'text-bnb-muted'}`} />
                  <div className={`text-xs font-semibold mt-1.5 ${preference === id ? 'text-brand-400' : 'text-bnb-text'}`}>{label}</div>
                  <div className="text-[10px] text-bnb-muted mt-0.5">{sub}</div>
                </button>
              ))}
            </div>
          </div>

          {phase === 'input' && (
            <button
              onClick={handleSearch}
              disabled={!amountKrw || amountKrw < 10_000}
              className="mt-4 w-full py-2.5 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:opacity-30 text-dark-500 font-bold text-sm transition-all active:scale-[0.98]"
            >
              경로 탐색 시작
            </button>
          )}
        </StepCard>

        {error && <p className="text-bnb-red text-sm text-center">{error}</p>}

        {/* Loading */}
        {phase === 'loading' && (
          <div className="flex flex-col items-center gap-5 py-14">
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-2 border-brand-500/20 flex items-center justify-center">
                <Coin className="w-8 h-8 text-brand-500" weight="fill" />
              </div>
              <span className="absolute inset-0 rounded-full border border-brand-500/40 animate-ping" style={{ animationDuration: '1.8s' }} />
            </div>
            <div className="text-center space-y-1">
              <p className="text-bnb-text text-sm font-medium">실시간 경로 탐색 중</p>
              <p className="text-bnb-muted text-xs">6개 글로벌 거래소 수수료 조회 중...</p>
            </div>
            <div className="w-48 h-0.5 bg-dark-200 rounded-full overflow-hidden">
              <div className="loading-progress-bar" />
            </div>
          </div>
        )}

        {/* Step 1: 국내 거래소 */}
        {showSteps && (
          <StepCard dimmed={!isActive('domestic') && !isPast('domestic')} active={isActive('domestic')} animate>
            <StepHeader
              icon={<MapPin className="w-3.5 h-3.5" />}
              label="1. 출발 거래소 (국내)"
              done={isPast('domestic') || isActive('coin') || isPast('coin')}
            />
            <div className="flex gap-2 mt-2 flex-wrap">
              <InfoTag color="amber">KYC 필수</InfoTag>
              <InfoTag color="blue">국세청 보고 (CARF 2027)</InfoTag>
              <RiskTag risk="low" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
              {domesticOptions.map(({ exchange, bestBtc }) => {
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
                  <ChoiceBtn
                    key={exchange}
                    selected={selectedDomestic === exchange}
                    onClick={() => handleDomesticSelect(exchange)}
                  >
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-sm">{fmtEx(exchange)}</span>
                      {exchange === recDomestic && (
                        <span className="text-[10px] font-bold bg-brand-500 text-dark-500 px-1.5 py-0.5 rounded flex-shrink-0">추천</span>
                      )}
                    </div>
                    <div className="text-xs text-bnb-muted font-data mt-0.5">{formatSats(bestBtc)}</div>
                    {takerFee != null && (
                      <div className="text-xs text-dark-100 mt-1">수수료 {takerFee.toFixed(2)}%</div>
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
          <StepCard dimmed={!isActive('coin') && !isPast('coin')} active={isActive('coin')} animate>
            <StepHeader
              icon={<Coin className="w-3.5 h-3.5" />}
              label="2. 국내 출금 코인"
              done={isPast('coin')}
            />
            <div className="grid grid-cols-2 gap-2 mt-3">
              {coinOptions.map(({ coin, best }) => (
                <ChoiceBtn
                  key={coin}
                  selected={selectedCoin === coin}
                  onClick={() => handleCoinSelect(coin)}
                >
                  <div className="flex items-center gap-1.5 font-semibold text-sm">
                    {coin === 'USDT'
                      ? <><CurrencyDollar className="w-3.5 h-3.5 text-green-400 flex-shrink-0" weight="bold" /><span>USDT</span></>
                      : <><Coin className="w-3.5 h-3.5 text-brand-400 flex-shrink-0" weight="fill" /><span>BTC</span></>
                    }
                  </div>
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
          <StepCard dimmed={!isActive('global') && !isPast('global')} active={isActive('global')} animate>
            <StepHeader
              icon={<Globe className="w-3.5 h-3.5" />}
              label="3. 경유 거래소 (해외)"
              done={isPast('global')}
            />
            {failedExchanges.length > 0 && (
              <p className="mt-2 text-xs text-bnb-muted bg-dark-400 rounded px-3 py-1.5">
                데이터 없음: {failedExchanges.map(fmtEx).join(', ')} — 비교에서 제외됨
              </p>
            )}
            <div className="space-y-2 mt-3">
              {globalOptions.map(({ exchange, best, hasLightning }) => (
                <ChoiceBtn
                  key={exchange}
                  selected={selectedGlobal === exchange}
                  onClick={() => handleGlobalSelect(exchange)}
                  horizontal
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-sm">{fmtEx(exchange)}</span>
                      {hasLightning && <Lightning className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" weight="fill" />}
                      {exchange === recGlobal && (
                        <span className="text-[10px] font-bold bg-brand-500 text-dark-500 px-1.5 py-0.5 rounded flex-shrink-0">추천</span>
                      )}
                    </div>
                    <div className="text-xs text-bnb-muted mt-0.5">{EXCHANGE_CARF[exchange]?.country}</div>
                    <div className="flex gap-1.5 mt-1.5 flex-wrap">
                      <InfoTag color="amber">KYC 필수</InfoTag>
                      <InfoTag color="blue">CARF {EXCHANGE_CARF[exchange]?.carfYear ?? '?'}</InfoTag>
                      {EXCHANGE_CARF[exchange]?.fatca && <InfoTag color="red">FATCA</InfoTag>}
                      <RiskTag risk={EXCHANGE_CARF[exchange]?.risk ?? 'med'} />
                    </div>
                  </div>
                  <FeeTag path={best} align="right" />
                </ChoiceBtn>
              ))}
            </div>
          </StepCard>
        )}

        {/* Step 4: 네트워크 */}
        {showSteps && (selectedCoin === 'BTC' ? isPast('coin') : isPast('global')) && (
          <StepCard dimmed={!isActive('network') && !isPast('network')} active={isActive('network')} animate>
            <StepHeader
              icon={<ArrowDown className="w-3.5 h-3.5" />}
              label={`${selectedCoin === 'BTC' ? '3' : '4'}. 출금 네트워크`}
              done={isPast('network')}
            />
            <div className="space-y-2 mt-3">
              {networkOptions.map(({ network, best }) => (
                <ChoiceBtn
                  key={network}
                  selected={selectedNetwork === network}
                  onClick={() => handleNetworkSelect(network)}
                  horizontal
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-sm">{network}</span>
                      {network === recNetwork && (
                        <span className="text-[10px] font-bold bg-brand-500 text-dark-500 px-1.5 py-0.5 rounded flex-shrink-0">추천</span>
                      )}
                    </div>
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
          <StepCard dimmed={!isActive('trade_method') && !isPast('trade_method')} active={isActive('trade_method')} animate>
            <StepHeader
              icon={<TrendDown className="w-3.5 h-3.5" />}
              label="5. 해외 매수 방식"
              done={isPast('trade_method')}
            />
            <div className="space-y-2 mt-3">
              {tradeMethodOptions.map(({ id, label, sublabel, best }) => (
                <ChoiceBtn
                  key={id}
                  selected={selectedTradeMethod === id}
                  onClick={() => handleTradeMethodSelect(id)}
                  horizontal
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-sm">{label}</span>
                      {id === recTradeMethod && (
                        <span className="text-[10px] font-bold bg-brand-500 text-dark-500 px-1.5 py-0.5 rounded flex-shrink-0">추천</span>
                      )}
                    </div>
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
          <StepCard dimmed={!isActive('exit_mode') && !isPast('exit_mode')} active={isActive('exit_mode')} animate>
            <StepHeader
              icon={<ShieldCheck className="w-3.5 h-3.5" />}
              label={`${selectedCoin === 'BTC' ? '4' : '6'}. 출금 방식`}
              done={isPast('exit_mode')}
            />
            <div className="space-y-2 mt-3">
              {exitModeOptions.map(({ id, label, sublabel, best }) => (
                <ChoiceBtn
                  key={id}
                  selected={selectedExitMode === id}
                  onClick={() => handleExitModeSelect(id)}
                  horizontal
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 font-semibold text-sm">
                      {id === 'lightning' && <Lightning className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" weight="fill" />}
                      <span>{label}</span>
                      {id === recExitMode && (
                        <span className="text-[10px] font-bold bg-brand-500 text-dark-500 px-1.5 py-0.5 rounded flex-shrink-0">추천</span>
                      )}
                    </div>
                    <div className="text-xs text-bnb-muted mt-0.5">{sublabel}</div>
                    <div className="flex gap-1.5 mt-1.5 flex-wrap">
                      {id === 'onchain'
                        ? <><InfoTag color="neutral">온체인 추적 가능</InfoTag><RiskTag risk="low" /></>
                        : <><InfoTag color="green">오프체인 라우팅</InfoTag><RiskTag risk="med" /></>
                      }
                    </div>
                  </div>
                  <FeeTag path={best} align="right" />
                </ChoiceBtn>
              ))}
            </div>
          </StepCard>
        )}

        {/* Step 7: 스왑 서비스 (Lightning only) */}
        {showSteps && selectedExitMode === 'lightning' && (isPast('exit_mode') || isActive('swap_service') || isPast('swap_service')) && (
          <StepCard dimmed={!isActive('swap_service') && !isPast('swap_service')} active={isActive('swap_service')} animate>
            <StepHeader
              icon={<Lightning className="w-3.5 h-3.5" />}
              label="7. LN → 온체인 스왑 서비스"
              done={isPast('swap_service')}
            />
            <div className="space-y-2 mt-3">
              {swapServiceOptions.map(({ service, display, best }) => {
                const swapComp = best.breakdown?.components.find(c => c.label.includes('스왑'));
                const m = SWAP_META[service];
                return (
                  <ChoiceBtn
                    key={service}
                    selected={selectedSwapService === service}
                    onClick={() => handleSwapServiceSelect(service)}
                    horizontal
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-sm">{display}</span>
                        {service === recSwapService && (
                          <span className="text-[10px] font-bold bg-brand-500 text-dark-500 px-1.5 py-0.5 rounded flex-shrink-0">추천</span>
                        )}
                      </div>
                      <div className="text-xs text-bnb-muted mt-0.5">
                        스왑 수수료: {swapComp ? formatFeeKrw(swapComp.amount_krw) : '0'}
                        {swapComp?.rate_pct != null ? ` (${swapComp.rate_pct.toFixed(2)}%)` : ''}
                      </div>
                      {m && (
                        <div className="flex gap-1.5 mt-1.5 flex-wrap">
                          {m.kyc ? <InfoTag color="amber">KYC 필수</InfoTag> : <InfoTag color="green">비KYC</InfoTag>}
                          {m.custodial ? <InfoTag color="neutral">수탁형</InfoTag> : <InfoTag color="green">비수탁</InfoTag>}
                          <RiskTag risk={m.risk} />
                        </div>
                      )}
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
          <StepCard animate active>
            <StepHeader icon={<Trophy className="w-3.5 h-3.5" weight="fill" />} label="수수료 경로 상세" done />
            <div className="mt-4">

              {/* Start node */}
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center flex-shrink-0 w-5">
                  <div className="w-2.5 h-2.5 rounded-full bg-bnb-green mt-0.5" />
                  <div className="w-px flex-1 bg-dark-200 min-h-[1.75rem]" />
                </div>
                <div className="pb-3 flex-1 flex justify-between items-baseline">
                  <span className="text-xs text-bnb-muted">투자 금액</span>
                  <span className="font-bold font-data text-base">₩{amountKrw.toLocaleString('ko-KR')}</span>
                </div>
              </div>

              {/* Fee steps */}
              {(() => {
                let remaining = amountKrw;
                const components = matchedPath.breakdown?.components ?? [];
                return components.map((c, i) => {
                  const isLast = i === components.length - 1;
                  const pctOfOriginal = amountKrw > 0 ? (c.amount_krw / amountKrw) * 100 : 0;
                  remaining -= c.amount_krw;
                  const remainingPct = amountKrw > 0 ? (remaining / amountKrw) * 100 : 0;
                  return (
                    <div key={i} className="flex items-start gap-3">
                      <div className="flex flex-col items-center flex-shrink-0 w-5">
                        <div className="w-2.5 h-2.5 rounded-full border-2 border-bnb-red bg-dark-300 mt-0.5" />
                        <div className={`w-px flex-1 min-h-[3.5rem] ${isLast ? 'bg-transparent' : 'bg-dark-200'}`} />
                      </div>
                      <div className="pb-4 flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-medium leading-tight">{c.label}</div>
                            {c.amount_text && (
                              <div className="text-xs text-dark-100 mt-0.5">{c.amount_text}</div>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="text-bnb-red font-data text-sm font-semibold">
                              -{formatFeeKrw(c.amount_krw)}
                            </div>
                            <div className="text-xs text-bnb-red/70">
                              {c.rate_pct != null
                                ? `단계 ${c.rate_pct.toFixed(3)}%`
                                : `${pctOfOriginal.toFixed(3)}%`}
                            </div>
                          </div>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between text-xs">
                          <span className="text-bnb-muted">잔여</span>
                          <div className="text-right">
                            <span className="font-data text-bnb-text">
                              ₩{Math.round(remaining).toLocaleString('ko-KR')}
                            </span>
                            <span className="text-dark-100 ml-1.5">
                              ({remainingPct.toFixed(2)}%)
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}

              {/* Total summary */}
              <div className="border-t border-dark-200 pt-3 mb-3 flex justify-between items-baseline">
                <span className="text-xs font-semibold text-bnb-muted">총 수수료</span>
                <div className="text-right">
                  <div className="text-bnb-red font-data font-bold text-sm">
                    -{formatFeeKrw(matchedPath.total_fee_krw)}
                  </div>
                  <div className="text-xs text-bnb-muted">{formatPercent(matchedPath.fee_pct)}</div>
                </div>
              </div>

              {/* Final BTC received */}
              <div className="bg-gradient-to-br from-brand-500/15 to-brand-500/5 border border-brand-500/40 rounded-xl p-5 shadow-[inset_0_1px_0_rgba(240,185,11,0.1)]">
                <div className="text-xs font-medium text-brand-500/70 mb-2 uppercase tracking-wider">최종 수령</div>
                <div className="text-4xl md:text-5xl font-bold font-data text-brand-400 drop-shadow-[0_0_16px_rgba(240,185,11,0.35)]">
                  {formatSats(matchedPath.btc_received ?? 0)}
                </div>

                {/* Detailed route nodes */}
                <div className="mt-4 space-y-0">
                  {/* Node: 국내 거래소 */}
                  <RouteNode
                    label={fmtEx(selectedDomestic!)}
                    tags={['KYC 필수', 'CARF 2027 (국내)']}
                    tagColor="amber"
                  />
                  <RouteEdge label={`${selectedCoin} 출금 via ${selectedNetwork}`} />

                  {/* Node: 해외 거래소 (USDT 경로) */}
                  {selectedGlobal && selectedCoin === 'USDT' && (
                    <>
                      <RouteNode
                        label={fmtEx(selectedGlobal)}
                        tags={[
                          EXCHANGE_CARF[selectedGlobal]?.country ?? '',
                          `CARF ${EXCHANGE_CARF[selectedGlobal]?.carfYear ?? '?'}`,
                          ...(EXCHANGE_CARF[selectedGlobal]?.fatca ? ['FATCA'] : []),
                        ].filter(Boolean)}
                        tagColor="blue"
                      />
                      <RouteEdge
                        label={selectedTradeMethod === 'fdusd_maker'
                          ? 'USDT → FDUSD → BTC (Maker 0%)'
                          : 'USDT → BTC (Taker 매수)'}
                      />
                    </>
                  )}

                  {/* Node: 출금 방식 */}
                  {selectedExitMode === 'lightning' ? (
                    <>
                      <RouteNode
                        label="Lightning 출금"
                        tags={['LN 채널', '오프체인 라우팅']}
                        tagColor="yellow"
                        icon={<Lightning className="w-3.5 h-3.5 text-yellow-400" weight="fill" />}
                      />
                      <RouteEdge
                        label={`LN → 온체인 스왑 (${selectedSwapService ? (SWAP_DISPLAY[selectedSwapService] ?? selectedSwapService) : ''})`}
                        isLightning
                      />
                    </>
                  ) : (
                    <RouteEdge label={`온체인 출금 via Bitcoin Network`} />
                  )}

                  {/* Node: 개인 지갑 */}
                  <RouteNode
                    label="개인 지갑"
                    tags={['자기 수탁', '완전 통제']}
                    tagColor="green"
                    isEnd
                    endValue={formatSats(matchedPath.btc_received ?? 0)}
                  />
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

function StepCard({
  children,
  dimmed,
  animate,
  active,
}: {
  children: React.ReactNode;
  dimmed?: boolean;
  animate?: boolean;
  active?: boolean;
}) {
  return (
    <div
      className={[
        'rounded-xl p-4 md:p-5 transition-all duration-300',
        dimmed  ? 'opacity-30 pointer-events-none' : '',
        animate ? 'animate-fade-in-up' : '',
        active
          ? 'bg-dark-300 border border-brand-500/35 shadow-[0_0_28px_rgba(240,185,11,0.07),inset_0_1px_0_rgba(240,185,11,0.05)]'
          : 'bg-dark-300 border border-dark-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]',
      ].join(' ')}
    >
      {children}
    </div>
  );
}

function StepHeader({
  icon,
  label,
  done,
}: {
  icon: React.ReactNode;
  label: string;
  done: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={`flex items-center justify-center w-6 h-6 rounded-full transition-colors flex-shrink-0 ${
          done
            ? 'bg-brand-500 text-dark-500 shadow-[0_0_8px_rgba(240,185,11,0.4)]'
            : 'bg-dark-200 text-bnb-muted border border-dark-100'
        }`}
      >
        {icon}
      </span>
      <span className={`text-sm font-semibold transition-colors ${done ? 'text-bnb-text' : 'text-bnb-text/80'}`}>
        {label}
      </span>
    </div>
  );
}

function ChoiceBtn({
  children,
  selected,
  onClick,
  disabled,
  horizontal,
}: {
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
      className={[
        horizontal ? 'w-full flex items-start justify-between gap-3' : 'text-left w-full',
        'p-3 rounded-lg border transition-all duration-150 active:scale-[0.98] disabled:cursor-default',
        selected
          ? 'border-brand-500/70 bg-brand-500/10 shadow-[0_0_0_1px_rgba(240,185,11,0.2),inset_0_1px_0_rgba(240,185,11,0.08)]'
          : 'border-dark-200 hover:border-dark-100 hover:bg-dark-200/50',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function FeeTag({ path, align }: { path: CheapestPathEntry; align?: 'right' }) {
  return (
    <div className={`flex-shrink-0 ${align === 'right' ? 'text-right' : ''}`}>
      <div className="font-bold text-sm font-data">{formatSats(path.btc_received ?? 0)}</div>
      <div className="text-xs text-bnb-muted">수수료 {formatPercent(path.fee_pct)}</div>
    </div>
  );
}

type TagColor = 'amber' | 'blue' | 'green' | 'red' | 'neutral';
const TAG_CLS: Record<TagColor, string> = {
  amber:   'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  blue:    'bg-blue-500/15 text-blue-400 border-blue-500/30',
  green:   'bg-bnb-green/15 text-bnb-green border-bnb-green/30',
  red:     'bg-bnb-red/15 text-bnb-red border-bnb-red/30',
  neutral: 'bg-dark-200 text-bnb-muted border-dark-100',
};

function InfoTag({ color, children }: { color: TagColor; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded border ${TAG_CLS[color]}`}>
      {children}
    </span>
  );
}

function RiskTag({ risk }: { risk: 'low' | 'med' | 'high' }) {
  const cfg = {
    low:  { dot: 'bg-bnb-green', text: '낮음' },
    med:  { dot: 'bg-brand-400', text: '중간' },
    high: { dot: 'bg-bnb-red',   text: '높음' },
  }[risk];
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border bg-dark-200 text-bnb-muted border-dark-100">
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      위험도 {cfg.text}
    </span>
  );
}

type RouteTagColor = 'amber' | 'blue' | 'green' | 'yellow' | 'neutral';
const ROUTE_TAG_CLS: Record<RouteTagColor, string> = {
  amber:   'bg-yellow-500/10 text-yellow-400/80 border-yellow-500/20',
  blue:    'bg-blue-500/10 text-blue-400/80 border-blue-500/20',
  green:   'bg-bnb-green/10 text-bnb-green/80 border-bnb-green/20',
  yellow:  'bg-yellow-400/10 text-yellow-300/80 border-yellow-400/20',
  neutral: 'bg-dark-200 text-bnb-muted border-dark-100',
};

function RouteNode({
  label,
  tags,
  tagColor,
  icon,
  isEnd,
  endValue,
}: {
  label: string;
  tags?: string[];
  tagColor?: RouteTagColor;
  icon?: React.ReactNode;
  isEnd?: boolean;
  endValue?: string;
}) {
  return (
    <div className={`flex items-start gap-2 px-2.5 py-2 rounded-lg border ${isEnd ? 'border-brand-500/40 bg-brand-500/5' : 'border-dark-100/50 bg-dark-400/50'}`}>
      <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${isEnd ? 'bg-brand-400' : 'bg-bnb-muted'}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {icon}
          <span className={`text-xs font-semibold ${isEnd ? 'text-brand-400' : 'text-bnb-text'}`}>{label}</span>
          {isEnd && endValue && (
            <span className="ml-auto font-data text-xs text-brand-400 font-bold">{endValue}</span>
          )}
        </div>
        {tags && tags.length > 0 && (
          <div className="flex gap-1 mt-1 flex-wrap">
            {tags.map((t, i) => (
              <span
                key={i}
                className={`inline-flex text-[10px] px-1 py-0.5 rounded border ${ROUTE_TAG_CLS[tagColor ?? 'neutral']}`}
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RouteEdge({ label, isLightning }: { label: string; isLightning?: boolean }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1">
      <div className="flex flex-col items-center flex-shrink-0 w-2">
        <div className={`w-px h-3 ${isLightning ? 'bg-yellow-400/50' : 'bg-dark-100'}`} />
        <ArrowDown className={`w-3 h-3 ${isLightning ? 'text-yellow-400/70' : 'text-dark-100'}`} />
        <div className={`w-px h-3 ${isLightning ? 'bg-yellow-400/50' : 'bg-dark-100'}`} />
      </div>
      <span className={`text-[10px] ${isLightning ? 'text-yellow-400/70' : 'text-bnb-muted'}`}>{label}</span>
    </div>
  );
}
