import { useMemo, useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowDown, ArrowRight, ArrowsClockwise, Coin,
  CurrencyDollar, EyeSlash, Globe, Lightning, MapPin,
  ShieldCheck, TrendDown, Trophy, GearSix, CheckCircle,
} from '@phosphor-icons/react';

import { api } from '../lib/api';
import { fmtEx, getExchangeDomain } from '../lib/exchangeNames';
import { formatFeeKrw, formatPercent, formatSats } from '../lib/formatBtc';
import { getKoreanNode } from '../lib/adminSettings';
import type { CheapestPathEntry, CheapestPathResponse, LiveKimpResponse, TickerRow } from '../types';

// ── Constants ────────────────────────────────────────────────────────────────

const GLOBAL_EXCHANGES = ['binance', 'okx', 'bybit', 'bitget', 'kraken', 'coinbase'] as const;
type GlobalExchange = typeof GLOBAL_EXCHANGES[number];
type Phase = 'input' | 'loading' | 'domestic' | 'coin' | 'global' | 'network' | 'trade_method' | 'exit_mode' | 'swap_service' | 'result';
type CoinType = 'USDT' | 'BTC' | 'BTC_VIA';
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

const PHASE_ORDER: Phase[] = ['input', 'loading', 'domestic', 'coin', 'global', 'network', 'trade_method', 'exit_mode', 'swap_service', 'result'];
const phaseIdx = (p: Phase) => PHASE_ORDER.indexOf(p);

// ── Main Component ────────────────────────────────────────────────────────────

