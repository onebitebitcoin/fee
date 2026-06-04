import { useState, useMemo, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft, ArrowRight, CheckCircle, Coin, CurrencyDollar,
  Globe, Lightning, MapPin, TrendDown, EyeSlash, ArrowsClockwise,
  Warning, Wallet,
} from '@phosphor-icons/react';
import { api } from '../lib/api';
import { fmtEx, getExchangeDomain } from '../lib/exchangeNames';
import { formatFeeKrw, formatPercent, formatSats } from '../lib/formatBtc';
import type { CheapestPathEntry, CheapestPathResponse, TickerRow } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = 'input' | 'loading' | 'domestic' | 'coin' | 'global' | 'network' | 'swap_service' | 'result';
type CoinType = 'USDT' | 'BTC';
type Preference = 'cheapest' | 'non_kyc' | 'lightning';

interface AllData {
  byGlobal: Record<string, CheapestPathResponse>;
  tickers: TickerRow[];
  latestRunAt: number | null;
}

const GLOBAL_EXCHANGES = ['binance', 'okx', 'bybit', 'bitget', 'kraken', 'coinbase'] as const;
type GlobalExchange = typeof GLOBAL_EXCHANGES[number];

const PHASES: Phase[] = ['input', 'loading', 'domestic', 'coin', 'global', 'network', 'swap_service', 'result'];
const phaseIdx = (p: Phase) => PHASES.indexOf(p);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function bestByBtc(paths: CheapestPathEntry[]): CheapestPathEntry | null {
  return paths.length ? paths.reduce((a, b) => (a.btc_received ?? 0) > (b.btc_received ?? 0) ? a : b) : null;
}

function applyPref(paths: CheapestPathEntry[], pref: Preference): CheapestPathEntry[] {
  if (pref === 'lightning') {
    const f = paths.filter(p => p.global_exit_mode === 'lightning');
    return f.length ? f : paths;
  }
  if (pref === 'non_kyc') {
    const f = paths.filter(p =>
      p.domestic_kyc_status !== 'kyc' && p.global_kyc_status !== 'kyc' &&
      (p.exit_service_kyc_status == null || p.exit_service_kyc_status === 'non_kyc'),
    );
    return f.length ? f : paths;
  }
  return paths;
}

function fmtKst(ts: number | null): string {
  if (!ts) return '–';
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Seoul',
  }).format(new Date(ts * 1000));
}

// BTC amount_text → sats when value is tiny (e.g. "1e-06 BTC" → "100 sats")
function fmtAmountText(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(/^([0-9.e+\-]+)\s*BTC$/i);
  if (m) {
    const btc = parseFloat(m[1]);
    if (!isNaN(btc) && btc < 0.001) return `${Math.round(btc * 1e8)} sats`;
  }
  return text;
}

// ─── Spring transition presets ────────────────────────────────────────────────

const SPRING_FAST  = { type: 'spring', stiffness: 480, damping: 30 } as const;
const SPRING_SLOW  = { type: 'spring', stiffness: 300, damping: 28 } as const;

// ─── Sub-components ───────────────────────────────────────────────────────────

function ExFavicon({ id, size = 18 }: { id: string; size?: number }) {
  const domain = getExchangeDomain(id);
  if (!domain) return null;
  return (
    <img
      src={`https://www.google.com/s2/favicons?sz=32&domain=${domain}`}
      alt="" width={size} height={size}
      className="rounded-md flex-shrink-0"
      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
    />
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-label-tertiary mb-3">
      {children}
    </p>
  );
}