export function RouteExplorerPage() {
  const navigate = useNavigate();
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
  const [liveKimp, setLiveKimp]                       = useState<LiveKimpResponse | null>(null);
  const [kimpLoading, setKimpLoading]                 = useState(false);
  const [exchangeVolumes, setExchangeVolumes]         = useState<Record<string, { volume_24h_usd: number | null; volume_7d_usd: number | null; volume_30d_usd: number | null; trust_rank: number | null }>>({});

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

  const snapshotKimp = useMemo(() => {
    if (!allData) return {} as Record<string, number>;
    const ref = allData.byGlobal['binance'] ?? Object.values(allData.byGlobal)[0];
    if (!ref) return {} as Record<string, number>;
    const globalKrw = ref.global_btc_price_usd * ref.usd_krw_rate;
    const result: Record<string, number> = {};
    for (const t of allData.tickers) {
      if (t.currency === 'KRW' && t.pair?.includes('BTC') && t.price && globalKrw) {
        result[t.exchange] = ((t.price - globalKrw) / globalKrw) * 100;
      }
    }
    return result;
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
    if (usdtBest) opts.push({ coin: 'USDT',    best: usdtBest });
    if (btcBest)  opts.push({ coin: 'BTC',     best: btcBest  });
    if (btcBest)  opts.push({ coin: 'BTC_VIA', best: btcBest  });
    return opts;
  }, [allData, selectedDomestic]);

  const globalOptions = useMemo(() => {
    if (!allData || !selectedDomestic) return [];
    if (selectedCoin !== 'USDT' && selectedCoin !== 'BTC_VIA') return [];
    return GLOBAL_EXCHANGES.map(g => {
      const coin = selectedCoin === 'USDT' ? 'USDT' : 'BTC';
      const paths = (allData.byGlobal[g]?.all_paths ?? []).filter(p =>
        p.korean_exchange === selectedDomestic && p.transfer_coin === coin,
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

  // ── 실시간 카트 — 현재까지 선택된 경로의 최선 비용 추적 ──────────────────
  const liveCartPath = useMemo((): CheapestPathEntry | null => {
    if (matchedPath) return matchedPath;
    if (!allData || !selectedDomestic) return null;

    const anyGlobalData = Object.values(allData.byGlobal)[0];
    const domesticPaths = anyGlobalData?.all_paths.filter(p => p.korean_exchange === selectedDomestic) ?? [];

    if (!selectedCoin) return bestByBtc(applyPreference(domesticPaths, preference));

    if (selectedCoin === 'BTC') {
      const btcPaths = domesticPaths.filter(p => p.transfer_coin === 'BTC');
      if (!selectedNetwork) return bestByBtc(btcPaths);
      return btcPaths.find(p => p.network === selectedNetwork) ?? bestByBtc(btcPaths);
    }

    const transferCoin = selectedCoin === 'BTC_VIA' ? 'BTC' : 'USDT';
    if (!selectedGlobal) {
      const allUsdtPaths = GLOBAL_EXCHANGES.flatMap(g =>
        (allData.byGlobal[g]?.all_paths ?? []).filter(p =>
          p.korean_exchange === selectedDomestic && p.transfer_coin === transferCoin,
        ),
      );
      return bestByBtc(allUsdtPaths);
    }

    const globalPaths = (allData.byGlobal[selectedGlobal]?.all_paths ?? []).filter(p =>
      p.korean_exchange === selectedDomestic && p.transfer_coin === transferCoin,
    );
    if (!selectedNetwork) return bestByBtc(globalPaths);

    const networkPaths = globalPaths.filter(p => p.network === selectedNetwork);
    if (!selectedExitMode) return bestByBtc(networkPaths);

    return bestByBtc(networkPaths.filter(p => p.global_exit_mode === selectedExitMode)) ?? bestByBtc(networkPaths);
  }, [matchedPath, allData, selectedDomestic, selectedCoin, selectedGlobal, selectedNetwork, selectedExitMode, preference]);

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
      fetchLiveKimp(false);
      api.getExchangeVolumes().then(res => {
        setExchangeVolumes(res.volumes as typeof exchangeVolumes);
      }).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : '데이터 로드 오류');
      setPhase('input');
    }
  }

  async function fetchLiveKimp(forceRefresh: boolean) {
    setKimpLoading(true);
    try {
      const data = await api.getLiveKimp(forceRefresh);
      setLiveKimp(data);
    } catch {
      // ignore fetch errors
    } finally {
      setKimpLoading(false);
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
    } else if (selectedCoin === 'BTC_VIA') {
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

  const isPast    = (p: Phase) => phaseIdx(phase) > phaseIdx(p);
  const isActive  = (p: Phase) => phase === p;
  const showSteps = phase !== 'input' && phase !== 'loading';

  useEffect(() => {
    if (phase === 'input') return;
    const t = setTimeout(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }, 120);
    return () => clearTimeout(t);
  }, [phase]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-dark-500 text-bnb-text">

      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Coin className="w-5 h-5 text-brand-600" weight="fill" />
            <span className="font-semibold text-sm tracking-tight">BTC 출금 경로 탐색</span>
          </div>
          <div className="flex items-center gap-3">
            {allData && (
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-bnb-text transition-colors"
              >
                <ArrowsClockwise className="w-3.5 h-3.5" />
                <span>초기화</span>
              </button>
            )}
            <button
              onClick={() => navigate('/admin')}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-bnb-text transition-colors"
              title="관리자 설정"
            >
              <GearSix className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Breadcrumb */}
        {showSteps && (
          <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden border-t border-slate-100">
            <div className="flex items-center gap-1 text-xs px-4 py-2 min-w-max max-w-7xl mx-auto">
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
                      className="text-brand-600 hover:text-brand-700 font-medium transition-colors"
                    >
                      {s.label}
                    </button>
                  ) : (
                    <span className={s.done ? 'text-brand-700 font-medium' : 'text-slate-400'}>{s.label}</span>
                  )}
                  {i < arr.length - 1 && (
                    <ArrowRight className={`w-3 h-3 flex-shrink-0 ${s.done ? 'text-brand-500' : 'text-slate-300'}`} />
                  )}
                </span>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* Main: 3-column layout on desktop */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="lg:grid lg:grid-cols-[220px_1fr_260px] lg:gap-6 lg:items-start">

          {/* Left sidebar: Step Progress (desktop only) */}
          <aside className="hidden lg:block sticky top-[76px]">
            {showSteps ? (
              <StepProgressPanel
                phase={phase}
                selectedCoin={selectedCoin}
                selectedExitMode={selectedExitMode}
                liveCartPath={liveCartPath}
                goBackTo={goBackTo}
                isPast={isPast}
              />
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-card">
                <p className="text-xs font-semibold text-slate-500 mb-3">시작하려면</p>
                <ul className="space-y-1.5 text-xs text-slate-600">
                  <li>1. 투자 금액 입력</li>
                  <li>2. 경로 우선순위 선택</li>
                  <li>3. 경로 탐색 시작</li>
                </ul>
              </div>
            )}
          </aside>

          {/* Center: Steps */}
          <div className={`space-y-4 min-w-0 ${showSteps ? 'pb-24 lg:pb-6' : ''}`}>

            {/* Step 0: Amount + Preference */}
            <StepCard active={isActive('input')} dimmed={showSteps && !isActive('input')}>
              {allData?.latestRunAt && (
                <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-3 pb-2.5 border-b border-slate-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                  데이터 기준: {fmtTime(allData.latestRunAt)} KST
                </div>
              )}

              <p className="text-xs text-slate-500 mb-2">투자 금액</p>
              <div className="flex items-center gap-3">
                <span className="text-brand-600 text-xl font-bold flex-shrink-0">₩</span>
                <input
                  type="number"
                  value={amountInput}
                  onChange={e => setAmountInput(e.target.value)}
                  disabled={showSteps}
                  className="flex-1 min-w-0 bg-transparent text-2xl font-bold outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-bnb-text"
                  placeholder="100"
                  min="1"
                />
                <div className="flex gap-1 flex-shrink-0">
                  {(['만원', '억원'] as const).map(u => (
                    <button
                      key={u}
                      onClick={() => setAmountUnit(u)}
                      disabled={showSteps}
                      className={`text-xs px-2 py-1 rounded transition-all ${amountUnit === u ? 'bg-brand-500 text-stone-900 font-bold' : 'text-slate-500 hover:text-bnb-text'}`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-1">= ₩{(amountKrw || 0).toLocaleString('ko-KR')}</p>

              {/* Preference selector */}
              <div className="mt-4">
                <p className="text-xs text-slate-500 mb-2">경로 우선순위</p>
                <div className="grid grid-cols-3 gap-2">
                  {PREF_OPTIONS.map(({ id, Icon, label, sub }) => (
                    <button
                      key={id}
                      onClick={() => { if (!showSteps) setPreference(id); }}
                      disabled={showSteps}
                      className={`p-2.5 rounded-lg border text-left transition-all ${
                        preference === id
                          ? 'border-brand-400 bg-brand-50'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <Icon className={`w-4 h-4 transition-colors ${preference === id ? 'text-brand-600' : 'text-slate-400'}`} />
                      <div className={`text-xs font-semibold mt-1.5 ${preference === id ? 'text-brand-700' : 'text-bnb-text'}`}>{label}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              {phase === 'input' && (
                <motion.button
                  onClick={handleSearch}
                  disabled={!amountKrw || amountKrw < 10_000}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                  className={`mt-4 w-full py-3 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:opacity-30 text-stone-900 font-bold text-sm transition-colors ${amountKrw && amountKrw >= 10_000 ? 'btn-glow-active' : ''}`}
                >
                  경로 탐색 시작
                </motion.button>
              )}
            </StepCard>

            {error && <p className="text-red-600 text-sm text-center">{error}</p>}

            {/* Loading */}
            {phase === 'loading' && <NetworkScanLoader />}

            {/* Step 1: 국내 거래소 */}
            {showSteps && (
              <StepCard dimmed={!isActive('domestic') && !isPast('domestic')} active={isActive('domestic')} animate>
                <div className="flex items-center justify-between">
                  <StepHeader
                    icon={<MapPin className="w-3.5 h-3.5" />}
                    label="1. 출발 거래소 (국내)"
                    done={isPast('domestic') || isActive('coin') || isPast('coin')}
                  />
                  {isActive('domestic') && (
                    <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                      {liveKimp && (
                        <span className="text-[10px] text-slate-400">
                          {liveKimp.cached ? '캐시' : '실시간'} · {fmtTime(liveKimp.fetched_at)}
                        </span>
                      )}
                      <button
                        onClick={() => fetchLiveKimp(true)}
                        disabled={kimpLoading}
                        className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-brand-600 disabled:opacity-40 transition-colors"
                      >
                        <ArrowsClockwise className={`w-3 h-3 ${kimpLoading ? 'animate-spin' : ''}`} />
                        새로고침
                      </button>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
                  {domesticOptions.map(({ exchange, bestBtc }) => {
                    const takerFee = domesticTakerFees[exchange];
                    const kimchi = liveKimp
                      ? (liveKimp.kimp[exchange] ?? null)
                      : (snapshotKimp[exchange] ?? null);
                    const vol = exchangeVolumes[exchange];
                    return (
                      <ChoiceBtn
                        key={exchange}
                        selected={selectedDomestic === exchange}
                        onClick={() => handleDomesticSelect(exchange)}
                      >
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <ExchangeIcon id={exchange} size={16} />
                          <span className="font-semibold text-sm">{fmtEx(exchange)}</span>
                          {exchange === recDomestic && (
                            <span className="text-[10px] font-bold bg-brand-500 text-stone-900 px-1.5 py-0.5 rounded flex-shrink-0">추천</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 font-data mt-0.5">{formatSats(bestBtc)}</div>
                        {takerFee != null && (
                          <div className="text-xs text-slate-400 mt-0.5">수수료 {takerFee.toFixed(2)}%</div>
                        )}
                        {vol?.volume_24h_usd != null && (
                          <div className="text-[10px] text-slate-400 mt-0.5">24H {fmtVol(vol.volume_24h_usd)}</div>
                        )}
                        {kimchi != null && (
                          <div className={`text-xs mt-0.5 font-semibold ${kimchi > 2 ? 'text-red-600' : kimchi > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                            {kimchi >= 0 ? `+${kimchi.toFixed(1)}%` : `${kimchi.toFixed(1)}%`} 김프
                          </div>
                        )}
                      </ChoiceBtn>
                    );
                  })}
                </div>
              </StepCard>
            )}

            {/* Step 2: 출금 코인 (3가지 경로) */}
            {showSteps && (isPast('domestic') || isActive('coin') || isPast('coin')) && (
              <StepCard dimmed={!isActive('coin') && !isPast('coin')} active={isActive('coin')} animate>
                <StepHeader
                  icon={<Coin className="w-3.5 h-3.5" />}
                  label="2. 출금 경로 선택"
                  done={isPast('coin')}
                />
                {selectedDomestic && (
                  <StepContext nodes={[{ id: selectedDomestic, label: fmtEx(selectedDomestic), role: '국내 거래소', roleColor: 'amber' }]} />
                )}
                <div className="space-y-2 mt-3">
                  {coinOptions.map(({ coin, best }) => {
                    const domNode = selectedDomestic ? getKoreanNode(selectedDomestic) : null;
                    const perTxLimit = domNode?.perTxKrwLimit ?? null;
                    const numTxs = (coin === 'BTC' && best.num_withdrawal_txs != null)
                      ? best.num_withdrawal_txs
                      : (coin === 'BTC' && perTxLimit && perTxLimit > 0)
                        ? Math.ceil(amountKrw / perTxLimit)
                        : 1;
                    return (
                      <ChoiceBtn
                        key={coin}
                        selected={selectedCoin === coin}
                        onClick={() => handleCoinSelect(coin)}
                        horizontal
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {coin === 'USDT' && (
                              <><CurrencyDollar className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" weight="bold" />
                              <span className="font-semibold text-sm">USDT 경유</span></>
                            )}
                            {coin === 'BTC' && (
                              <><Coin className="w-3.5 h-3.5 text-brand-600 flex-shrink-0" weight="fill" />
                              <span className="font-semibold text-sm">BTC 직접 출금</span></>
                            )}
                            {coin === 'BTC_VIA' && (
                              <><Coin className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" weight="fill" />
                              <span className="font-semibold text-sm">BTC → 해외거래소 경유</span></>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {coin === 'USDT' && 'USDT 출금 → 해외 거래소 BTC 매수 → 개인 지갑'}
                            {coin === 'BTC' && '한국 거래소 BTC 출금 → 개인 지갑 (직접)'}
                            {coin === 'BTC_VIA' && 'BTC 출금 → 해외 거래소 입금 → 개인 지갑 (2단계)'}
                          </div>
                          <div className="flex gap-1.5 mt-1.5 flex-wrap">
                            {coin === 'BTC' && perTxLimit != null && (
                              <InfoTag color="red">1회 {(perTxLimit / 10000).toFixed(0)}만원 제한</InfoTag>
                            )}
                            {coin === 'BTC' && perTxLimit == null && (
                              <InfoTag color="neutral">1회 출금 제한 확인 필요</InfoTag>
                            )}
                            {coin === 'BTC' && numTxs > 1 && (
                              <InfoTag color="amber">{numTxs}회 출금 필요 (수수료 {numTxs}×)</InfoTag>
                            )}
                            {coin === 'BTC_VIA' && (
                              <InfoTag color="blue">거래소 주소 — 1회 제한 없음</InfoTag>
                            )}
                          </div>
                        </div>
                        <FeeTag path={best} align="right" />
                      </ChoiceBtn>
                    );
                  })}
                </div>
              </StepCard>
            )}

            {/* Step 3: 해외 거래소 (USDT only) */}
            {showSteps && (selectedCoin === 'USDT' || selectedCoin === 'BTC_VIA') && (isPast('coin') || isActive('global') || isPast('global')) && (
              <StepCard dimmed={!isActive('global') && !isPast('global')} active={isActive('global')} animate>
                <StepHeader
                  icon={<Globe className="w-3.5 h-3.5" />}
                  label="3. 경유 거래소 (해외)"
                  done={isPast('global')}
                />
                {selectedDomestic && (
                  <StepContext nodes={[
                    { id: selectedDomestic, label: fmtEx(selectedDomestic), role: `${selectedCoin === 'BTC_VIA' ? 'BTC' : 'USDT'} 출금`, roleColor: 'amber' },
                    { id: 'arrow', label: '→', role: '경유할 해외 거래소 선택', roleColor: 'neutral' },
                  ]} />
                )}
                {failedExchanges.length > 0 && (
                  <p className="mt-2 text-xs text-slate-500 bg-slate-50 rounded px-3 py-1.5">
                    데이터 없음: {failedExchanges.map(fmtEx).join(', ')} — 비교에서 제외됨
                  </p>
                )}
                <div className="space-y-2 mt-3">
                  {globalOptions.map(({ exchange, best, hasLightning }) => {
                    const vol = exchangeVolumes[exchange];
                    const carf = EXCHANGE_CARF[exchange];
                    return (
                      <ChoiceBtn
                        key={exchange}
                        selected={selectedGlobal === exchange}
                        onClick={() => handleGlobalSelect(exchange)}
                        horizontal
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <ExchangeIcon id={exchange} size={16} />
                            <span className="font-semibold text-sm">{fmtEx(exchange)}</span>
                            {hasLightning && <Lightning className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" weight="fill" />}
                            {exchange === recGlobal && (
                              <span className="text-[10px] font-bold bg-brand-500 text-stone-900 px-1.5 py-0.5 rounded flex-shrink-0">추천</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {carf && <span className="text-xs text-slate-500">{carf.country}</span>}
                            {vol?.volume_24h_usd != null && (
                              <span className="text-[10px] text-slate-400">
                                24H {fmtVol(vol.volume_24h_usd)}
                              </span>
                            )}
                            {vol?.trust_rank != null && (
                              <span className="text-[10px] text-slate-400">#{vol.trust_rank}</span>
                            )}
                          </div>
                          <div className="flex gap-1.5 mt-1.5 flex-wrap">
                            {carf && <InfoTag color="blue">CARF {carf.carfYear}</InfoTag>}
                            {carf?.fatca && <InfoTag color="red">FATCA</InfoTag>}
                            <RiskTag risk={carf?.risk ?? 'med'} />
                          </div>
                        </div>
                        <FeeTag path={best} align="right" />
                      </ChoiceBtn>
                    );
                  })}
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
                {selectedDomestic && (
                  <StepContext nodes={[
                    { id: selectedDomestic, label: fmtEx(selectedDomestic), role: '국내 거래소', roleColor: 'amber' },
                    { id: 'coin', label: selectedCoin === 'BTC_VIA' ? 'BTC' : (selectedCoin ?? ''), role: '출금 네트워크 선택', roleColor: 'neutral' },
                    ...(selectedGlobal ? [{ id: selectedGlobal, label: fmtEx(selectedGlobal), role: '수신', roleColor: 'blue' as const }] : []),
                  ]} />
                )}
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
                            <span className="text-[10px] font-bold bg-brand-500 text-stone-900 px-1.5 py-0.5 rounded flex-shrink-0">추천</span>
                          )}
                        </div>
                        {best.breakdown?.components.find(c => c.label.includes('출금')) && (
                          <div className="text-xs text-slate-500 mt-0.5">
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
                {selectedGlobal && (
                  <StepContext nodes={[{ id: selectedGlobal, label: fmtEx(selectedGlobal), role: '해외 거래소 · USDT → BTC 매수', roleColor: 'blue' }]} />
                )}
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
                            <span className="text-[10px] font-bold bg-brand-500 text-stone-900 px-1.5 py-0.5 rounded flex-shrink-0">추천</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">{sublabel}</div>
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
                {(() => {
                  const srcEx = selectedCoin === 'BTC' ? selectedDomestic : selectedGlobal;
                  const srcRole = selectedCoin === 'BTC' ? '국내 거래소' : '해외 거래소';
                  const srcColor: 'amber' | 'blue' = selectedCoin === 'BTC' ? 'amber' : 'blue';
                  return srcEx ? (
                    <StepContext nodes={[
                      { id: srcEx, label: fmtEx(srcEx), role: `${srcRole} · BTC 출금 방식 선택`, roleColor: srcColor },
                      { id: 'wallet', label: '→ 개인 지갑', role: '온체인 또는 Lightning', roleColor: 'green' },
                    ]} />
                  ) : null;
                })()}
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
                          {id === 'lightning' && <Lightning className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" weight="fill" />}
                          <span>{label}</span>
                          {id === recExitMode && (
                            <span className="text-[10px] font-bold bg-brand-500 text-stone-900 px-1.5 py-0.5 rounded flex-shrink-0">추천</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">{sublabel}</div>
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
                <StepContext nodes={[
                  { id: 'lightning', label: 'Lightning Network', role: '출금 채널', roleColor: 'green' },
                  { id: 'swap', label: '→ 온체인 스왑', role: '스왑 서비스 선택', roleColor: 'neutral' },
                  { id: 'wallet', label: '→ 개인 지갑', role: '최종 수신', roleColor: 'neutral' },
                ]} />
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
                              <span className="text-[10px] font-bold bg-brand-500 text-stone-900 px-1.5 py-0.5 rounded flex-shrink-0">추천</span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
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

                {/* 다중 트랜잭션 경고 */}
                {(matchedPath.num_withdrawal_txs ?? 1) > 1 && (
                  <div className="mt-3 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs">
                    <div className="flex items-start gap-2">
                      <span className="text-amber-700 font-bold flex-shrink-0 mt-0.5">!</span>
                      <div>
                        <span className="font-semibold text-amber-700">
                          {matchedPath.num_withdrawal_txs}회 분할 출금 필요
                        </span>
                        <span className="text-amber-600 ml-1">
                          — {fmtEx(matchedPath.korean_exchange)} 1회 출금 한도
                          {matchedPath.krw_per_tx_limit != null
                            ? ` ₩${(matchedPath.krw_per_tx_limit / 10000).toFixed(0)}만원`
                            : ''} 초과
                        </span>
                        <div className="text-amber-600 mt-0.5">
                          아래 출금 수수료는 {matchedPath.num_withdrawal_txs}회분 합산 금액입니다.
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-4">
                  {/* Start node */}
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col items-center flex-shrink-0 w-5">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 mt-0.5" />
                      <div className="w-px flex-1 bg-slate-200 min-h-[1.75rem]" />
                    </div>
                    <div className="pb-3 flex-1 flex justify-between items-baseline">
                      <span className="text-xs text-slate-500">투자 금액</span>
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
                            <div className="w-2.5 h-2.5 rounded-full border-2 border-red-400 bg-white mt-0.5" />
                            <div className={`w-px flex-1 min-h-[3.5rem] ${isLast ? 'bg-transparent' : 'bg-slate-200'}`} />
                          </div>
                          <div className="pb-4 flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-sm font-medium leading-tight">{c.label}</span>
                                  {(() => { const cat = getFeeCategory(c.label); return cat ? <InfoTag color={cat.color}>{cat.label}</InfoTag> : null; })()}
                                </div>
                                {c.amount_text && (
                                  <div className="text-xs text-slate-400 mt-0.5">{c.amount_text}</div>
                                )}
                              </div>
                              <div className="text-right flex-shrink-0">
                                <div className="text-red-600 font-data text-sm font-semibold">
                                  -{formatFeeKrw(c.amount_krw)}
                                </div>
                                <div className="text-xs text-red-400">
                                  {c.rate_pct != null
                                    ? `단계 ${c.rate_pct.toFixed(3)}%`
                                    : `${pctOfOriginal.toFixed(3)}%`}
                                </div>
                              </div>
                            </div>
                            <div className="mt-1.5 flex items-center justify-between text-xs">
                              <span className="text-slate-400">잔여</span>
                              <div className="text-right">
                                <span className="font-data text-bnb-text">
                                  ₩{Math.round(remaining).toLocaleString('ko-KR')}
                                </span>
                                <span className="text-slate-400 ml-1.5">
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
                  <div className="border-t border-slate-200 pt-3 mb-3 flex justify-between items-baseline">
                    <span className="text-xs font-semibold text-slate-500">총 수수료</span>
                    <div className="text-right">
                      <div className="text-red-600 font-data font-bold text-sm">
                        -{formatFeeKrw(matchedPath.total_fee_krw)}
                      </div>
                      <div className="text-xs text-slate-500">{formatPercent(matchedPath.fee_pct)}</div>
                    </div>
                  </div>

                  {/* Final BTC received */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 280, damping: 28, delay: 0.1 }}
                    className="bg-gradient-to-br from-brand-50 to-white border border-brand-200 rounded-xl p-5 shadow-card-md"
                  >
                    <div className="text-xs font-semibold text-brand-700 mb-2 uppercase tracking-wider">최종 수령</div>
                    <AnimatedSats
                      value={Math.round((matchedPath.btc_received ?? 0) * 100_000_000)}
                      className="text-4xl md:text-5xl font-bold font-data text-brand-700 tabular-nums block"
                    />

                    {/* Detailed route nodes */}
                    <motion.div
                      initial="hidden"
                      animate="show"
                      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.1, delayChildren: 0.5 } } }}
                      className="mt-4 space-y-0"
                    >
                      <motion.div variants={{ hidden: { opacity: 0, x: -10 }, show: { opacity: 1, x: 0 } }}>
                        <RouteNode label={fmtEx(selectedDomestic!)} tags={['KYC 필수', 'CARF 2027 (국내)']} tagColor="amber" icon={<ExchangeIcon id={selectedDomestic!} size={14} />} />
                      </motion.div>
                      <motion.div variants={{ hidden: { opacity: 0 }, show: { opacity: 1 } }}>
                        <RouteEdge label={`${selectedCoin} 출금 via ${selectedNetwork}`} />
                      </motion.div>

                      {selectedGlobal && selectedCoin === 'USDT' && (
                        <>
                          <motion.div variants={{ hidden: { opacity: 0, x: -10 }, show: { opacity: 1, x: 0 } }}>
                            <RouteNode
                              label={fmtEx(selectedGlobal)}
                              tags={[
                                EXCHANGE_CARF[selectedGlobal]?.country ?? '',
                                `CARF ${EXCHANGE_CARF[selectedGlobal]?.carfYear ?? '?'}`,
                                ...(EXCHANGE_CARF[selectedGlobal]?.fatca ? ['FATCA'] : []),
                              ].filter(Boolean)}
                              tagColor="blue"
                              icon={<ExchangeIcon id={selectedGlobal} size={14} />}
                            />
                          </motion.div>
                          <motion.div variants={{ hidden: { opacity: 0 }, show: { opacity: 1 } }}>
                            <RouteEdge label={selectedTradeMethod === 'fdusd_maker' ? 'USDT → FDUSD → BTC (Maker 0%)' : 'USDT → BTC (Taker 매수)'} />
                          </motion.div>
                        </>
                      )}

                      {selectedExitMode === 'lightning' ? (
                        <>
                          <motion.div variants={{ hidden: { opacity: 0, x: -10 }, show: { opacity: 1, x: 0 } }}>
                            <RouteNode label="Lightning 출금" tags={['LN 채널', '오프체인 라우팅']} tagColor="yellow" icon={<Lightning className="w-3.5 h-3.5 text-amber-600" weight="fill" />} />
                          </motion.div>
                          <motion.div variants={{ hidden: { opacity: 0 }, show: { opacity: 1 } }}>
                            <RouteEdge label={`LN → 온체인 스왑 (${selectedSwapService ? (SWAP_DISPLAY[selectedSwapService] ?? selectedSwapService) : ''})`} isLightning />
                          </motion.div>
                        </>
                      ) : (
                        <motion.div variants={{ hidden: { opacity: 0 }, show: { opacity: 1 } }}>
                          <RouteEdge label="온체인 출금 via Bitcoin Network" />
                        </motion.div>
                      )}

                      <motion.div variants={{ hidden: { opacity: 0, x: -10 }, show: { opacity: 1, x: 0 } }}>
                        <RouteNode label="개인 지갑" tags={['자기 수탁', '완전 통제']} tagColor="green" isEnd endValue={formatSats(matchedPath.btc_received ?? 0)} />
                      </motion.div>
                    </motion.div>
                  </motion.div>
                </div>
              </StepCard>
            )}

            {phase === 'result' && !matchedPath && (
              <p className="text-red-600 text-sm text-center py-8">선택한 경로에 해당하는 데이터가 없습니다.</p>
            )}
          </div>

          {/* Right sidebar: Info panel (desktop only) */}
          <aside className="hidden lg:block sticky top-[76px]">
            {showSteps && (
              <RightInfoPanel
                phase={phase}
                selectedDomestic={selectedDomestic}
                selectedGlobal={selectedGlobal}
                selectedNetwork={selectedNetwork}
                selectedCoin={selectedCoin}
                selectedExitMode={selectedExitMode}
                matchedPath={matchedPath}
                liveCartPath={liveCartPath}
                domesticTakerFees={domesticTakerFees}
                exchangeVolumes={exchangeVolumes}
                liveKimp={liveKimp}
                snapshotKimp={snapshotKimp}
                amountKrw={amountKrw}
              />
            )}
          </aside>

        </div>
      </div>

      {/* Cart Banner — mobile only */}
      {showSteps && (
        <div className="lg:hidden">
          <CartBanner
            amountKrw={amountKrw}
            selectedDomestic={selectedDomestic}
            selectedCoin={selectedCoin}
            selectedGlobal={selectedGlobal}
            selectedNetwork={selectedNetwork}
            selectedExitMode={selectedExitMode}
            liveCartPath={liveCartPath}
            isResult={phase === 'result'}
          />
        </div>
      )}
    </div>
  );
}

// ── Left Sidebar: Step Progress ───────────────────────────────────────────────

interface StepProgressPanelProps {
  phase: Phase;
  selectedCoin: CoinType | null;
  selectedExitMode: ExitMode | null;
  liveCartPath: CheapestPathEntry | null;
  goBackTo: (p: Phase) => void;
  isPast: (p: Phase) => boolean;
}

function StepProgressPanel({ phase, selectedCoin, selectedExitMode, liveCartPath, goBackTo, isPast }: StepProgressPanelProps) {
  const steps: { label: string; phase: Phase }[] = [
    { label: '국내 거래소', phase: 'domestic' },
    { label: '출금 경로', phase: 'coin' },
    ...(selectedCoin !== 'BTC' ? [{ label: '해외 거래소', phase: 'global' as Phase }] : []),
    { label: '네트워크', phase: 'network' },
    ...(selectedCoin === 'USDT' ? [{ label: '매수 방식', phase: 'trade_method' as Phase }] : []),
    { label: '출금 방식', phase: 'exit_mode' },
    ...(selectedExitMode === 'lightning' ? [{ label: 'LN 스왑', phase: 'swap_service' as Phase }] : []),
    { label: '결과', phase: 'result' },
  ];

  return (
    <div className="space-y-3">
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-card">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">진행 상황</p>
        <div className="space-y-1">
          {steps.map((step, i) => {
            const past = isPast(step.phase);
            const active = phase === step.phase;
            return (
              <div key={step.phase} className="flex items-center gap-2.5 py-1">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                  past   ? 'bg-brand-500 text-stone-900' :
                  active ? 'border-2 border-brand-500 bg-brand-50' :
                           'border border-slate-200 bg-slate-50'
                }`}>
                  {past ? (
                    <CheckCircle className="w-3 h-3 text-stone-900" weight="fill" />
                  ) : (
                    <span className={`text-[9px] font-bold ${active ? 'text-brand-700' : 'text-slate-400'}`}>{i + 1}</span>
                  )}
                </div>
                {past ? (
                  <button
                    onClick={() => goBackTo(step.phase)}
                    className="text-xs text-brand-600 hover:text-brand-700 font-medium transition-colors"
                  >
                    {step.label}
                  </button>
                ) : (
                  <span className={`text-xs ${active ? 'font-semibold text-bnb-text' : 'text-slate-400'}`}>
                    {step.label}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {liveCartPath && (
        <div className="bg-gradient-to-br from-brand-50 to-white border border-brand-200 rounded-xl p-4 shadow-card">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">현재 최선</p>
          <div>
            <div className="text-[10px] text-slate-400 mb-0.5">예상 수수료</div>
            <div className="text-red-600 font-data font-bold text-sm">
              -{formatFeeKrw(liveCartPath.total_fee_krw)}
              <span className="text-[10px] font-normal text-slate-400 ml-1">
                ({liveCartPath.fee_pct.toFixed(2)}%)
              </span>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-brand-100">
            <div className="text-[10px] text-slate-400 mb-0.5">예상 수령</div>
            <div className="text-brand-700 font-data font-bold text-lg">
              {formatSats(liveCartPath.btc_received ?? 0)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Right Sidebar: Info Panel ─────────────────────────────────────────────────

interface RightInfoPanelProps {
  phase: Phase;
  selectedDomestic: string | null;
  selectedGlobal: string | null;
  selectedNetwork: string | null;
  selectedCoin: CoinType | null;
  selectedExitMode: ExitMode | null;
  matchedPath: CheapestPathEntry | null;
  liveCartPath: CheapestPathEntry | null;
  domesticTakerFees: Record<string, number>;
  exchangeVolumes: Record<string, { volume_24h_usd: number | null; volume_7d_usd: number | null; volume_30d_usd: number | null; trust_rank: number | null }>;
  liveKimp: LiveKimpResponse | null;
  snapshotKimp: Record<string, number>;
  amountKrw: number;
}

function RightInfoPanel({
  phase, selectedDomestic, selectedGlobal, selectedNetwork, selectedCoin,
  matchedPath, liveCartPath, domesticTakerFees, exchangeVolumes, liveKimp, snapshotKimp, amountKrw,
}: RightInfoPanelProps) {
  const kimchi = selectedDomestic
    ? (liveKimp?.kimp[selectedDomestic] ?? snapshotKimp[selectedDomestic] ?? null)
    : null;
  const domVol = selectedDomestic ? exchangeVolumes[selectedDomestic] : null;
  const globVol = selectedGlobal ? exchangeVolumes[selectedGlobal] : null;
  const globCarf = selectedGlobal ? EXCHANGE_CARF[selectedGlobal] : null;

  return (
    <div className="space-y-3">
      {/* Phase-specific context */}
      {phase === 'domestic' && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-card">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">한국 거래소 안내</p>
          <ul className="space-y-1.5 text-xs text-slate-600">
            <li className="flex items-start gap-1.5"><span className="text-amber-600 font-bold mt-0.5">•</span>실명 KYC 인증 필수</li>
            <li className="flex items-start gap-1.5"><span className="text-amber-600 font-bold mt-0.5">•</span>CARF 2027년부터 국세청 자동 보고</li>
            <li className="flex items-start gap-1.5"><span className="text-slate-400 mt-0.5">•</span>김프(김치 프리미엄)는 낮을수록 유리</li>
          </ul>
        </div>
      )}

      {/* Selected domestic info */}
      {selectedDomestic && phase !== 'input' && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-card">
          <div className="flex items-center gap-2 mb-3">
            <ExchangeIcon id={selectedDomestic} size={16} />
            <span className="text-sm font-semibold">{fmtEx(selectedDomestic)}</span>
            <InfoTag color="amber">국내</InfoTag>
          </div>
          <div className="space-y-1.5 text-xs">
            {domesticTakerFees[selectedDomestic] != null && (
              <InfoRow label="Taker 수수료" value={`${domesticTakerFees[selectedDomestic].toFixed(3)}%`} />
            )}
            {kimchi != null && (
              <InfoRow
                label="김치 프리미엄"
                value={`${kimchi >= 0 ? '+' : ''}${kimchi.toFixed(2)}%`}
                valueClass={kimchi > 2 ? 'text-red-600 font-semibold' : kimchi > 0 ? 'text-amber-700 font-semibold' : 'text-emerald-700 font-semibold'}
              />
            )}
            {domVol?.volume_24h_usd != null && (
              <InfoRow label="24H 거래량" value={fmtVol(domVol.volume_24h_usd) ?? '-'} />
            )}
            <InfoRow label="규제" value="KYC + CARF 2027" />
          </div>
        </div>
      )}

      {/* Selected global info */}
      {selectedGlobal && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-card">
          <div className="flex items-center gap-2 mb-3">
            <ExchangeIcon id={selectedGlobal} size={16} />
            <span className="text-sm font-semibold">{fmtEx(selectedGlobal)}</span>
            <InfoTag color="blue">해외</InfoTag>
          </div>
          <div className="space-y-1.5 text-xs">
            {globCarf && <InfoRow label="본사 국가" value={globCarf.country} />}
            {globCarf && <InfoRow label="CARF 시행" value={`${globCarf.carfYear}년`} />}
            {globCarf?.fatca && <InfoRow label="FATCA" value="해당" valueClass="text-red-600 font-semibold" />}
            {globVol?.volume_24h_usd != null && (
              <InfoRow label="24H 거래량" value={fmtVol(globVol.volume_24h_usd) ?? '-'} />
            )}
            {globVol?.trust_rank != null && (
              <InfoRow label="신뢰도 순위" value={`#${globVol.trust_rank}`} />
            )}
          </div>
        </div>
      )}

      {/* Network info */}
      {selectedNetwork && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-card">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">네트워크</p>
          <div className="space-y-1.5 text-xs">
            <InfoRow label="선택" value={selectedNetwork} />
            {selectedCoin && <InfoRow label="코인" value={selectedCoin === 'BTC_VIA' ? 'BTC' : selectedCoin} />}
          </div>
        </div>
      )}

      {/* Cost estimate (when we have path data) */}
      {liveCartPath && !matchedPath && (
        <div className="bg-gradient-to-br from-brand-50 to-white border border-brand-200 rounded-xl p-4 shadow-card">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">예상 비용 (현재 기준)</p>
          <div className="space-y-2">
            <div>
              <div className="text-[10px] text-slate-400">투자 금액</div>
              <div className="font-data font-bold text-sm text-bnb-text">₩{amountKrw.toLocaleString('ko-KR')}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400">예상 수수료</div>
              <div className="text-red-600 font-data font-bold">
                -{formatFeeKrw(liveCartPath.total_fee_krw)}
                <span className="text-[10px] font-normal text-slate-400 ml-1">({liveCartPath.fee_pct.toFixed(2)}%)</span>
              </div>
            </div>
            <div className="pt-2 border-t border-brand-100">
              <div className="text-[10px] text-slate-400">예상 수령</div>
              <div className="text-brand-700 font-data font-bold text-lg">
                {formatSats(liveCartPath.btc_received ?? 0)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Final result summary */}
      {matchedPath && (
        <div className="bg-gradient-to-br from-brand-50 to-white border border-brand-200 rounded-xl p-4 shadow-card">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">최종 결과</p>
          <div className="space-y-2">
            <div>
              <div className="text-[10px] text-slate-400">총 수수료</div>
              <div className="text-red-600 font-data font-bold">
                -{formatFeeKrw(matchedPath.total_fee_krw)}
                <span className="text-[10px] font-normal text-slate-400 ml-1">({formatPercent(matchedPath.fee_pct)})</span>
              </div>
            </div>
            <div className="pt-2 border-t border-brand-100">
              <div className="text-[10px] text-slate-400">최종 수령</div>
              <div className="text-brand-700 font-data font-bold text-xl">
                {formatSats(matchedPath.btc_received ?? 0)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-slate-400">{label}</span>
      <span className={`font-medium text-bnb-text ${valueClass ?? ''}`}>{value}</span>
    </div>
  );
}

// ── Cart Banner (mobile only, FAB toggle) ────────────────────────────────────

interface CartBannerProps {
  amountKrw: number;
  selectedDomestic: string | null;
  selectedCoin: string | null;
  selectedGlobal: string | null;
  selectedNetwork: string | null;
  selectedExitMode: string | null;
  liveCartPath: CheapestPathEntry | null;
  isResult: boolean;
}

function CartBanner({
  amountKrw, selectedDomestic, selectedCoin, selectedGlobal,
  selectedNetwork, liveCartPath, isResult,
}: CartBannerProps) {
  const [open, setOpen] = useState(false);

  const nodes: Array<{ id: string; label: string; done: boolean }> = [
    { id: selectedDomestic ?? '', label: selectedDomestic ? fmtEx(selectedDomestic) : '국내 거래소', done: !!selectedDomestic },
    ...(selectedCoin === 'USDT' || selectedCoin === 'BTC_VIA' ? [
      { id: selectedGlobal ?? '', label: selectedGlobal ? fmtEx(selectedGlobal) : '해외 거래소', done: !!selectedGlobal },
    ] : []),
    { id: 'network', label: selectedNetwork ?? '네트워크', done: !!selectedNetwork },
    { id: 'wallet', label: '개인 지갑', done: isResult },
  ];

  const feePct   = liveCartPath?.fee_pct ?? null;
  const feeKrw   = liveCartPath?.total_fee_krw ?? null;
  const btcGet   = liveCartPath?.btc_received ?? null;
  const numTxs   = liveCartPath?.num_withdrawal_txs ?? null;
  const coinLabel = selectedCoin === 'USDT' ? 'USDT' : 'BTC';

  return (
    <>
      {/* FAB button — always visible */}
      <div className="fixed bottom-5 right-4 z-30">
        <motion.button
          onClick={() => setOpen(v => !v)}
          whileTap={{ scale: 0.92 }}
          className={`flex items-center gap-2 px-3.5 py-2.5 rounded-full shadow-lg font-semibold text-xs transition-colors ${
            open
              ? 'bg-slate-700 text-white'
              : 'bg-brand-500 text-stone-900'
          }`}
        >
          <Coin className="w-3.5 h-3.5" weight="fill" />
          {feeKrw != null
            ? open ? '닫기' : `-${formatFeeKrw(feeKrw)}`
            : open ? '닫기' : '경로'}
        </motion.button>
      </div>

      {/* Slide-up panel */}
      <motion.div
        initial={false}
        animate={{ y: open ? 0 : '100%' }}
        transition={{ type: 'spring', stiffness: 400, damping: 36 }}
        className="fixed bottom-0 left-0 right-0 z-20 border-t border-slate-200 bg-white/97 backdrop-blur-md shadow-[0_-4px_16px_rgba(0,0,0,0.08)]"
      >
      <div className="max-w-2xl mx-auto px-4 py-3 pb-4">
        {/* Drag handle */}
        <div className="flex justify-center mb-2">
          <div className="w-8 h-1 rounded-full bg-slate-300" />
        </div>

        {/* Route nodes row */}
        <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden mb-2.5">
          {nodes.map((n, i) => (
            <span key={i} className="flex items-center gap-1 flex-shrink-0">
              <span className={`flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                n.done
                  ? 'bg-white border-brand-300 text-bnb-text'
                  : 'bg-slate-50 border-slate-200 text-slate-400'
              }`}>
                {n.id && <ExchangeIcon id={n.id} size={11} />}
                {n.label}
              </span>
              {i < nodes.length - 1 && (
                <ArrowRight className={`w-3 h-3 flex-shrink-0 ${n.done ? 'text-brand-400' : 'text-slate-300'}`} />
              )}
            </span>
          ))}
        </div>

        {/* Cost summary */}
        <div className="flex items-end justify-between gap-3">
          <div className="flex items-baseline gap-3 flex-wrap">
            {feeKrw != null ? (
              <>
                <div>
                  <span className="text-[10px] text-slate-400">예상 수수료</span>
                  <div className="text-red-600 font-data font-bold text-base leading-tight">
                    -{formatFeeKrw(feeKrw)}
                    {feePct != null && (
                      <span className="text-xs font-normal text-slate-400 ml-1">({feePct.toFixed(2)}%)</span>
                    )}
                  </div>
                </div>
                {btcGet != null && (
                  <div>
                    <span className="text-[10px] text-slate-400">예상 수령</span>
                    <div className="text-brand-700 font-data font-bold text-base leading-tight">
                      {formatSats(btcGet)} sats
                    </div>
                  </div>
                )}
                {coinLabel && selectedNetwork && (
                  <div className="text-[10px] text-slate-400 self-end pb-0.5">
                    {coinLabel} via {selectedNetwork}
                    {numTxs != null && numTxs > 1 && (
                      <span className="ml-1.5 text-amber-700 font-semibold">{numTxs}회 출금</span>
                    )}
                  </div>
                )}
              </>
            ) : (
              <span className="text-xs text-slate-400">경로 선택 중...</span>
            )}
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-[10px] text-slate-400">투자</div>
            <div className="text-sm font-bold font-data text-bnb-text">
              ₩{amountKrw.toLocaleString('ko-KR')}
            </div>
          </div>
        </div>
      </div>
      </motion.div>
    </>
  );
}

/** 단계별 컨텍스트 표시 */
function StepContext({ nodes }: {
  nodes: Array<{ id: string; label: string; role: string; roleColor?: 'amber' | 'blue' | 'green' | 'neutral' }>;
}) {
  return (
    <div className="flex items-center gap-2 mt-2 mb-1 flex-wrap">
      {nodes.map((n, i) => (
        <span key={i} className="flex items-center gap-1.5 text-[11px] bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5">
          <ExchangeIcon id={n.id} size={12} />
          <span className="font-medium text-bnb-text">{n.label}</span>
          <span className={`text-[10px] ${
            n.roleColor === 'amber' ? 'text-amber-600' :
            n.roleColor === 'blue'  ? 'text-blue-600' :
            n.roleColor === 'green' ? 'text-emerald-600' : 'text-slate-400'
          }`}>{n.role}</span>
        </span>
      ))}
    </div>
  );
}

function ExchangeIcon({ id, size = 16 }: { id: string; size?: number }) {
  const domain = getExchangeDomain(id);
  if (!domain) return null;
  return (
    <img
      src={`https://www.google.com/s2/favicons?sz=32&domain=${domain}`}
      alt=""
      width={size}
      height={size}
      className="rounded-sm flex-shrink-0"
      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
    />
  );
}

function StepCard({
  children,
  dimmed,
  animate: entrance,
  active,
}: {
  children: React.ReactNode;
  dimmed?: boolean;
  animate?: boolean;
  active?: boolean;
}) {
  return (
    <motion.div
      initial={entrance ? { opacity: 0, y: 22 } : false}
      animate={{ opacity: dimmed ? 0.28 : 1, y: 0 }}
      transition={{
        type: 'spring',
        stiffness: 360,
        damping: 32,
        opacity: { duration: 0.22 },
      }}
      className={[
        'rounded-xl p-4 md:p-5',
        dimmed ? 'pointer-events-none' : '',
        active
          ? 'bg-white border border-brand-300/60 shadow-card-active'
          : 'bg-white border border-slate-200 shadow-card',
      ].join(' ')}
    >
      {children}
    </motion.div>
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
            ? 'bg-brand-500 text-stone-900 shadow-[0_0_8px_rgba(240,185,11,0.35)]'
            : 'bg-slate-100 text-slate-400 border border-slate-200'
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
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileHover={!disabled && !selected ? { scale: 1.012, transition: { type: 'spring', stiffness: 500, damping: 25 } } : {}}
      whileTap={!disabled ? { scale: 0.965, transition: { duration: 0.08 } } : {}}
      className={[
        horizontal ? 'w-full flex items-start justify-between gap-3' : 'text-left w-full',
        'p-3 rounded-lg border disabled:cursor-default relative overflow-hidden transition-all',
        selected
          ? 'border-brand-400 bg-brand-50 shadow-card-active'
          : 'border-slate-200 bg-white hover:border-brand-300 hover:bg-brand-50/40 shadow-card',
      ].join(' ')}
    >
      {selected && (
        <motion.span
          initial={{ opacity: 0.4 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="absolute inset-0 bg-brand-400/15 pointer-events-none rounded-lg"
        />
      )}
      {children}
    </motion.button>
  );
}

function FeeTag({ path, align }: { path: CheapestPathEntry; align?: 'right' }) {
  return (
    <div className={`flex-shrink-0 ${align === 'right' ? 'text-right' : ''}`}>
      <div className="font-bold text-sm font-data text-bnb-text">{formatSats(path.btc_received ?? 0)}</div>
      <div className="text-xs text-slate-400">수수료 {formatPercent(path.fee_pct)}</div>
    </div>
  );
}

type TagColor = 'amber' | 'blue' | 'green' | 'red' | 'neutral';
const TAG_CLS: Record<TagColor, string> = {
  amber:   'bg-amber-50 text-amber-700 border-amber-200',
  blue:    'bg-blue-50 text-blue-700 border-blue-200',
  green:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  red:     'bg-red-50 text-red-700 border-red-200',
  neutral: 'bg-slate-100 text-slate-600 border-slate-200',
};

function InfoTag({ color, children }: { color: TagColor; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded border ${TAG_CLS[color]}`}>
      {children}
    </span>
  );
}

function fmtVol(usd: number | null | undefined): string | null {
  if (!usd) return null;
  if (usd >= 1_000_000_000) return `$${(usd / 1_000_000_000).toFixed(1)}B`;
  if (usd >= 1_000_000)     return `$${(usd / 1_000_000).toFixed(0)}M`;
  return `$${(usd / 1_000).toFixed(0)}K`;
}

function getFeeCategory(label: string): { label: string; color: TagColor } | null {
  if (label.includes('스왑 수수료')) return { label: '스왑 수수료', color: 'green' };
  if (label.includes('매수 수수료') || label.includes('매도 수수료') || label.includes('KRW 전환 수수료'))
    return { label: '거래 수수료', color: 'blue' };
  if (label.includes('출금 수수료') || label.includes('출금') || label.includes('전송 수수료'))
    return { label: '출금 수수료', color: 'amber' };
  if (label.includes('스프레드')) return { label: '전환 스프레드', color: 'neutral' };
  if (label.includes('네트워크 수수료')) return { label: '네트워크 수수료', color: 'neutral' };
  return null;
}

function RiskTag({ risk }: { risk: 'low' | 'med' | 'high' }) {
  const cfg = {
    low:  { dot: 'bg-emerald-500', text: '낮음' },
    med:  { dot: 'bg-amber-500',   text: '중간' },
    high: { dot: 'bg-red-500',     text: '높음' },
  }[risk];
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border bg-slate-100 text-slate-600 border-slate-200">
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      위험도 {cfg.text}
    </span>
  );
}

type RouteTagColor = 'amber' | 'blue' | 'green' | 'yellow' | 'neutral';
const ROUTE_TAG_CLS: Record<RouteTagColor, string> = {
  amber:   'bg-amber-50 text-amber-700 border-amber-200',
  blue:    'bg-blue-50 text-blue-700 border-blue-200',
  green:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  yellow:  'bg-amber-50 text-amber-700 border-amber-200',
  neutral: 'bg-slate-100 text-slate-600 border-slate-200',
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
    <div className={`flex items-start gap-2 px-2.5 py-2 rounded-lg border ${isEnd ? 'border-brand-200 bg-brand-50' : 'border-slate-200 bg-slate-50'}`}>
      <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${isEnd ? 'bg-brand-500' : 'bg-slate-400'}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {icon}
          <span className={`text-xs font-semibold ${isEnd ? 'text-brand-700' : 'text-bnb-text'}`}>{label}</span>
          {isEnd && endValue && (
            <span className="ml-auto font-data text-xs text-brand-700 font-bold">{endValue}</span>
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
        <div className={`w-px h-3 ${isLightning ? 'bg-amber-300' : 'bg-slate-300'}`} />
        <ArrowDown className={`w-3 h-3 ${isLightning ? 'text-amber-600' : 'text-slate-400'}`} />
        <div className={`w-px h-3 ${isLightning ? 'bg-amber-300' : 'bg-slate-300'}`} />
      </div>
      <span className={`text-[10px] ${isLightning ? 'text-amber-700' : 'text-slate-500'}`}>{label}</span>
    </div>
  );
}

// ── Network Scan Loader ────────────────────────────────────────────────────────

const SCAN_NAMES: Record<string, string> = {
  binance: 'Binance', okx: 'OKX', bybit: 'Bybit',
  bitget: 'Bitget', kraken: 'Kraken', coinbase: 'Coinbase',
};

function NetworkScanLoader() {
  type NodeStatus = 'pending' | 'scanning' | 'done';
  const [statuses, setStatuses] = useState<NodeStatus[]>(Array(6).fill('pending'));

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    GLOBAL_EXCHANGES.forEach((_, i) => {
      timers.push(setTimeout(() => {
        setStatuses(prev => { const n = [...prev]; n[i] = 'scanning'; return n; });
        timers.push(setTimeout(() => {
          setStatuses(prev => { const n = [...prev]; n[i] = 'done'; return n; });
        }, 500 + Math.floor(i * 130 + 200)));
      }, i * 220 + 80));
    });
    return () => timers.forEach(clearTimeout);
  }, []);

  const doneCount = statuses.filter(s => s === 'done').length;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center gap-6 py-12"
    >
      <div className="text-center">
        <p className="text-sm font-semibold text-bnb-text">경로 탐색 중</p>
        <p className="text-xs text-slate-500 mt-0.5">{doneCount} / 6 거래소 응답</p>
      </div>

      <div className="grid grid-cols-3 gap-4 w-full max-w-[260px]">
        {GLOBAL_EXCHANGES.map((ex, i) => {
          const status = statuses[i];
          return (
            <motion.div
              key={ex}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07, type: 'spring', stiffness: 300, damping: 25 }}
              className="flex flex-col items-center gap-1.5"
            >
              <div className={`relative w-12 h-12 rounded-xl flex items-center justify-center transition-colors duration-300 ${
                status === 'done'
                  ? 'bg-emerald-50 border border-emerald-200'
                  : status === 'scanning'
                  ? 'bg-brand-50 border border-brand-300'
                  : 'bg-slate-50 border border-slate-200'
              }`}>
                {status === 'scanning' && (
                  <span className="absolute inset-0 rounded-xl border border-brand-300 animate-ping" style={{ animationDuration: '0.85s' }} />
                )}
                {status === 'done' ? (
                  <motion.span
                    initial={{ scale: 0, rotate: -20 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                    className="text-emerald-600 text-base font-bold leading-none"
                  >
                    ✓
                  </motion.span>
                ) : (
                  <span className={`text-[10px] font-bold font-data ${status === 'scanning' ? 'text-brand-600' : 'text-slate-400'}`}>
                    {SCAN_NAMES[ex].slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
              <span className={`text-[10px] font-medium transition-colors duration-300 ${
                status === 'done' ? 'text-emerald-600' :
                status === 'scanning' ? 'text-brand-600' : 'text-slate-400'
              }`}>
                {SCAN_NAMES[ex]}
              </span>
            </motion.div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-[240px] h-0.5 bg-slate-200 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-brand-500 to-brand-400 rounded-full"
          initial={{ width: '0%' }}
          animate={{ width: `${(doneCount / 6) * 100}%` }}
          transition={{ type: 'spring', stiffness: 70, damping: 18 }}
        />
      </div>
    </motion.div>
  );
}

// ── Animated Sats Counter ─────────────────────────────────────────────────────

function AnimatedSats({ value, className }: { value: number; className?: string }) {
  const [display, setDisplay] = useState('0');

  useEffect(() => {
    if (!value) return;
    const DURATION = 1500;
    const start = performance.now();
    let raf: number;
    function step(now: number) {
      const p = Math.min((now - start) / DURATION, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(value * eased).toLocaleString());
      if (p < 1) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <span className={className}>{display} sats</span>;
}