function Chip({ color, children }: { color: 'amber' | 'blue' | 'green' | 'red' | 'neutral'; children: React.ReactNode }) {
  const cls = {
    amber:   'bg-acc-amber/15 text-acc-amber',
    blue:    'bg-acc-blue/15 text-acc-blue',
    green:   'bg-acc-green/15 text-acc-green',
    red:     'bg-acc-red/15 text-acc-red',
    neutral: 'bg-fill-secondary text-label-secondary',
  }[color];
  return (
    <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${cls}`}>
      {children}
    </span>
  );
}

// macOS-style selection option card
function OptionCard({
  selected, onClick, recommended, disabled = false, children,
}: {
  selected: boolean; onClick: () => void;
  recommended?: boolean; disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileTap={!disabled ? { scale: 0.985, transition: SPRING_FAST } : {}}
      whileHover={!disabled && !selected ? { scale: 1.008, y: -1, transition: SPRING_FAST } : {}}
      className={[
        'w-full text-left p-4 rounded-2xl border transition-colors duration-150 relative overflow-hidden',
        selected
          ? 'bg-acc-amber/8 border-acc-amber/40 shadow-card-focus'
          : 'ios-card border-transparent hover:border-white/12',
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
      ].join(' ')}
    >
      {selected && (
        <>
          <motion.div
            layoutId="selection-glow"
            className="absolute inset-0 rounded-2xl bg-acc-amber/5 pointer-events-none"
          />
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute top-3 right-3"
          >
            <CheckCircle weight="fill" className="w-4 h-4 text-acc-amber" />
          </motion.div>
        </>
      )}
      {children}
    </motion.button>
  );
}

// Step progress dots
function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <motion.div
          key={i}
          animate={{
            width: i === current ? 20 : 6,
            opacity: i <= current ? 1 : 0.25,
          }}
          transition={SPRING_FAST}
          className={`h-1.5 rounded-full ${i <= current ? 'bg-acc-amber' : 'bg-fill-primary'}`}
        />
      ))}
    </div>
  );
}

// ─── Loading Screen ────────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <motion.div
      key="loading"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center justify-center min-h-[60vh] gap-8"
    >
      <motion.div
        animate={{ scale: [1, 1.06, 1], opacity: [0.6, 1, 0.6] }}
        transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
        className="w-14 h-14 rounded-full bg-acc-amber/15 flex items-center justify-center"
      >
        <Coin weight="fill" className="w-7 h-7 text-acc-amber" />
      </motion.div>

      <div className="text-center space-y-1.5">
        <p className="text-sm font-semibold text-label-primary">경로 계산 중</p>
        <p className="text-xs text-label-tertiary">거래소별 실시간 데이터 수집 중...</p>
      </div>

      <div className="w-48 h-1 bg-fill-secondary rounded-full overflow-hidden relative">
        <div className="scan-line h-full rounded-full" />
      </div>
    </motion.div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ExplorerPage() {
  const [phase, setPhase]         = useState<Phase>('input');
  const [amount, setAmount]       = useState('100');
  const [unit, setUnit]           = useState<'만원' | '억원'>('만원');
  const [pref, setPref]           = useState<Preference>('cheapest');
  const [allData, setAllData]     = useState<AllData | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [dir, setDir]             = useState<1 | -1>(1);

  const [domestic, setDomestic]   = useState<string | null>(null);
  const [coin, setCoin]           = useState<CoinType | null>(null);
  const [global, setGlobal]       = useState<GlobalExchange | null>(null);
  const [network, setNetwork]     = useState<string | null>(null);
  const [swapSvc, setSwapSvc]     = useState<string | null>(null);
  const [liveKimp, setLiveKimp]   = useState<Record<string, number> | null>(null);

  const prevPhase = useRef<Phase>('input');

  const amountKrw = parseFloat(amount || '0') * (unit === '만원' ? 10_000 : 100_000_000);

  useEffect(() => {
    const cur = phaseIdx(phase);
    const prev = phaseIdx(prevPhase.current);
    setDir(cur >= prev ? 1 : -1);
    prevPhase.current = phase;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [phase]);

  // ── Derived options ──────────────────────────────────────────────────────────

  const allPaths = useMemo(() => {
    if (!allData) return [] as (CheapestPathEntry & { _g: string })[];
    return Object.entries(allData.byGlobal).flatMap(([g, d]) =>
      d.all_paths.map(p => ({ ...p, _g: g })),
    );
  }, [allData]);

  const snapshotKimp = useMemo(() => {
    if (!allData) return {} as Record<string, number>;
    const ref = allData.byGlobal['binance'] ?? Object.values(allData.byGlobal)[0];
    if (!ref) return {} as Record<string, number>;
    const gkrw = ref.global_btc_price_usd * ref.usd_krw_rate;
    const result: Record<string, number> = {};
    for (const t of allData.tickers) {
      if (t.currency === 'KRW' && t.pair?.includes('BTC') && t.price && gkrw)
        result[t.exchange] = ((t.price - gkrw) / gkrw) * 100;
    }
    return result;
  }, [allData]);

  // 한국 거래소 24h 거래량 맵 — KRW 단위 (BTC 거래량 × BTC/KRW 기준가)
  const koreaVolumeMap = useMemo(() => {
    const ref = allData?.byGlobal['binance'] ?? Object.values(allData?.byGlobal ?? {})[0];
    const btcKrw = ref ? ref.global_btc_price_usd * ref.usd_krw_rate : 0;
    const m: Record<string, number> = {};
    for (const t of (allData?.tickers ?? [])) {
      if (t.currency === 'KRW' && t.pair?.includes('BTC') && t.volume_24h_btc && btcKrw) {
        m[t.exchange] = t.volume_24h_btc * btcKrw;  // KRW
      }
    }
    return m;
  }, [allData]);

  const domesticOptions = useMemo(() => {
    const map = new Map<string, number>();
    for (const data of Object.values(allData?.byGlobal ?? {}))
      for (const p of data.all_paths) {
        const cur = map.get(p.korean_exchange) ?? 0;
        if ((p.btc_received ?? 0) > cur) map.set(p.korean_exchange, p.btc_received ?? 0);
      }
    return [...map.entries()]
      .map(([exchange, best]) => ({ exchange, best }))
      .sort((a, b) => (koreaVolumeMap[b.exchange] ?? 0) - (koreaVolumeMap[a.exchange] ?? 0));
  }, [allData, koreaVolumeMap]);

  const recDomestic = useMemo(() => {
    const b = bestByBtc(applyPref(allPaths, pref));
    return b?.korean_exchange ?? null;
  }, [allPaths, pref]);

  const coinOptions = useMemo(() => {
    if (!allData || !domestic) return [] as { coin: CoinType; best: CheapestPathEntry }[];
    const anyData = Object.values(allData.byGlobal)[0];
    const paths = (anyData?.all_paths ?? []).filter(p => p.korean_exchange === domestic);
    const opts: { coin: CoinType; best: CheapestPathEntry }[] = [];
    const u = bestByBtc(paths.filter(p => p.transfer_coin === 'USDT'));
    const b = bestByBtc(paths.filter(p => p.transfer_coin === 'BTC'));
    if (u) opts.push({ coin: 'USDT', best: u });
    if (b) opts.push({ coin: 'BTC',  best: b });
    return opts;
  }, [allData, domestic]);

  const globalOptions = useMemo(() => {
    if (!allData || !domestic || coin !== 'USDT') return [];
    return GLOBAL_EXCHANGES
      .map(g => {
        const paths = (allData.byGlobal[g]?.all_paths ?? []).filter(p =>
          p.korean_exchange === domestic && p.transfer_coin === 'USDT',
        );
        const best = bestByBtc(paths);
        if (!best) return null;
        return { exchange: g, best };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => (b.best.btc_received ?? 0) - (a.best.btc_received ?? 0));
  }, [allData, domestic, coin]);

  const networkOptions = useMemo(() => {
    if (!allData || !domestic || !coin) return [] as { network: string; best: CheapestPathEntry }[];
    let paths: CheapestPathEntry[];
    if (coin === 'BTC') {
      paths = (Object.values(allData.byGlobal)[0]?.all_paths ?? [])
        .filter(p => p.korean_exchange === domestic && p.transfer_coin === 'BTC');
    } else {
      if (!global) return [];
      paths = (allData.byGlobal[global]?.all_paths ?? [])
        .filter(p => p.korean_exchange === domestic && p.transfer_coin === 'USDT');
    }
    const map = new Map<string, CheapestPathEntry>();
    for (const p of paths) {
      const cur = map.get(p.network);
      if (!cur || (p.btc_received ?? 0) > (cur.btc_received ?? 0)) map.set(p.network, p);
    }
    return [...map.entries()].map(([n, best]) => ({ network: n, best }));
  }, [allData, domestic, coin, global]);

  // Available lightning swap services for current selection (network step → swap_service step)
  const swapServiceOptions = useMemo(() => {
    if (!allData || !domestic || !network) return [] as { name: string; fee_pct: number; kyc: boolean; btc_received: number }[];
    const basePaths = coin === 'BTC'
      ? (Object.values(allData.byGlobal)[0]?.all_paths ?? []).filter(p =>
          p.korean_exchange === domestic && p.transfer_coin === 'BTC' && p.network === network)
      : global
        ? (allData.byGlobal[global]?.all_paths ?? []).filter(p =>
            p.korean_exchange === domestic && p.transfer_coin === 'USDT' && p.network === network)
        : [];
    const lnPaths = basePaths.filter(p => p.path_type === 'lightning_exit' && p.lightning_exit_provider);
    const svcMap = new Map<string, { name: string; fee_pct: number; kyc: boolean; btc_received: number }>();
    for (const p of lnPaths) {
      const name = p.lightning_exit_provider!;
      const existing = svcMap.get(name);
      if (!existing || (p.btc_received ?? 0) > existing.btc_received) {
        const swapComp = p.breakdown?.components.find(c => c.label.toLowerCase().includes('스왑'));
        const fee_pct = swapComp?.rate_pct ?? 0;
        svcMap.set(name, {
          name,
          fee_pct,
          kyc: p.exit_service_kyc_status === 'kyc',
          btc_received: p.btc_received ?? 0,
        });
      }
    }
    return [...svcMap.values()].sort((a, b) => b.btc_received - a.btc_received);
  }, [allData, domestic, coin, global, network]);

  const resultPath = useMemo((): CheapestPathEntry | null => {
    if (!allData || !domestic || !coin || !network) return null;
    const basePaths = coin === 'BTC'
      ? (Object.values(allData.byGlobal)[0]?.all_paths ?? []).filter(p =>
          p.korean_exchange === domestic && p.transfer_coin === 'BTC' && p.network === network)
      : global
        ? (allData.byGlobal[global]?.all_paths ?? []).filter(p =>
            p.korean_exchange === domestic && p.transfer_coin === 'USDT' && p.network === network)
        : [];
    if (swapSvc) {
      const filtered = basePaths.filter(p => p.lightning_exit_provider === swapSvc);
      return bestByBtc(filtered) ?? bestByBtc(basePaths);
    }
    return bestByBtc(applyPref(basePaths, pref));
  }, [allData, domestic, coin, global, network, swapSvc, pref]);

  // ── Step sequence for progress dots ─────────────────────────────────────────

  const steps = useMemo(() => {
    const s: Phase[] = ['domestic', 'coin'];
    if (coin === 'USDT') s.push('global');
    s.push('network');
    if (swapServiceOptions.length > 0) s.push('swap_service');
    s.push('result');
    return s;
  }, [coin, swapServiceOptions]);

  const stepIdx = steps.indexOf(phase);

  // ── API ──────────────────────────────────────────────────────────────────────

  async function handleSearch() {
    if (!amountKrw || amountKrw < 10_000) return;
    setPhase('loading');
    setAllData(null); setError(null); setLiveKimp(null);
    setDomestic(null); setCoin(null); setGlobal(null); setNetwork(null); setSwapSvc(null);
    try {
      const [tickerRes, kimpRes, ...pathResults] = await Promise.all([
        api.getTickers().catch(() => ({ last_run: null, items: [] as TickerRow[] })),
        api.getLiveKimp().catch(() => null),
        ...GLOBAL_EXCHANGES.map(g =>
          api.getCheapestPath({ mode: 'buy', amountKrw, globalExchange: g }).catch(() => null),
        ),
      ]);
      if (kimpRes?.kimp) setLiveKimp(kimpRes.kimp);
      const byGlobal: Record<string, CheapestPathResponse> = {};
      GLOBAL_EXCHANGES.forEach((g, i) => {
        const r = pathResults[i];
        if (r && !r.error) byGlobal[g] = r;
      });
      if (!Object.keys(byGlobal).length) throw new Error('모든 거래소 조회 실패');
      setAllData({
        byGlobal,
        tickers: tickerRes.items,
        latestRunAt: Object.values(byGlobal)[0]?.last_run?.completed_at ?? null,
      });
      setPhase('domestic');
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류 발생');
      setPhase('input');
    }
  }

  function handleBack() {
    const map: Partial<Record<Phase, Phase>> = {
      coin: 'domestic', global: 'coin', network: coin === 'BTC' ? 'coin' : 'global',
      swap_service: 'network',
      result: swapSvc ? 'swap_service' : 'network',
    };
    const prev = map[phase];
    if (prev) { setPhase(prev); }
  }

  function reset() {
    setPhase('input'); setAllData(null); setError(null);
    setDomestic(null); setCoin(null); setGlobal(null); setNetwork(null); setSwapSvc(null);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const variants = {
    enter:  { opacity: 0, x: dir * 24, scale: 0.98 },
    center: { opacity: 1, x: 0,        scale: 1 },
    exit:   { opacity: 0, x: dir * -24, scale: 0.98 },
  };

  return (
    <div className="min-h-[100dvh] bg-sys-bg flex flex-col">

      {/* Header */}
      <header className="glass-header sticky top-0 z-20">
        <div className="max-w-xl mx-auto px-5 h-12 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {phase !== 'input' && phase !== 'loading' && (
              <motion.button
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={SPRING_FAST}
                onClick={handleBack}
                className="w-7 h-7 rounded-full bg-fill-secondary flex items-center justify-center text-label-secondary hover:text-label-primary hover:bg-fill-primary transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" weight="bold" />
              </motion.button>
            )}
            <span className="text-sm font-semibold text-label-primary tracking-tight">
              BTC 경로 탐색
            </span>
          </div>

          <div className="flex items-center gap-3">
            {stepIdx >= 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <StepDots current={stepIdx} total={steps.length} />
              </motion.div>
            )}
            {allData && (
              <button
                onClick={reset}
                className="text-label-tertiary hover:text-label-secondary transition-colors"
                title="처음으로"
              >
                <ArrowsClockwise className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main */}
      <div className="flex-1 max-w-xl mx-auto w-full px-4 py-6">
        <AnimatePresence mode="wait" custom={dir}>
          {phase === 'loading' && (
            <motion.div key="loading" variants={variants} initial="enter" animate="center" exit="exit"
              transition={SPRING_SLOW}>
              <LoadingScreen />
            </motion.div>
          )}

          {phase === 'input' && (
            <motion.div key="input" variants={variants} initial="enter" animate="center" exit="exit"
              transition={SPRING_SLOW} className="space-y-6 pt-4">

              {/* Hero amount input */}
              <div className="ios-card rounded-3xl p-6">
                <p className="text-xs font-semibold text-label-tertiary uppercase tracking-wider mb-5">
                  투자 금액
                </p>

                {/* Unit toggle — macOS segmented control */}
                <div className="seg-ctrl inline-flex mb-6">
                  {(['만원', '억원'] as const).map(u => (
                    <motion.button
                      key={u}
                      onClick={() => setUnit(u)}
                      className={`relative px-4 py-1.5 text-xs font-semibold rounded-[8px] transition-colors ${
                        unit === u ? 'text-label-primary' : 'text-label-secondary'
                      }`}
                    >
                      {unit === u && (
                        <motion.div
                          layoutId="seg-active"
                          className="absolute inset-0 bg-fill-primary rounded-[8px]"
                          transition={SPRING_FAST}
                        />
                      )}
                      <span className="relative z-10">{u}</span>
                    </motion.button>
                  ))}
                </div>

                <div className="flex items-baseline gap-2">
                  <span className="text-acc-amber text-3xl font-semibold">₩</span>
                  <input
                    type="number"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    className="flex-1 min-w-0 bg-transparent text-5xl font-bold text-label-primary outline-none
                      [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
                      tracking-tight"
                    placeholder="100"
                    min="1"
                  />
                </div>
                <p className="text-sm text-label-tertiary mt-2 num">
                  = ₩{(amountKrw || 0).toLocaleString('ko-KR')}
                </p>
              </div>

              {/* Preference */}
              <div>
                <SectionLabel>우선순위</SectionLabel>
                <div className="grid grid-cols-3 gap-2.5">
                  {([
                    { id: 'cheapest' as Preference,  Icon: TrendDown,  label: '최저 수수료', sub: 'KYC 무관' },
                    { id: 'non_kyc'  as Preference,  Icon: EyeSlash,   label: 'Non-KYC',   sub: '익명 우선' },
                    { id: 'lightning' as Preference, Icon: Lightning,  label: 'Lightning', sub: 'LN 출금' },
                  ]).map(({ id, Icon, label, sub }) => (
                    <motion.button
                      key={id}
                      onClick={() => setPref(id)}
                      whileTap={{ scale: 0.95, transition: SPRING_FAST }}
                      className={[
                        'p-3.5 rounded-2xl border text-left transition-all duration-200',
                        pref === id
                          ? 'bg-acc-amber/10 border-acc-amber/35'
                          : 'ios-card border-transparent',
                      ].join(' ')}
                    >
                      <Icon
                        weight={pref === id ? 'fill' : 'regular'}
                        className={`w-5 h-5 ${pref === id ? 'text-acc-amber' : 'text-label-secondary'}`}
                      />
                      <p className={`text-xs font-semibold mt-2 ${pref === id ? 'text-acc-amber' : 'text-label-primary'}`}>
                        {label}
                      </p>
                      <p className="text-[10px] text-label-tertiary mt-0.5">{sub}</p>
                    </motion.button>
                  ))}
                </div>
              </div>

              {error && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="flex items-center gap-2 p-3 rounded-xl bg-acc-red/10 text-acc-red text-sm">
                  <Warning className="w-4 h-4 flex-shrink-0" />
                  {error}
                </motion.div>
              )}

              {/* CTA */}
              <motion.button
                onClick={handleSearch}
                disabled={!amountKrw || amountKrw < 10_000}
                whileHover={amountKrw >= 10_000 ? { scale: 1.015, y: -1 } : {}}
                whileTap={amountKrw >= 10_000 ? { scale: 0.975 } : {}}
                transition={SPRING_FAST}
                className={[
                  'w-full py-4 rounded-2xl font-bold text-base transition-all',
                  amountKrw >= 10_000
                    ? 'bg-acc-amber text-white shadow-glow-amber btn-pulse cursor-pointer'
                    : 'bg-fill-secondary text-label-disabled cursor-not-allowed',
                ].join(' ')}
              >
                경로 탐색
              </motion.button>

              {allData?.latestRunAt && (
                <p className="text-center text-[11px] text-label-tertiary">
                  데이터 기준: {fmtKst(allData.latestRunAt)} KST
                </p>
              )}
            </motion.div>
          )}

          {/* ── Domestic ── */}
          {phase === 'domestic' && (
            <motion.div key="domestic" variants={variants} initial="enter" animate="center" exit="exit"
              transition={SPRING_SLOW} className="space-y-4 pt-2">
              <div>
                <h1 className="text-2xl font-bold text-label-primary tracking-tight">국내 거래소</h1>
                <p className="text-sm text-label-secondary mt-1">출발 거래소를 선택해요</p>
              </div>
              <div className="space-y-2.5">
                {domesticOptions.map(({ exchange, best }, i) => {
                  const kimp = (liveKimp ?? snapshotKimp)[exchange] ?? null;
                  return (
                    <motion.div
                      key={exchange}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ ...SPRING_SLOW, delay: i * 0.04 }}
                    >
                      <OptionCard
                        selected={domestic === exchange}
                        onClick={() => { setDomestic(exchange); setCoin(null); setGlobal(null); setNetwork(null); }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <ExFavicon id={exchange} size={22} />
                            <div>
                              <p className="text-sm font-semibold text-label-primary">{fmtEx(exchange)}</p>
                              {kimp != null && (
                                <p className={`text-xs num ${kimp > 2 ? 'text-acc-red' : kimp > 0 ? 'text-acc-amber' : 'text-acc-green'}`}>
                                  {kimp >= 0 ? '+' : ''}{kimp.toFixed(2)}% 김프
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            {koreaVolumeMap[exchange] != null
                              ? <p className="text-[11px] text-label-tertiary num">
                                  24H BTC {(koreaVolumeMap[exchange]! / 1_0000_0000).toFixed(1)}억원
                                </p>
                              : <p className="text-[11px] text-label-tertiary">예상 수령</p>
                            }
                          </div>
                        </div>
                      </OptionCard>
                    </motion.div>
                  );
                })}
              </div>
              {domestic && (
                <motion.button
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={SPRING_FAST}
                  onClick={() => setPhase('coin')}
                  className="w-full py-3.5 rounded-2xl font-bold text-sm bg-acc-amber text-white shadow-glow-amber cursor-pointer flex items-center justify-center gap-2"
                >
                  다음 <ArrowRight className="w-4 h-4" />
                </motion.button>
              )}
            </motion.div>
          )}

          {/* ── Coin ── */}
          {phase === 'coin' && (
            <motion.div key="coin" variants={variants} initial="enter" animate="center" exit="exit"
              transition={SPRING_SLOW} className="space-y-4 pt-2">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <ExFavicon id={domestic!} size={16} />
                  <p className="text-xs text-label-secondary">{fmtEx(domestic!)}</p>
                </div>
                <h1 className="text-2xl font-bold text-label-primary tracking-tight">출금 방식</h1>
                <p className="text-sm text-label-secondary mt-1">어떤 코인으로 이동할까요?</p>
              </div>
              <div className="space-y-2.5">
                {coinOptions.map(({ coin: c, best }, i) => (
                  <motion.div key={c}
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ ...SPRING_SLOW, delay: i * 0.06 }}>
                    <OptionCard
                      selected={coin === c}
                      onClick={() => { setCoin(c); setGlobal(null); setNetwork(null); }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {c === 'USDT'
                            ? <CurrencyDollar weight="fill" className="w-8 h-8 text-acc-green" />
                            : <Coin weight="fill" className="w-8 h-8 text-acc-amber" />}
                          <div>
                            <p className="text-sm font-bold text-label-primary">
                              {c === 'USDT' ? 'USDT 경유' : 'BTC 직접'}
                            </p>
                            <p className="text-xs text-label-secondary mt-0.5">
                              {c === 'USDT'
                                ? 'USDT 출금 → 해외 BTC 매수 → 지갑'
                                : '한국 거래소 BTC → 개인 지갑'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </OptionCard>
                  </motion.div>
                ))}
              </div>
              {coin && (
                <motion.button
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={SPRING_FAST}
                  onClick={() => setPhase(coin === 'BTC' ? 'network' : 'global')}
                  className="w-full py-3.5 rounded-2xl font-bold text-sm bg-acc-amber text-white shadow-glow-amber cursor-pointer flex items-center justify-center gap-2"
                >
                  다음 <ArrowRight className="w-4 h-4" />
                </motion.button>
              )}
            </motion.div>
          )}

          {/* ── Global ── */}
          {phase === 'global' && (
            <motion.div key="global" variants={variants} initial="enter" animate="center" exit="exit"
              transition={SPRING_SLOW} className="space-y-4 pt-2">
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <ExFavicon id={domestic!} size={14} />
                  <ArrowRight className="w-3 h-3 text-label-tertiary" />
                  <Globe className="w-4 h-4 text-label-secondary" />
                </div>
                <h1 className="text-2xl font-bold text-label-primary tracking-tight">해외 거래소</h1>
                <p className="text-sm text-label-secondary mt-1">USDT를 받을 거래소를 고르세요</p>
              </div>
              <div className="space-y-2.5">
                {globalOptions.map(({ exchange, best }, i) => {
                  const tradingComp = best.breakdown?.components.find(c =>
                    c.label.includes('BTC 매수') || c.label.includes('FDUSD 매수'),
                  );
                  const wdComp = best.breakdown?.components.find(c =>
                    c.label.includes('BTC 출금') && c.is_fixed,
                  );
                  return (
                    <motion.div key={exchange}
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ ...SPRING_SLOW, delay: i * 0.04 }}>
                      <OptionCard
                        selected={global === exchange}
                        onClick={() => { setGlobal(exchange as GlobalExchange); setNetwork(null); }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <ExFavicon id={exchange} size={22} />
                            <div>
                              <p className="text-sm font-semibold text-label-primary">{fmtEx(exchange)}</p>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                {tradingComp?.rate_pct != null && (
                                  <span className="text-[10px] text-label-tertiary num">
                                    거래 <span className="text-acc-amber font-medium">{tradingComp.rate_pct.toFixed(2)}% 변동</span>
                                  </span>
                                )}
                                {wdComp && fmtAmountText(wdComp.amount_text) && (
                                  <span className="text-[10px] text-label-tertiary num">
                                    출금 <span className="text-acc-blue font-medium">{fmtAmountText(wdComp.amount_text)} 고정</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[11px] text-label-tertiary">{formatPercent(best.fee_pct)}</p>
                          </div>
                        </div>
                      </OptionCard>
                    </motion.div>
                  );
                })}
              </div>
              {global && (
                <motion.button
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={SPRING_FAST}
                  onClick={() => setPhase('network')}
                  className="w-full py-3.5 rounded-2xl font-bold text-sm bg-acc-amber text-white shadow-glow-amber cursor-pointer flex items-center justify-center gap-2"
                >
                  다음 <ArrowRight className="w-4 h-4" />
                </motion.button>
              )}
            </motion.div>
          )}

          {/* ── Network ── */}
          {phase === 'network' && (
            <motion.div key="network" variants={variants} initial="enter" animate="center" exit="exit"
              transition={SPRING_SLOW} className="space-y-4 pt-2">
              <div>
                <h1 className="text-2xl font-bold text-label-primary tracking-tight">네트워크</h1>
                <p className="text-sm text-label-secondary mt-1">출금 네트워크를 선택해요</p>
              </div>
              <div className="space-y-2.5">
                {networkOptions.map(({ network: n, best }, i) => (
                  <motion.div key={n}
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ ...SPRING_SLOW, delay: i * 0.06 }}>
                    <OptionCard
                      selected={network === n}
                      onClick={() => { setNetwork(n); setSwapSvc(null); }}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold text-label-primary">{n}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] text-label-tertiary">{formatPercent(best.fee_pct)}</p>
                        </div>
                      </div>
                    </OptionCard>
                  </motion.div>
                ))}
              </div>
              {network && (
                <motion.button
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={SPRING_FAST}
                  onClick={() => {
                    const lnPaths = (coin === 'BTC'
                      ? Object.values(allData?.byGlobal ?? {})[0]?.all_paths ?? []
                      : allData?.byGlobal[global!]?.all_paths ?? []
                    ).filter(p =>
                      p.korean_exchange === domestic &&
                      p.network === network &&
                      p.path_type === 'lightning_exit',
                    );
                    setPhase(lnPaths.length > 0 ? 'swap_service' : 'result');
                  }}
                  className="w-full py-3.5 rounded-2xl font-bold text-sm bg-acc-amber text-white shadow-glow-amber cursor-pointer flex items-center justify-center gap-2"
                >
                  다음 <ArrowRight className="w-4 h-4" />
                </motion.button>
              )}
            </motion.div>
          )}

          {/* ── Swap Service ── */}
          {phase === 'swap_service' && (
            <motion.div key="swap_service" variants={variants} initial="enter" animate="center" exit="exit"
              transition={SPRING_SLOW} className="space-y-4 pt-2">
              <div>
                <h1 className="text-2xl font-bold text-label-primary tracking-tight">스왑 서비스</h1>
                <p className="text-sm text-label-secondary mt-1">Lightning → 온체인 변환 서비스를 선택해요</p>
              </div>
              <div className="space-y-2.5">
                {swapServiceOptions.map(({ name, fee_pct, kyc, btc_received }, i) => (
                  <motion.div key={name}
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ ...SPRING_SLOW, delay: i * 0.06 }}>
                    <OptionCard
                      selected={swapSvc === name}
                      onClick={() => { setSwapSvc(name); }}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <Lightning weight="fill" className="w-4 h-4 text-acc-amber" />
                            <p className="text-sm font-bold text-label-primary">{name}</p>
                          </div>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-[10px] text-acc-amber font-semibold">{fee_pct.toFixed(2)}% 변동</span>
                            {kyc
                              ? <span className="text-[10px] bg-acc-amber/10 text-acc-amber px-1.5 py-0.5 rounded-full">KYC</span>
                              : <span className="text-[10px] bg-acc-green/10 text-acc-green px-1.5 py-0.5 rounded-full">Non-KYC</span>
                            }
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] text-label-tertiary">{formatPercent(fee_pct)}</p>
                        </div>
                      </div>
                    </OptionCard>
                  </motion.div>
                ))}
              </div>
              {swapSvc && (
                <motion.button
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={SPRING_FAST}
                  onClick={() => setPhase('result')}
                  className="w-full py-3.5 rounded-2xl font-bold text-sm bg-acc-amber text-white shadow-glow-amber cursor-pointer flex items-center justify-center gap-2"
                >
                  결과 보기 <ArrowRight className="w-4 h-4" />
                </motion.button>
              )}
            </motion.div>
          )}

          {/* ── Result ── */}
          {phase === 'result' && resultPath && (
            <motion.div key="result" variants={variants} initial="enter" animate="center" exit="exit"
              transition={SPRING_SLOW} className="space-y-5 pt-2">

              {/* Hero result card */}
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ ...SPRING_SLOW, delay: 0.1 }}
                className="rounded-3xl p-6 text-center relative overflow-hidden"
                style={{ background: 'linear-gradient(145deg, rgba(232,133,90,0.10) 0%, rgba(240,160,60,0.06) 50%, rgba(255,255,255,0) 100%)', border: '0.5px solid rgba(200,120,60,0.18)' }}
              >
                <motion.div
                  animate={{ opacity: [0.3, 0.7, 0.3] }}
                  transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                  className="absolute -top-8 left-1/2 -translate-x-1/2 w-32 h-32 rounded-full bg-acc-amber/10 blur-2xl pointer-events-none"
                />
                <Wallet weight="fill" className="w-8 h-8 text-acc-amber mx-auto mb-4 relative z-10" />
                <p className="text-xs text-label-secondary uppercase tracking-wider mb-2 relative z-10">예상 수령</p>
                <p className="text-5xl font-bold text-label-primary num leading-none relative z-10">
                  {formatSats(resultPath.btc_received ?? 0)}
                </p>
                <p className="text-sm text-label-secondary mt-1 num relative z-10">sats</p>

                <div className="sep mt-5 mb-4 relative z-10" />

                <div className="flex justify-center gap-6 relative z-10">
                  <div>
                    <p className="text-[11px] text-label-tertiary">총 수수료</p>
                    <p className="text-lg font-bold text-acc-red num mt-0.5">
                      -{formatFeeKrw(resultPath.total_fee_krw)}
                    </p>
                    <p className="text-[11px] text-label-tertiary num">{formatPercent(resultPath.fee_pct)}</p>
                  </div>
                  <div className="w-px bg-sys-separator" />
                  <div>
                    <p className="text-[11px] text-label-tertiary">투자금</p>
                    <p className="text-lg font-bold text-label-primary num mt-0.5">
                      ₩{amountKrw.toLocaleString('ko-KR')}
                    </p>
                  </div>
                </div>
              </motion.div>

              {/* Route breakdown */}
              <div>
                <SectionLabel>경로 상세</SectionLabel>
                <div className="ios-card rounded-2xl divide-y divide-[rgba(180,110,50,0.08)]">
                  {([
                    { label: '출발', value: fmtEx(resultPath.korean_exchange), icon: <ExFavicon id={resultPath.korean_exchange} size={16} /> },
                    { label: '코인', value: resultPath.transfer_coin },
                    ...(global ? [{ label: '경유', value: fmtEx(global), icon: <ExFavicon id={global} size={16} /> }] : []),
                    { label: '네트워크', value: resultPath.network },
                    { label: '출금 방식', value: resultPath.global_exit_mode === 'lightning' ? '⚡ Lightning' : '온체인' },
                  ]).map(({ label, value, icon }) => (
                    <div key={label} className="flex items-center justify-between px-4 py-3">
                      <p className="text-xs text-label-tertiary">{label}</p>
                      <div className="flex items-center gap-1.5">
                        {icon}
                        <p className="text-sm font-medium text-label-primary">{value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Kimchi premium impact */}
              {(() => {
                const kimchi = domestic ? ((liveKimp ?? snapshotKimp)[domestic] ?? null) : null;
                if (kimchi == null) return null;
                const kimpKrw = Math.round(amountKrw * (kimchi / 100) / (1 + kimchi / 100));
                const isPositive = kimchi > 0;
                return (
                  <div>
                    <SectionLabel>김치 프리미엄 영향</SectionLabel>
                    <div className="ios-card rounded-2xl px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-xs text-label-secondary">
                          {isPositive ? '프리미엄으로 인한 추가 비용' : '역프리미엄으로 인한 절감'}
                        </p>
                        <p className="text-[10px] text-label-tertiary mt-0.5">
                          {fmtEx(domestic!)} 기준 실시간 김치 프리미엄
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-bold num ${isPositive ? 'text-acc-red' : 'text-acc-green'}`}>
                          {isPositive ? '-' : '+'}{formatFeeKrw(Math.abs(kimpKrw))}
                        </p>
                        <p className={`text-[10px] font-semibold num mt-0.5 ${isPositive ? 'text-acc-red' : 'text-acc-green'}`}>
                          {isPositive ? '+' : ''}{kimchi.toFixed(2)}%
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Fee breakdown */}
              {resultPath.breakdown?.components && resultPath.breakdown.components.length > 0 && (
                <div>
                  <SectionLabel>수수료 내역</SectionLabel>
                  <div className="ios-card rounded-2xl divide-y divide-[rgba(180,110,50,0.08)]">
                    {resultPath.breakdown.components.map((c, i) => (
                      <div key={i} className="flex items-start justify-between px-4 py-3 gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-xs text-label-secondary leading-snug">{c.label}</p>
                            {c.is_fixed != null && (
                              <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
                                c.is_fixed
                                  ? 'bg-acc-blue/10 text-acc-blue'
                                  : 'bg-acc-amber/10 text-acc-amber'
                              }`}>
                                {c.is_fixed ? '고정' : '변동'}
                              </span>
                            )}
                          </div>
                          {fmtAmountText(c.amount_text) && (
                            <p className="text-[10px] text-label-tertiary num mt-0.5">{fmtAmountText(c.amount_text)}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-semibold text-acc-red num">
                            -{formatFeeKrw(c.amount_krw)}
                          </p>
                          {c.rate_pct != null && (
                            <p className="text-[10px] text-label-tertiary num mt-0.5">{c.rate_pct.toFixed(4)}%</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tags */}
              <div className="flex flex-wrap gap-1.5">
                {resultPath.domestic_kyc_status === 'kyc' && <Chip color="amber">국내 KYC 필요</Chip>}
                {resultPath.global_kyc_status === 'kyc'   && <Chip color="amber">해외 KYC 필요</Chip>}
                {resultPath.global_kyc_status === 'non_kyc' && <Chip color="green">해외 Non-KYC</Chip>}
                {resultPath.global_exit_mode === 'lightning' && <Chip color="blue">Lightning 출금</Chip>}
              </div>

              {/* Retry */}
              <button
                onClick={reset}
                className="w-full py-3.5 rounded-2xl bg-fill-secondary text-label-secondary text-sm font-semibold hover:bg-fill-primary transition-colors"
              >
                다시 탐색
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
