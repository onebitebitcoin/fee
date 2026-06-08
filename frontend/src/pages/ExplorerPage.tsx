import { useState, useMemo, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowSquareOut, CaretDown, CheckCircle, Coin, CurrencyDollar,
  Globe, House, Info, Lightning, MapPin, ShieldCheck, TrendDown,
  Warning, Wallet,
} from '@phosphor-icons/react';
import { api } from '../lib/api';
import { NetworkIcon } from '../components/NetworkIcon';
import { fmtEx, getExchangeDomain, getLightningServiceInfo } from '../lib/exchangeNames';
import { formatFeeKrw, formatNumber, formatPercent, formatSats, SATS_PER_BTC } from '../lib/formatBtc';
import { getDomesticGates, getGlobalGates, ONCHAIN_GATES } from '../lib/gatemanRegistry';
import type { GateItem, LiveRegistry } from '../lib/gatemanRegistry';
import type { CheapestPathEntry, CheapestPathResponse, TickerRow } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = 'input' | 'loading' | 'domestic' | 'domestic_gate' | 'coin' | 'btc_method' | 'global' | 'global_gate' | 'global_exit_method' | 'network' | 'swap_service' | 'result';
type CoinType = 'USDT' | 'BTC' | 'BTC_GLOBAL';

interface AllData {
  byGlobal: Record<string, CheapestPathResponse>;
  tickers: TickerRow[];
  latestRunAt: number | null;
}

const GLOBAL_EXCHANGES = ['binance', 'okx', 'bybit', 'bitget', 'kraken', 'coinbase'] as const;
type GlobalExchange = typeof GLOBAL_EXCHANGES[number];

const PHASES: Phase[] = ['input', 'loading', 'domestic', 'global', 'coin', 'btc_method', 'domestic_gate', 'global_gate', 'network', 'global_exit_method', 'swap_service', 'result'];

// ── Flow Graph ─────────────────────────────────────────────────────────────────
// 각 단계(phase)의 다음/이전 이동을 선언적으로 정의.
// 순서나 경로를 바꾸려면 여기 FLOW 배열만 수정하면 된다.

type FlowState = {
  coin: CoinType | null;
  globalExitMethod: 'onchain' | 'lightning' | null;
  swapSvc: string | null;
};

const FLOW: ReadonlyArray<{ id: Phase; next: (s: FlowState) => Phase }> = [
  { id: 'domestic',           next: ()  => 'global' },
  { id: 'global',             next: ()  => 'coin' },
  { id: 'coin',               next: (s) => s.coin === 'USDT' ? 'domestic_gate' : 'btc_method' },
  { id: 'btc_method',         next: ()  => 'domestic_gate' },
  { id: 'domestic_gate',      next: (s) => s.coin === 'BTC' ? 'result' : 'global_gate' },
  { id: 'global_gate',        next: (s) => s.coin === 'BTC_GLOBAL' ? 'global_exit_method' : 'network' },
  { id: 'network',            next: ()  => 'global_exit_method' },
  { id: 'global_exit_method', next: (s) => s.globalExitMethod === 'lightning' ? 'swap_service' : 'result' },
  { id: 'swap_service',       next: ()  => 'result' },
  { id: 'result',             next: ()  => 'result' },
];

function flowNext(id: Phase, s: FlowState): Phase {
  return FLOW.find(f => f.id === id)?.next(s) ?? 'result';
}

function flowPrev(id: Phase, s: FlowState): Phase | null {
  for (const step of FLOW) {
    if (step.id !== id && step.next(s) === id) return step.id;
  }
  return null;
}

function flowSteps(s: FlowState): Phase[] {
  const seq: Phase[] = [];
  let cur: Phase = 'domestic';
  while (cur !== 'result') {
    seq.push(cur);
    cur = flowNext(cur, s);
  }
  seq.push('result');
  return seq;
}

// ─── Exchange Info ─────────────────────────────────────────────────────────────

interface DomesticInfo {
  bank: string;
  carf: number;
  country: string;
  url: string;
  lightning: boolean;
  // 온체인 출금 한도 (공개 정책 기준, 변경 가능)
  krw_per_tx_limit: number | null;  // 1회 KRW 환산 한도 (null=제한없음)
  btc_per_tx_max: number | null;    // 1회 최대 BTC (null=제한없음)
  btc_daily_verified: number;       // KYC 인증 완료 시 일일 BTC 한도
  personal_wallet_req: string;      // 개인 지갑 등록 요건 요약
  source_note: string;              // 정책 신뢰도/경고
}

const DOMESTIC_INFO: Record<string, DomesticInfo> = {
  upbit: {
    bank: '케이뱅크', carf: 2027, country: '대한민국', url: 'https://upbit.com', lightning: false,
    krw_per_tx_limit: 1_000_000, btc_per_tx_max: null, btc_daily_verified: 100,
    personal_wallet_req: '업비트 앱 → 출금관리 → 외부지갑 등록 (화이트리스트)',
    source_note: '업비트 고객센터 공개 정보 기준 (레벨별 상이)',
  },
  bithumb: {
    bank: 'NH농협은행', carf: 2027, country: '대한민국', url: 'https://bithumb.com', lightning: false,
    krw_per_tx_limit: 1_000_000, btc_per_tx_max: 16, btc_daily_verified: 16,
    personal_wallet_req: '빗썸 앱 → 출금 → 개인지갑 사전 등록',
    source_note: '빗썸 공식 영문 고객지원 기준 (en.bithumb.com) — 1일 16 BTC 한도',
  },
  coinone: {
    bank: '신한은행', carf: 2027, country: '대한민국', url: 'https://coinone.co.kr', lightning: false,
    krw_per_tx_limit: 1_000_000, btc_per_tx_max: null, btc_daily_verified: 50,
    personal_wallet_req: '코인원 앱 → 자산 → 출금 → 주소록 등록',
    source_note: '코인원 공개 정보 기준 (추정, 실제 확인 권장)',
  },
  korbit: {
    bank: '우리은행', carf: 2027, country: '대한민국', url: 'https://korbit.co.kr', lightning: false,
    krw_per_tx_limit: null, btc_per_tx_max: 5, btc_daily_verified: 10,
    personal_wallet_req: '코빗 앱 → 출금 → 지갑 추가 (KYC 완료 필요)',
    source_note: '코빗: 1회 KRW 제한 없음으로 추정 (확인 권장)',
  },
  gopax: {
    bank: '전북은행', carf: 2027, country: '대한민국', url: 'https://gopax.co.kr', lightning: false,
    krw_per_tx_limit: 1_000_000, btc_per_tx_max: 2, btc_daily_verified: 5,
    personal_wallet_req: '고팍스 고객센터 확인 필요 (정책 불분명)',
    source_note: '⚠️ 추정치 — 고파이 사태 이후 정책 변동 가능, 반드시 확인',
  },
};

interface GlobalInfo {
  country: string;
  carf: number;
  risk: 'low' | 'med' | 'high';
  fatca: boolean;
  url: string;
  lightning: boolean;
  vol24hB: number;  // 24H 거래량 (단위: 억 USD, 정적 참고값)
}

const GLOBAL_INFO: Record<string, GlobalInfo> = {
  binance:  { country: 'UAE',    carf: 2028, risk: 'med',  fatca: false, url: 'https://binance.com',  lightning: true,  vol24hB: 200 },
  okx:      { country: '세이셸', carf: 2028, risk: 'low',  fatca: false, url: 'https://okx.com',      lightning: true,  vol24hB: 40  },
  bybit:    { country: 'UAE',    carf: 2028, risk: 'med',  fatca: false, url: 'https://bybit.com',    lightning: false, vol24hB: 30  },
  bitget:   { country: '세이셸', carf: 2028, risk: 'low',  fatca: false, url: 'https://bitget.com',   lightning: false, vol24hB: 10  },
  kraken:   { country: '미국',   carf: 2028, risk: 'med',  fatca: true,  url: 'https://kraken.com',   lightning: false, vol24hB: 5   },
  coinbase: { country: '미국',   carf: 2028, risk: 'high', fatca: true,  url: 'https://coinbase.com', lightning: false, vol24hB: 15  },
};

const RISK_LABEL: Record<string, string> = { low: '낮음', med: '중간', high: '높음' };
const RISK_COLOR: Record<string, string> = {
  low:  'text-acc-green bg-acc-green/10',
  med:  'text-acc-amber bg-acc-amber/10',
  high: 'text-acc-red bg-acc-red/10',
};
const phaseIdx = (p: Phase) => PHASES.indexOf(p);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function bestByBtc(paths: CheapestPathEntry[]): CheapestPathEntry | null {
  return paths.length ? paths.reduce((a, b) => (a.btc_received ?? 0) > (b.btc_received ?? 0) ? a : b) : null;
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
  const [allData, setAllData]     = useState<AllData | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [dir, setDir]             = useState<1 | -1>(1);

  const [domestic, setDomestic]   = useState<string | null>(null);
  const [coin, setCoin]           = useState<CoinType | null>(null);
  const [global, setGlobal]       = useState<GlobalExchange | null>(null);
  const [network, setNetwork]     = useState<string | null>(null);
  const [swapSvc, setSwapSvc]     = useState<string | null>(null);
  const [liveKimp, setLiveKimp]       = useState<Record<string, number> | null>(null);
  const [kimpFetchedAt, setKimpFetchedAt] = useState<number | null>(null);
  const [kimpInfoOpen, setKimpInfoOpen] = useState(false);
  const [btcPrice, setBtcPrice] = useState<{ usd: number; krw: number; fetchedAt: Date } | null>(null);
  const [btcMethod, setBtcMethod]         = useState<'onchain' | 'lightning' | null>(null);
  const [globalExitMethod, setGlobalExitMethod] = useState<'onchain' | 'lightning' | null>(null);
  const [liveRegistry, setLiveRegistry] = useState<LiveRegistry | null>(null);
  const [displaySats, setDisplaySats]   = useState(0);
  const [showAltPaths, setShowAltPaths] = useState(false);
  const [withdrawalLimits, setWithdrawalLimits] = useState<Record<string, {
    krw_per_tx_limit: number | null;
    btc_per_tx_max: number | null;
    btc_daily_verified: number | null;
    krw_daily_verified_digital: number | null;
    source: string;
    scraped_at: number | null;
  }>>({});

  const prevPhase  = useRef<Phase>('input');
  const satRafRef  = useRef<number | null>(null);
  const stepEndRef = useRef<HTMLDivElement>(null);

  function scrollToStepEnd() {
    requestAnimationFrame(() =>
      stepEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    );
  }

  const amountKrw = parseFloat(amount || '0') * (unit === '만원' ? 10_000 : 100_000_000);

  useEffect(() => {
    api.getGatemanRegistry().then(res => {
      setLiveRegistry(res.data as unknown as LiveRegistry);
    }).catch(() => { /* use static defaults */ });
  }, []);

  useEffect(() => {
    api.getWithdrawalLimits().then(res => {
      setWithdrawalLimits(res.limits);
    }).catch(() => { /* keep static DOMESTIC_INFO fallback */ });
  }, []);

  // BTC 시세 30초 폴링 — phase 무관하게 항상 실행
  useEffect(() => {
    const fetch = () =>
      api.getLiveKimp()
        .then(res => setBtcPrice({
          usd: Math.round(res.global_btc_price_krw / res.usd_krw_rate),
          krw: Math.round(res.global_btc_price_krw),
          fetchedAt: new Date(),
        }))
        .catch(() => { /* keep previous */ });
    fetch();
    const id = setInterval(fetch, 30_000);
    return () => clearInterval(id);
  }, []);

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

  // liveKimp 가져오기 실패 시의 fallback. 티커 스냅샷의 usd_krw_rate(포렉스 환율) 기준으로 계산한다.
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

  const domesticBtcKrw = useMemo(() => {
    if (!allData || !domestic) return null;
    return allData.tickers.find(t =>
      t.exchange === domestic && t.currency === 'KRW' && t.pair?.includes('BTC')
    )?.price ?? null;
  }, [allData, domestic]);

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
    const b = bestByBtc(allPaths);
    return b?.korean_exchange ?? null;
  }, [allPaths]);

  const coinOptions = useMemo(() => {
    if (!allData || !domestic) return [] as { coin: CoinType; best: CheapestPathEntry }[];
    const anyData = Object.values(allData.byGlobal)[0];
    const paths = (anyData?.all_paths ?? []).filter(p => p.korean_exchange === domestic);
    const opts: { coin: CoinType; best: CheapestPathEntry }[] = [];
    const u  = bestByBtc(paths.filter(p => p.transfer_coin === 'USDT'));
    const b  = bestByBtc(paths.filter(p => p.transfer_coin === 'BTC' && p.route_variant !== 'btc_via_global'));
    const bg = bestByBtc(paths.filter(p => p.route_variant === 'btc_via_global'));
    if (u)  opts.push({ coin: 'USDT',       best: u });
    if (bg) opts.push({ coin: 'BTC_GLOBAL',  best: bg });
    if (b)  opts.push({ coin: 'BTC',         best: b });
    return opts;
  }, [allData, domestic]);

  const globalOptions = useMemo(() => {
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
      if (!cur || (p.btc_received ?? 0) > (cur.btc_received ?? 0)) map.set(p.network, p);
    }
    return [...map.entries()].map(([n, best]) => ({ network: n, best }));
  }, [allData, domestic, coin, global]);

  // Lightning exit paths available for current global exchange selection (before network is chosen)
  const hasLightningPaths = useMemo(() => {
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
  }, [allData, domestic, global, coin, network]);

  // 글로벌 거래소가 실제로 라이트닝 출금 경로를 제공하는지 (정적 메타데이터 대신 실제 경로 기반)
  // okx처럼 라이트닝을 지원하지만 수수료 스냅샷이 비어 경로가 없으면 false → 표시와 게이팅 일치
  const globalSupportsLightning = (g: string | null): boolean =>
    !!g && (allData?.byGlobal[g]?.all_paths ?? []).some(p => p.path_type === 'lightning_exit');

  // Available lightning swap services for current selection (network step → swap_service step)
  const swapServiceOptions = useMemo(() => {
    const isBtcGlobalLightning = coin === 'BTC_GLOBAL' && globalExitMethod === 'lightning';
    if (!allData || !domestic || (!isBtcGlobalLightning && !network)) return [] as { name: string; fee_pct: number; kyc: boolean; btc_received: number; source_url: string | null }[];
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
    const lnPaths = basePaths.filter(p => p.path_type === 'lightning_exit' && p.lightning_exit_provider);
    const svcMap = new Map<string, { name: string; fee_pct: number; kyc: boolean; btc_received: number; source_url: string | null }>();
    for (const p of lnPaths) {
      const name = p.lightning_exit_provider!;
      const existing = svcMap.get(name);
      if (!existing || (p.btc_received ?? 0) > existing.btc_received) {
        if (name === '__direct__') {
          svcMap.set(name, {
            name,
            fee_pct: 0,
            kyc: false,
            btc_received: p.btc_received ?? 0,
            source_url: null,
          });
        } else {
          const swapComp = p.breakdown?.components.find(c => c.label.toLowerCase().includes('스왑'));
          const fee_pct = swapComp?.rate_pct ?? 0;
          svcMap.set(name, {
            name,
            fee_pct,
            kyc: p.exit_service_kyc_status === 'kyc',
            btc_received: p.btc_received ?? 0,
            source_url: swapComp?.source_url ?? null,
          });
        }
      }
    }
    // __direct__ 먼저, 나머지는 btc_received 내림차순
    const sorted = [...svcMap.values()].sort((a, b) => b.btc_received - a.btc_received);
    const directIdx = sorted.findIndex(s => s.name === '__direct__');
    if (directIdx > 0) {
      const [direct] = sorted.splice(directIdx, 1);
      sorted.unshift(direct);
    }
    return sorted;
  }, [allData, domestic, coin, global, network, globalExitMethod]);

  const resultPath = useMemo((): CheapestPathEntry | null => {
    const isBtcGlobalLightning = coin === 'BTC_GLOBAL' && globalExitMethod === 'lightning';
    if (!allData || !domestic || !coin || (!isBtcGlobalLightning && !network)) return null;
    let basePaths = coin === 'BTC'
      ? (Object.values(allData.byGlobal)[0]?.all_paths ?? []).filter(p =>
          p.korean_exchange === domestic && p.transfer_coin === 'BTC' && p.route_variant !== 'btc_via_global' && p.network === network)
      : coin === 'BTC_GLOBAL'
        ? global
          ? (allData.byGlobal[global]?.all_paths ?? []).filter(p =>
              p.korean_exchange === domestic && p.route_variant === 'btc_via_global' &&
              (isBtcGlobalLightning || p.network === network))
          : []
        : global
          ? (allData.byGlobal[global]?.all_paths ?? []).filter(p =>
              p.korean_exchange === domestic && p.transfer_coin === 'USDT' && p.network === network)
          : [];
    if (globalExitMethod === 'onchain') {
      basePaths = basePaths.filter(p => p.path_type !== 'lightning_exit');
    } else if (globalExitMethod === 'lightning') {
      basePaths = basePaths.filter(p => p.path_type === 'lightning_exit');
    }
    if (swapSvc) {
      const filtered = basePaths.filter(p => p.lightning_exit_provider === swapSvc);
      if (filtered.length > 0) return bestByBtc(filtered);
    }
    return bestByBtc(basePaths);
  }, [allData, domestic, coin, global, network, swapSvc, globalExitMethod]);

  const altPaths = useMemo(() => {
    if (!resultPath?.btc_received || !allPaths.length) return [];
    // btc_received 내림차순 정렬 후 국내 거래소 기준 최고 1개만 표시
    const sorted = [...allPaths]
      .filter(p => (p.btc_received ?? 0) > (resultPath.btc_received ?? 0))
      .sort((a, b) => (b.btc_received ?? 0) - (a.btc_received ?? 0));
    const seen = new Set<string>();
    const result: typeof sorted = [];
    for (const p of sorted) {
      const key = p.korean_exchange ?? '';
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result.push(p);
      if (result.length >= 8) break;
    }
    return result;
  }, [allPaths, resultPath]);

  useEffect(() => {
    if (phase !== 'result') return;
    if (satRafRef.current != null) cancelAnimationFrame(satRafRef.current);
    if (!resultPath?.btc_received) { setDisplaySats(0); return; }
    const target = Math.round(resultPath.btc_received * SATS_PER_BTC);
    setDisplaySats(0);
    const duration = 1500;
    const startTime = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - (1 - t) ** 4;
      setDisplaySats(Math.round(target * eased));
      if (t < 1) satRafRef.current = requestAnimationFrame(tick);
    };
    satRafRef.current = requestAnimationFrame(tick);
    return () => { if (satRafRef.current != null) cancelAnimationFrame(satRafRef.current); };
  }, [phase, resultPath?.btc_received]);

  // ── Step sequence for progress dots ─────────────────────────────────────────

  const steps = useMemo(
    () => flowSteps({ coin, globalExitMethod, swapSvc }),
    [coin, globalExitMethod, swapSvc],
  );

  const stepIdx = steps.indexOf(phase);

  // ── API ──────────────────────────────────────────────────────────────────────

  async function handleSearch() {
    if (!amountKrw || amountKrw < 10_000) return;
    setPhase('loading');
    setAllData(null); setError(null); setLiveKimp(null); setKimpFetchedAt(null);
    setDomestic(null); setCoin(null); setGlobal(null); setNetwork(null); setSwapSvc(null); setGlobalExitMethod(null);
    try {
      const [tickerRes, kimpRes, ...pathResults] = await Promise.all([
        api.getTickers().catch(() => ({ last_run: null, items: [] as TickerRow[] })),
        api.getLiveKimp().catch(() => null),
        ...GLOBAL_EXCHANGES.map(g =>
          api.getCheapestPath({ mode: 'buy', amountKrw, globalExchange: g }).catch(() => null),
        ),
      ]);
      if (kimpRes?.kimp) { setLiveKimp(kimpRes.kimp); setKimpFetchedAt(kimpRes.fetched_at ?? null); }
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
    const s: FlowState = { coin, globalExitMethod, swapSvc };
    const prev = flowPrev(phase, s);
    if (prev) setPhase(prev);
  }

  function handleNext(from: Phase) {
    const s: FlowState = { coin, globalExitMethod, swapSvc };
    // side effects before transition
    if (from === 'domestic_gate' && coin === 'BTC') {
      setNetwork(networkOptions[0]?.network ?? 'Bitcoin');
    }
    if (from === 'global_exit_method' && coin === 'BTC_GLOBAL' && globalExitMethod === 'onchain') {
      setNetwork(networkOptions[0]?.network ?? 'Bitcoin');
    }
    setPhase(flowNext(from, s));
  }

  function reset() {
    setPhase('input'); setAllData(null); setError(null);
    setDomestic(null); setCoin(null); setGlobal(null); setNetwork(null); setSwapSvc(null);
    setBtcMethod(null); setGlobalExitMethod(null); setShowAltPaths(false);
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
            <span className="text-sm font-semibold text-label-primary tracking-tight">
              비트코인 경로 탐색
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
                <House className="w-3.5 h-3.5" />
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
                  구매 금액
                </p>

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
                  {/* Unit toggle */}
                  <div className="seg-ctrl inline-flex flex-shrink-0">
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
                </div>
                <p className="text-sm text-label-tertiary mt-2 num">
                  = ₩{(amountKrw || 0).toLocaleString('ko-KR')}
                </p>
                {btcPrice && (
                  <p className="text-[11px] text-label-tertiary/60 mt-1.5 num">
                    BTC ${btcPrice.usd.toLocaleString('en-US', { maximumFractionDigits: 0 })} · ₩{btcPrice.krw.toLocaleString('ko-KR')}
                    {' '}
                    <span className="opacity-60">
                      {btcPrice.fetchedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Seoul' })}
                    </span>
                  </p>
                )}
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
                <div className="flex items-center justify-between mt-1">
                  <p className="text-sm text-label-secondary">출발 거래소를 선택해요</p>
                  <button
                    onClick={() => setKimpInfoOpen(o => !o)}
                    className="text-label-tertiary hover:text-label-secondary transition-colors"
                    aria-label="김프 계산 방식 설명"
                  >
                    <Info size={15} weight={kimpInfoOpen ? 'fill' : 'regular'} />
                  </button>
                </div>
                {kimpFetchedAt != null && (
                  <p className="text-[11px] text-label-tertiary num mt-0.5">
                    김프 {new Date(kimpFetchedAt * 1000).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Seoul' })} 기준
                  </p>
                )}
                {/* 김프 설명 패널 */}
                {kimpInfoOpen && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="mt-2 rounded-xl bg-fill-secondary p-3 space-y-2 overflow-hidden"
                  >
                    <p className="text-[11px] font-semibold text-label-secondary uppercase tracking-wide">김치 프리미엄 계산 방식</p>
                    <div className="rounded-lg p-2.5 space-y-1 bg-fill-tertiary">
                      <p className="text-[11px] font-semibold text-label-primary">원달러(포렉스) 기준</p>
                      <p className="text-[10px] font-mono text-label-secondary">국내BTC ÷ (바이낸스BTC × USD/KRW) − 1</p>
                    </div>
                    <p className="text-[10px] text-label-tertiary leading-relaxed">
                      Yahoo Finance 실시간 환율(USD/KRW)을 기준으로 계산해요. kimpga 등 주요 김프 사이트와 같은 방식이에요.
                      국내 거래소의 USDT 시세를 기준으로 삼으면 거래소마다 다른 USDT 수급 차이(역테더 프리미엄)가 섞여 들어가서
                      "글로벌 시세 대비 국내 시세 괴리"라는 김프 본래의 의미가 흐려져요. 은행 간 실거래 환율을 기준으로 삼아야
                      더 정확하고 일관된 비교가 가능하기 때문에 원달러 기준을 표준으로 채택했어요.
                    </p>
                  </motion.div>
                )}
              </div>
              <div className="space-y-2.5">
                {domesticOptions.map(({ exchange, best }, i) => {
                  const kimp = (liveKimp ?? snapshotKimp)[exchange] ?? null;
                  const takerFee = allData?.tickers.find(t =>
                    t.exchange === exchange && t.currency === 'KRW' && t.pair?.includes('BTC')
                  )?.taker_fee_pct ?? null;
                  return (
                    <motion.div
                      key={exchange}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ ...SPRING_SLOW, delay: i * 0.04 }}
                    >
                      <OptionCard
                        selected={domestic === exchange}
                        onClick={() => { setDomestic(exchange); setCoin(null); setGlobal(null); setNetwork(null); scrollToStepEnd(); }}
                      >
                        <div className="flex items-center gap-2.5 mb-2.5">
                          <ExFavicon id={exchange} size={22} />
                          <p className="text-sm font-semibold text-label-primary">{fmtEx(exchange)}</p>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <p className="text-[9px] text-label-tertiary uppercase tracking-wide">24시간 거래량</p>
                            <p className="text-xs font-medium text-label-primary num mt-0.5">
                              {koreaVolumeMap[exchange] != null
                                ? `${(koreaVolumeMap[exchange]! / 1_0000_0000).toFixed(1)}억원`
                                : '–'}
                            </p>
                          </div>
                          <div>
                            <p className="text-[9px] text-label-tertiary uppercase tracking-wide">거래 수수료</p>
                            <p className="text-xs font-medium text-label-primary num mt-0.5">
                              {takerFee != null ? `${takerFee.toFixed(2)}%` : '–'}
                            </p>
                          </div>
                          <div>
                            <p className="text-[9px] text-label-tertiary uppercase tracking-wide">김프</p>
                            <p className={`text-xs font-medium num mt-0.5 ${kimp == null ? 'text-label-tertiary' : kimp > 2 ? 'text-acc-red' : kimp > 0 ? 'text-acc-amber' : 'text-acc-green'}`}>
                              {kimp != null ? `${kimp >= 0 ? '+' : ''}${kimp.toFixed(2)}%` : '–'}
                            </p>
                          </div>
                        </div>
                      </OptionCard>
                    </motion.div>
                  );
                })}
              </div>
              {domestic && (() => {
                const info = DOMESTIC_INFO[domestic];
                const apiLimits = withdrawalLimits[domestic] ?? null;
                // API 크롤 데이터 우선, 없으면 DOMESTIC_INFO static fallback
                const mergedLimits = {
                  krw_per_tx_limit: apiLimits?.krw_per_tx_limit ?? info?.krw_per_tx_limit ?? null,
                  btc_per_tx_max: apiLimits?.btc_per_tx_max ?? info?.btc_per_tx_max ?? null,
                  btc_daily_verified: (() => {
                    if (apiLimits?.krw_daily_verified_digital != null && btcPrice?.krw) {
                      return Math.round(apiLimits.krw_daily_verified_digital / btcPrice.krw * 100) / 100;
                    }
                    return apiLimits?.btc_daily_verified ?? info?.btc_daily_verified ?? null;
                  })(),
                  krw_daily_verified_digital: apiLimits?.krw_daily_verified_digital ?? null,
                  source: apiLimits?.source ?? 'static',
                };
                const vol = koreaVolumeMap[domestic];
                const kimp = (liveKimp ?? snapshotKimp)[domestic] ?? null;
                return (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={SPRING_SLOW}
                    className="ios-card rounded-2xl p-4 space-y-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-label-tertiary">거래소 정보</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-label-tertiary">소재 국가</span><p className="font-medium text-label-primary mt-0.5">{info?.country ?? '대한민국'}</p></div>
                      <div><span className="text-label-tertiary">CARF 시행</span><p className="font-medium text-label-primary mt-0.5">{info?.carf ?? 2027}년</p></div>
                      <div><span className="text-label-tertiary">연계 은행</span><p className="font-medium text-label-primary mt-0.5">{info?.bank ?? '–'}</p></div>
                      <div><span className="text-label-tertiary">라이트닝 지원</span><p className={`font-medium mt-0.5 ${info?.lightning ? 'text-acc-amber' : 'text-label-secondary'}`}>{info?.lightning ? '지원' : '미지원'}</p></div>
                      {vol != null && <div><span className="text-label-tertiary">24시간 비트코인 거래량</span><p className="font-medium text-label-primary mt-0.5 num">{(vol / 1_0000_0000).toFixed(1)}억원</p></div>}
                      {kimp != null && (
                        <div>
                          <span className="text-label-tertiary">김치 프리미엄 <span className="text-[9px]">(원달러 기준)</span></span>
                          <p className={`font-medium mt-0.5 num ${kimp > 2 ? 'text-acc-red' : kimp > 0 ? 'text-acc-amber' : 'text-acc-green'}`}>{kimp >= 0 ? '+' : ''}{kimp.toFixed(2)}%</p>
                        </div>
                      )}
                    </div>
                    {info && (
                      <div className="pt-2 border-t border-[rgba(180,110,50,0.08)] space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-label-tertiary">온체인 출금 한도</p>
                          {mergedLimits.source === 'playwright' ? (
                            <span className="text-[9px] text-acc-green font-medium">최신 데이터</span>
                          ) : (
                            <span className="text-[9px] text-acc-amber font-medium">데이터 조회 불가</span>
                          )}
                        </div>
                        {mergedLimits.source === 'playwright' ? (
                          <>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <span className="text-label-tertiary">1회 KRW 기준 한도</span>
                                <p className="font-medium text-label-primary mt-0.5 num">
                                  {mergedLimits.krw_per_tx_limit != null
                                    ? `${(mergedLimits.krw_per_tx_limit / 10000).toFixed(0)}만원`
                                    : '제한 없음'}
                                </p>
                              </div>
                              <div>
                                <span className="text-label-tertiary">1회 최대 BTC</span>
                                <p className="font-medium text-label-primary mt-0.5 num">
                                  {mergedLimits.btc_per_tx_max != null ? `${mergedLimits.btc_per_tx_max} BTC` : '제한 없음'}
                                </p>
                              </div>
                              <div>
                                <span className="text-label-tertiary">일일 한도 (인증 완료)</span>
                                <p className="font-medium text-label-primary mt-0.5 num">
                                  {mergedLimits.btc_daily_verified != null ? `${mergedLimits.btc_daily_verified} BTC/일` : '–'}
                                </p>
                                {mergedLimits.krw_daily_verified_digital != null && (
                                  <p className="text-[10px] text-label-tertiary mt-0.5 num">
                                    ({(mergedLimits.krw_daily_verified_digital / 100_000_000).toFixed(0)}억원 기준)
                                  </p>
                                )}
                              </div>
                            </div>
                            {mergedLimits.krw_per_tx_limit != null && (
                              <div className="flex items-start gap-2 p-2.5 rounded-xl bg-fill-secondary">
                                <p className="text-[11px] text-label-secondary leading-relaxed">
                                  1회 출금 시 {(mergedLimits.krw_per_tx_limit / 10000).toFixed(0)}만원 초과분은 여러 트랜잭션으로 분할 출금됩니다.
                                </p>
                              </div>
                            )}
                          </>
                        ) : (
                          <p className="text-[11px] text-label-tertiary leading-relaxed">
                            최근 크롤링된 출금 한도 데이터가 없어요. 거래소 공식 페이지에서 직접 확인해 주세요.
                          </p>
                        )}
                        <p className="text-[10px] text-label-tertiary">{info.personal_wallet_req}</p>
                        {info.source_note.startsWith('⚠️') && (
                          <div className="flex items-start gap-1.5">
                            <Warning className="w-3 h-3 text-acc-amber mt-0.5 flex-shrink-0" weight="fill" />
                            <p className="text-[10px] text-acc-amber">{info.source_note.replace('⚠️ ', '')}</p>
                          </div>
                        )}
                      </div>
                    )}
                    {vol != null && vol < 500_0000_0000 && (
                      <div className="flex items-start gap-2 p-2.5 rounded-xl bg-acc-amber/8 border border-acc-amber/15">
                        <Warning className="w-3.5 h-3.5 text-acc-amber mt-0.5 flex-shrink-0" weight="fill" />
                        <p className="text-[11px] text-label-secondary leading-relaxed">
                          <span className="font-semibold text-acc-amber">슬리피지 주의</span> — 거래량이 적어 호가창이 얇습니다. 대규모 매수·매도 시 실제 체결가가 표시가보다 불리할 수 있습니다.
                        </p>
                      </div>
                    )}
                    {info?.url && (
                      <a href={info.url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-[11px] text-acc-blue hover:underline">
                        <Globe className="w-3 h-3" /> {info.url.replace('https://', '')}
                      </a>
                    )}
                  </motion.div>
                );
              })()}
              {domestic && (
                <motion.button
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={SPRING_FAST}
                  onClick={() => handleNext('domestic')}
                  className="w-full py-3.5 rounded-2xl font-bold text-sm bg-acc-amber text-white shadow-glow-amber cursor-pointer flex items-center justify-center gap-2"
                >
                  다음 <ArrowRight className="w-4 h-4" />
                </motion.button>
              )}
              <button onClick={handleBack} className="w-full py-2 text-sm text-label-tertiary hover:text-label-secondary transition-colors flex items-center justify-center gap-1.5">
                <ArrowLeft className="w-3.5 h-3.5" weight="bold" /> 이전으로
              </button>
              <div ref={stepEndRef} />
            </motion.div>
          )}

          {/* ── Domestic Gate ── */}
          {phase === 'domestic_gate' && domestic && (
            <motion.div key="domestic_gate" variants={variants} initial="enter" animate="center" exit="exit"
              transition={SPRING_SLOW} className="space-y-4 pt-2">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <ExFavicon id={domestic} size={16} />
                  <p className="text-xs text-label-secondary">{fmtEx(domestic)}</p>
                </div>
                <h1 className="text-2xl font-bold text-label-primary tracking-tight">출금 체크리스트</h1>
                <p className="text-sm text-label-secondary mt-1">출금 전 확인이 필요한 항목이에요</p>
              </div>
              <GatemanPanel
                gates={getDomesticGates(domestic, liveRegistry?.domestic)}
                title={`${fmtEx(domestic)} 출금 체크리스트`}
              />
              <motion.button
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={SPRING_FAST}
                onClick={() => handleNext('domestic_gate')}
                className="w-full py-3.5 rounded-2xl font-bold text-sm bg-acc-amber text-white shadow-glow-amber cursor-pointer flex items-center justify-center gap-2"
              >
                다음 <ArrowRight className="w-4 h-4" />
              </motion.button>
              <button onClick={handleBack} className="w-full py-2 text-sm text-label-tertiary hover:text-label-secondary transition-colors flex items-center justify-center gap-1.5">
                <ArrowLeft className="w-3.5 h-3.5" weight="bold" /> 이전으로
              </button>
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
                <h1 className="text-2xl font-bold text-label-primary tracking-tight">국내 거래소 출금 방식</h1>
                <p className="text-sm text-label-secondary mt-1">어떤 방식으로 이동할까요?</p>
              </div>
              <div className="space-y-2.5">
                {coinOptions.map(({ coin: c }, i) => (
                  <motion.div key={c}
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ ...SPRING_SLOW, delay: i * 0.06 }}>
                    <OptionCard
                      selected={coin === c}
                      onClick={() => { setCoin(c); setGlobal(null); setNetwork(null); setBtcMethod(null); scrollToStepEnd(); }}
                    >
                      <div className="flex items-center gap-3">
                        {c === 'USDT'
                          ? <CurrencyDollar weight="fill" className="w-8 h-8 text-acc-green" />
                          : c === 'BTC_GLOBAL'
                            ? <Globe weight="fill" className="w-8 h-8 text-acc-blue" />
                          : <Coin weight="fill" className="w-8 h-8 text-acc-amber" />}
                        <div>
                          <p className="text-sm font-bold text-label-primary">
                            {c === 'USDT' ? 'USDT → 해외거래소 비트코인 매수'
                              : c === 'BTC_GLOBAL' ? '비트코인 → 해외거래소 경유'
                              : '비트코인 직접 출금'}
                          </p>
                          <p className="text-xs text-label-secondary mt-0.5">
                            {c === 'USDT'
                              ? 'USDT 출금 → 해외 거래소 비트코인 매수 → 개인 지갑'
                              : c === 'BTC_GLOBAL'
                                ? '비트코인 출금 → 해외 거래소 경유 → 개인 지갑'
                                : '한국 거래소 비트코인 직접 출금 → 개인 지갑'}
                          </p>
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
                  onClick={() => handleNext('coin')}
                  className="w-full py-3.5 rounded-2xl font-bold text-sm bg-acc-amber text-white shadow-glow-amber cursor-pointer flex items-center justify-center gap-2"
                >
                  다음 <ArrowRight className="w-4 h-4" />
                </motion.button>
              )}
              <button onClick={handleBack} className="w-full py-2 text-sm text-label-tertiary hover:text-label-secondary transition-colors flex items-center justify-center gap-1.5">
                <ArrowLeft className="w-3.5 h-3.5" weight="bold" /> 이전으로
              </button>
              <div ref={stepEndRef} />
            </motion.div>
          )}

          {/* ── BTC Method ── */}
          {phase === 'btc_method' && (
            <motion.div key="btc_method" variants={variants} initial="enter" animate="center" exit="exit"
              transition={SPRING_SLOW} className="space-y-4 pt-2">
              <div>
                <h1 className="text-2xl font-bold text-label-primary tracking-tight">출금 네트워크 방식</h1>
                <p className="text-sm text-label-secondary mt-1">비트코인을 어떻게 보낼까요?</p>
              </div>
              <div className="space-y-2.5">
                <OptionCard selected={btcMethod === 'onchain'} onClick={() => { setBtcMethod('onchain'); scrollToStepEnd(); }}>
                  <div className="flex items-center gap-3">
                    <ArrowDown weight="bold" className="w-7 h-7 text-acc-amber flex-shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-label-primary">온체인 출금</p>
                      <p className="text-xs text-label-secondary mt-0.5">Bitcoin 블록체인 네트워크로 직접 전송. 10분 내외 소요.</p>
                    </div>
                  </div>
                </OptionCard>
                <OptionCard selected={btcMethod === 'lightning'} onClick={() => { setBtcMethod('lightning'); scrollToStepEnd(); }}>
                  <div className="flex items-center gap-3">
                    <Lightning weight="fill" className={`w-7 h-7 flex-shrink-0 ${btcMethod === 'lightning' ? 'text-acc-amber' : 'text-label-secondary'}`} />
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-label-primary">라이트닝</p>
                        <span className="text-[10px] font-semibold bg-fill-secondary text-label-tertiary px-1.5 py-0.5 rounded-md">국내 거래소 미지원</span>
                      </div>
                      <p className="text-xs text-label-secondary mt-0.5">즉시 결제 · 수수료 저렴 · 국내 거래소에서 직접 출금 불가</p>
                    </div>
                  </div>
                </OptionCard>
              </div>

              {btcMethod === 'onchain' && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={SPRING_SLOW}
                  className="space-y-2.5">
                  <div className="ios-card rounded-2xl p-4 text-xs space-y-2">
                    <p className="font-semibold text-label-primary">온체인 출금이란?</p>
                    <p className="text-label-secondary">Bitcoin 블록체인에 직접 기록되는 방식입니다. 거래소가 고정 출금 수수료를 부과하며, 10분 내외 소요됩니다.</p>
                    <p className="text-label-secondary">채굴자 수수료(온체인 네트워크 수수료)는 거래소 출금 수수료에 포함되어 있습니다.</p>
                  </div>
                  <GatemanPanel gates={liveRegistry?.onchain ?? ONCHAIN_GATES} title="온체인 출금 주의사항" />
                </motion.div>
              )}

              {btcMethod === 'lightning' && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={SPRING_SLOW}
                  className="ios-card rounded-2xl p-4 text-xs space-y-2">
                  <p className="font-semibold text-label-primary">라이트닝 네트워크란?</p>
                  <p className="text-label-secondary">Bitcoin 위에 구축된 2nd Layer 결제 프로토콜로, 수수료가 매우 저렴하고 거래가 즉시 완료됩니다.</p>
                  <p className="text-label-secondary"><span className="font-medium text-acc-red">국내 거래소(업비트, 빗썸 등)는 라이트닝 직접 출금을 지원하지 않습니다.</span> 온체인으로 출금 후 별도 스왑 서비스를 이용하는 경로를 원하신다면 코인 선택 단계에서 &apos;BTC → 해외거래소 경유&apos;를 선택하세요.</p>
                </motion.div>
              )}

              {btcMethod !== null && (
                <motion.button
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={SPRING_FAST}
                  disabled={btcMethod === 'lightning'}
                  onClick={() => { if (btcMethod === 'onchain') handleNext('btc_method'); }}
                  className={`w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
                    btcMethod === 'lightning'
                      ? 'bg-fill-secondary text-label-tertiary cursor-not-allowed'
                      : 'bg-acc-amber text-white shadow-glow-amber cursor-pointer'
                  }`}
                >
                  다음 <ArrowRight className="w-4 h-4" />
                </motion.button>
              )}
              <button onClick={handleBack} className="w-full py-2 text-sm text-label-tertiary hover:text-label-secondary transition-colors flex items-center justify-center gap-1.5">
                <ArrowLeft className="w-3.5 h-3.5" weight="bold" /> 이전으로
              </button>
              <div ref={stepEndRef} />
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
                <p className="text-sm text-label-secondary mt-1">경유할 해외 거래소를 선택해요</p>
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
                        onClick={() => { setGlobal(exchange as GlobalExchange); setNetwork(null); setGlobalExitMethod(null); scrollToStepEnd(); }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <ExFavicon id={exchange} size={22} />
                            <div>
                              <p className="text-sm font-semibold text-label-primary">{fmtEx(exchange)}</p>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                {tradingComp?.rate_pct != null && (
                                  <span className="text-[10px] text-label-tertiary num">
                                    거래 수수료 <span className="font-medium text-label-secondary">{tradingComp.rate_pct.toFixed(2)}%</span>
                                  </span>
                                )}
                                {wdComp?.amount_text && (
                                  <span className="text-[10px] text-label-tertiary">
                                    출금 <span className="font-medium text-label-secondary">{wdComp.amount_text}</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </OptionCard>
                    </motion.div>
                  );
                })}
              </div>
              {global && (() => {
                const info = GLOBAL_INFO[global];
                if (!info) return null;
                return (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={SPRING_SLOW}
                    className="ios-card rounded-2xl p-4 space-y-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-label-tertiary">거래소 정보</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-label-tertiary">소재 국가</span><p className="font-medium text-label-primary mt-0.5">{info.country}</p></div>
                      <div><span className="text-label-tertiary">CARF 시행</span><p className="font-medium text-label-primary mt-0.5">{info.carf}년</p></div>
                      <div><span className="text-label-tertiary">위험도</span>
                        <p className={`inline-flex items-center mt-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${RISK_COLOR[info.risk]}`}>
                          {RISK_LABEL[info.risk]}
                        </p>
                      </div>
                      {(() => {
                        const lnOk = globalSupportsLightning(global);
                        return <div><span className="text-label-tertiary">라이트닝 출금</span><p className={`font-medium mt-0.5 ${lnOk ? 'text-acc-amber' : 'text-label-secondary'}`}>{lnOk ? '지원' : '미지원'}</p></div>;
                      })()}
                      {info.fatca && <div><span className="text-label-tertiary">규제</span><p className="font-medium text-acc-red mt-0.5">FATCA</p></div>}
                      <div><span className="text-label-tertiary">24H 거래량 (참고)</span>
                        <p className="font-medium text-label-primary mt-0.5 num">~${info.vol24hB}억</p>
                      </div>
                    </div>
                    {info.vol24hB < 20 && (
                      <div className="flex items-start gap-2 p-2.5 rounded-xl bg-acc-amber/8 border border-acc-amber/15">
                        <Warning className="w-3.5 h-3.5 text-acc-amber mt-0.5 flex-shrink-0" weight="fill" />
                        <p className="text-[11px] text-label-secondary leading-relaxed">
                          <span className="font-semibold text-acc-amber">슬리피지 주의</span> — 24시간 거래량이 낮아 유동성이 부족합니다. BTC 매수 시 실제 체결가가 호가보다 불리할 수 있으며, 특히 거래 규모가 클수록 영향이 커집니다.
                        </p>
                      </div>
                    )}
                    <a href={info.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-[11px] text-acc-blue hover:underline">
                      <Globe className="w-3 h-3" /> {info.url.replace('https://', '')}
                    </a>
                  </motion.div>
                );
              })()}
              {global && (
                <motion.button
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={SPRING_FAST}
                  onClick={() => handleNext('global')}
                  className="w-full py-3.5 rounded-2xl font-bold text-sm bg-acc-amber text-white shadow-glow-amber cursor-pointer flex items-center justify-center gap-2"
                >
                  다음 <ArrowRight className="w-4 h-4" />
                </motion.button>
              )}
              <button onClick={handleBack} className="w-full py-2 text-sm text-label-tertiary hover:text-label-secondary transition-colors flex items-center justify-center gap-1.5">
                <ArrowLeft className="w-3.5 h-3.5" weight="bold" /> 이전으로
              </button>
              <div ref={stepEndRef} />
            </motion.div>
          )}

          {/* ── Network ── */}
          {/* ── Global Gate ── */}
          {phase === 'global_gate' && global && (
            <motion.div key="global_gate" variants={variants} initial="enter" animate="center" exit="exit"
              transition={SPRING_SLOW} className="space-y-4 pt-2">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <ExFavicon id={global} size={16} />
                  <p className="text-xs text-label-secondary">{fmtEx(global)}</p>
                </div>
                <h1 className="text-2xl font-bold text-label-primary tracking-tight">입출금 체크리스트</h1>
                <p className="text-sm text-label-secondary mt-1">입출금 전 확인이 필요한 항목이에요</p>
              </div>
              <GatemanPanel
                gates={getGlobalGates(global, liveRegistry?.global)}
                title={`${fmtEx(global)} 입출금 체크리스트`}
              />
              <motion.button
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={SPRING_FAST}
                onClick={() => handleNext('global_gate')}
                className="w-full py-3.5 rounded-2xl font-bold text-sm bg-acc-amber text-white shadow-glow-amber cursor-pointer flex items-center justify-center gap-2"
              >
                다음 <ArrowRight className="w-4 h-4" />
              </motion.button>
              <button onClick={handleBack} className="w-full py-2 text-sm text-label-tertiary hover:text-label-secondary transition-colors flex items-center justify-center gap-1.5">
                <ArrowLeft className="w-3.5 h-3.5" weight="bold" /> 이전으로
              </button>
            </motion.div>
          )}

          {/* ── Global Exit Method ── */}
          {phase === 'global_exit_method' && global && (
            <motion.div key="global_exit_method" variants={variants} initial="enter" animate="center" exit="exit"
              transition={SPRING_SLOW} className="space-y-4 pt-2">
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <ExFavicon id={global} size={14} />
                  <p className="text-xs text-label-secondary">{fmtEx(global)}</p>
                </div>
                <h1 className="text-2xl font-bold text-label-primary tracking-tight">출금 방식</h1>
                <p className="text-sm text-label-secondary mt-1">해외 거래소에서 어떻게 출금할까요?</p>
              </div>
              <div className="space-y-2.5">
                <OptionCard
                  selected={globalExitMethod === 'onchain'}
                  onClick={() => { setGlobalExitMethod('onchain'); if (coin === 'BTC_GLOBAL') setNetwork(null); scrollToStepEnd(); }}
                >
                  <div className="flex items-center gap-3">
                    <ArrowDown weight="bold" className="w-7 h-7 text-acc-amber flex-shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-label-primary">온체인 출금</p>
                      <p className="text-xs text-label-secondary mt-0.5">Bitcoin 블록체인으로 출금. 10분 내외 소요.</p>
                    </div>
                  </div>
                </OptionCard>
                {(() => {
                  const lnAvailable = hasLightningPaths;
                  const lnBadge = !hasLightningPaths ? '경로 없음' : null;
                  return (
                    <OptionCard
                      selected={globalExitMethod === 'lightning'}
                      onClick={() => { if (lnAvailable) { setGlobalExitMethod('lightning'); if (coin === 'BTC_GLOBAL') setNetwork(null); scrollToStepEnd(); } }}
                      disabled={!lnAvailable}
                    >
                      <div className="flex items-center gap-3">
                        <Lightning weight="fill" className={`w-7 h-7 flex-shrink-0 ${lnAvailable ? 'text-acc-amber' : 'text-label-disabled'}`} />
                        <div>
                          <div className="flex items-center gap-2">
                            <p className={`text-sm font-bold ${lnAvailable ? 'text-label-primary' : 'text-label-disabled'}`}>라이트닝 출금</p>
                            {lnBadge && (
                              <span className="text-[10px] font-semibold bg-fill-secondary text-label-tertiary px-1.5 py-0.5 rounded-md">{lnBadge}</span>
                            )}
                          </div>
                          <p className={`text-xs mt-0.5 ${lnAvailable ? 'text-label-secondary' : 'text-label-disabled'}`}>
                            라이트닝 네트워크로 출금 후 스왑 서비스를 통해 온체인 BTC로 수령. 주소 노출 최소화.
                          </p>
                        </div>
                      </div>
                    </OptionCard>
                  );
                })()}
              </div>
              {globalExitMethod === 'onchain' && (
                <div className="ios-card rounded-2xl p-4 text-xs space-y-2">
                  <p className="font-semibold text-label-primary">온체인 출금</p>
                  <p className="text-label-secondary">Bitcoin 블록체인에 직접 기록. 거래소 고정 출금 수수료 부과 (채굴 수수료 아님). 10분 내외 소요.</p>
                </div>
              )}
              {globalExitMethod === 'lightning' && (
                <div className="ios-card rounded-2xl p-4 text-xs space-y-2">
                  <p className="font-semibold text-label-primary">라이트닝 출금 흐름</p>
                  <p className="text-label-secondary">해외 거래소 → <span className="text-acc-amber font-medium">라이트닝 출금</span> → 스왑 서비스 → <span className="text-label-primary font-medium">온체인 BTC 수령</span></p>
                  <p className="text-label-tertiary">스왑 서비스 수수료가 별도 발생합니다.</p>
                </div>
              )}
              {globalExitMethod && (
                <motion.button
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={SPRING_FAST}
                  onClick={() => handleNext('global_exit_method')}
                  className="w-full py-3.5 rounded-2xl font-bold text-sm bg-acc-amber text-white shadow-glow-amber cursor-pointer flex items-center justify-center gap-2"
                >
                  다음 <ArrowRight className="w-4 h-4" />
                </motion.button>
              )}
              <button onClick={handleBack} className="w-full py-2 text-sm text-label-tertiary hover:text-label-secondary transition-colors flex items-center justify-center gap-1.5">
                <ArrowLeft className="w-3.5 h-3.5" weight="bold" /> 이전으로
              </button>
              <div ref={stepEndRef} />
            </motion.div>
          )}

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
                      onClick={() => { setNetwork(n); setSwapSvc(null); scrollToStepEnd(); }}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <NetworkIcon network={n} size={16} />
                            <p className="text-sm font-bold text-label-primary">{n}</p>
                          </div>
                          {(() => {
                            const wdFee = best.breakdown?.components.find(c => c.is_fixed === true);
                            const amt = wdFee ? fmtAmountText(wdFee.amount_text) : null;
                            return (
                              <p className="text-[10px] text-label-tertiary mt-0.5">
                                거래소 고정 출금 수수료{amt ? <> <span className="text-acc-blue font-medium num">{amt}</span></> : ''}
                              </p>
                            );
                          })()}
                        </div>
                      </div>
                    </OptionCard>
                  </motion.div>
                ))}
              </div>
              <p className="text-[10px] text-label-tertiary text-center px-2">Bitcoin 채굴 수수료(네트워크 수수료)와 별개로 거래소가 부과하는 고정 출금 수수료입니다</p>
              {network && (
                <motion.button
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={SPRING_FAST}
                  onClick={() => handleNext('network')}
                  className="w-full py-3.5 rounded-2xl font-bold text-sm bg-acc-amber text-white shadow-glow-amber cursor-pointer flex items-center justify-center gap-2"
                >
                  다음 <ArrowRight className="w-4 h-4" />
                </motion.button>
              )}
              <button onClick={handleBack} className="w-full py-2 text-sm text-label-tertiary hover:text-label-secondary transition-colors flex items-center justify-center gap-1.5">
                <ArrowLeft className="w-3.5 h-3.5" weight="bold" /> 이전으로
              </button>
              <div ref={stepEndRef} />
            </motion.div>
          )}

          {/* ── Swap Service ── */}
          {phase === 'swap_service' && (
            <motion.div key="swap_service" variants={variants} initial="enter" animate="center" exit="exit"
              transition={SPRING_SLOW} className="space-y-4 pt-2">
              <div>
                <h1 className="text-2xl font-bold text-label-primary tracking-tight">스왑 서비스</h1>
                <p className="text-sm text-label-secondary mt-1">라이트닝 → 온체인 변환 서비스를 선택해요</p>
              </div>
              <div className="space-y-2.5">
                {swapServiceOptions.filter(o => o.name !== '__direct__').length === 0 && !swapServiceOptions.find(o => o.name === '__direct__') ? (
                  <div className="ios-card rounded-2xl p-5 text-center space-y-2">
                    <p className="text-sm font-semibold text-label-secondary">사용 가능한 스왑 서비스 없음</p>
                    <p className="text-xs text-label-tertiary">현재 라이트닝 스왑 서비스 데이터를 불러오지 못했습니다. 다시 시도하거나 온체인 출금을 선택해주세요.</p>
                    <button
                      onClick={handleBack}
                      className="mt-2 text-xs text-acc-amber font-semibold underline underline-offset-2"
                    >
                      출금 방식 다시 선택
                    </button>
                  </div>
                ) : swapServiceOptions.map(({ name, fee_pct, kyc, btc_received, source_url }, i) => {
                  const isSelected = swapSvc === name;
                  const isDirect = name === '__direct__';

                  if (isDirect) {
                    return (
                      <motion.div key="__direct__"
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ ...SPRING_SLOW, delay: i * 0.06 }}>
                        <OptionCard
                          selected={isSelected}
                          onClick={() => { setSwapSvc('__direct__'); scrollToStepEnd(); }}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <div className="w-5 h-5 rounded-md bg-acc-green/15 flex items-center justify-center">
                                  <Lightning weight="fill" className="w-3 h-3 text-acc-green" />
                                </div>
                                <p className="text-sm font-bold text-label-primary">직접 출금 (스왑 없음)</p>
                              </div>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <span className="text-[10px] text-acc-green font-semibold">스왑 수수료 없음</span>
                                <span className="text-[10px] bg-acc-green/10 text-acc-green px-1.5 py-0.5 rounded-full">개인 LN 지갑 필요</span>
                              </div>
                            </div>
                          </div>
                          {isSelected && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              transition={SPRING_FAST}
                              className="mt-3 pt-3 border-t border-[rgba(180,110,50,0.12)] space-y-1 overflow-hidden"
                            >
                              <p className="text-[11px] text-label-secondary leading-relaxed">
                                글로벌 거래소에서 개인 라이트닝 지갑으로 직접 출금합니다. 스왑 서비스 없이 라이트닝 출금 수수료만 발생합니다.
                                Phoenix, Breez 등 자기 관리형 라이트닝 지갑이 필요합니다.
                              </p>
                            </motion.div>
                          )}
                        </OptionCard>
                      </motion.div>
                    );
                  }

                  const svcInfo = getLightningServiceInfo(name);
                  const domain = getExchangeDomain(name);
                  const websiteUrl = source_url ?? (domain ? `https://${domain}` : null);
                  return (
                    <motion.div key={name}
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ ...SPRING_SLOW, delay: i * 0.06 }}>
                      <OptionCard
                        selected={isSelected}
                        onClick={() => { setSwapSvc(name); scrollToStepEnd(); }}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <ExFavicon id={name} size={20} />
                              <p className="text-sm font-bold text-label-primary">{fmtEx(name)}</p>
                              {websiteUrl && (
                                <a
                                  href={websiteUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-label-quaternary hover:text-acc-amber transition-colors"
                                >
                                  <ArrowSquareOut className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className="text-[10px] text-acc-amber font-semibold">{fee_pct.toFixed(2)}% 변동</span>
                              {kyc
                                ? <span className="text-[10px] bg-acc-amber/10 text-acc-amber px-1.5 py-0.5 rounded-full">인증 필요</span>
                                : <span className="text-[10px] bg-acc-green/10 text-acc-green px-1.5 py-0.5 rounded-full">인증 불필요</span>
                              }
                            </div>
                          </div>
                        </div>
                        {isSelected && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            transition={SPRING_FAST}
                            className="mt-3 pt-3 border-t border-[rgba(180,110,50,0.12)] space-y-2.5 overflow-hidden"
                          >
                            {svcInfo && (
                              <p className="text-[11px] text-label-secondary leading-relaxed">{svcInfo.description}</p>
                            )}
                            {svcInfo && svcInfo.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {svcInfo.tags.map(tag => (
                                  <span key={tag} className="text-[10px] bg-fill-secondary text-label-tertiary px-2 py-0.5 rounded-full">{tag}</span>
                                ))}
                              </div>
                            )}
                            {websiteUrl && (
                              <a
                                href={websiteUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 text-[11px] text-acc-amber font-medium hover:underline underline-offset-2"
                              >
                                <Globe className="w-3 h-3" />
                                {domain ?? websiteUrl}
                                <ArrowRight className="w-2.5 h-2.5 rotate-[-45deg]" />
                              </a>
                            )}
                          </motion.div>
                        )}
                      </OptionCard>
                    </motion.div>
                  );
                })}
              </div>
              {swapSvc && (
                <motion.button
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={SPRING_FAST}
                  onClick={() => handleNext('swap_service')}
                  className="w-full py-3.5 rounded-2xl font-bold text-sm bg-acc-amber text-white shadow-glow-amber cursor-pointer flex items-center justify-center gap-2"
                >
                  결과 보기 <ArrowRight className="w-4 h-4" />
                </motion.button>
              )}
              <button onClick={handleBack} className="w-full py-2 text-sm text-label-tertiary hover:text-label-secondary transition-colors flex items-center justify-center gap-1.5">
                <ArrowLeft className="w-3.5 h-3.5" weight="bold" /> 이전으로
              </button>
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
                  {formatNumber(displaySats)}
                </p>
                <p className="text-sm text-label-secondary mt-1 num relative z-10">sats</p>
                <div className="sep mt-5 mb-4 relative z-10" />

                {(() => {
                  const kimchi = domestic ? ((liveKimp ?? snapshotKimp)[domestic] ?? null) : null;
                  const satsKrw = domesticBtcKrw != null && resultPath.btc_received != null
                    ? Math.round(resultPath.btc_received * domesticBtcKrw)
                    : null;
                  const krwPnL = satsKrw != null ? satsKrw - amountKrw : null;

                  const globalBtcKrw = domesticBtcKrw != null && kimchi != null
                    ? domesticBtcKrw / (1 + kimchi / 100)
                    : null;
                  const satsGlobalKrw = globalBtcKrw != null && resultPath.btc_received != null
                    ? Math.round(resultPath.btc_received * globalBtcKrw)
                    : null;
                  const globalPnL = satsGlobalKrw != null ? satsGlobalKrw - amountKrw : null;

                  return (
                    <div className="space-y-2 relative z-10 w-full">
                      {krwPnL != null ? (
                        <div className="ios-card rounded-2xl px-4 py-3 text-left">
                          <p className="text-[10px] text-label-tertiary uppercase tracking-wide mb-1.5">국내 원화 기준</p>
                          <p className="text-xs text-label-secondary leading-relaxed">
                            <span className="num font-semibold text-label-primary">₩{formatNumber(amountKrw)}</span> 구매하면 받은 비트코인 가치는 <span className="num font-semibold text-label-primary">₩{formatNumber(satsKrw!)}</span>
                          </p>
                          <p className={`text-sm font-bold num mt-1 ${krwPnL < 0 ? 'text-acc-red' : 'text-acc-green'}`}>
                            {krwPnL < 0 ? '▼' : '▲'} ₩{formatNumber(Math.abs(krwPnL))} {krwPnL < 0 ? '손해' : '이득'}
                            <span className="text-[11px] font-normal ml-1.5 opacity-70">({(Math.abs(krwPnL) / amountKrw * 100).toFixed(2)}%)</span>
                          </p>
                        </div>
                      ) : (
                        <div className="ios-card rounded-2xl px-4 py-3 text-left">
                          <p className="text-[10px] text-label-tertiary uppercase tracking-wide mb-1.5">수수료</p>
                          <p className="text-sm font-bold text-acc-red num">
                            -{formatFeeKrw(resultPath.total_fee_krw)}
                            <span className="text-[11px] font-normal ml-1.5 opacity-70">({formatPercent(resultPath.fee_pct)})</span>
                          </p>
                        </div>
                      )}

                      {globalPnL != null && (
                        <div className="ios-card rounded-2xl px-4 py-3 text-left">
                          <p className="text-[10px] text-label-tertiary uppercase tracking-wide mb-1.5">
                            글로벌 시세 기준
                            <span className="ml-1.5 normal-case font-normal">
                              (김치 프리미엄 <span className={kimchi! >= 0 ? 'text-acc-red' : 'text-acc-green'}>{kimchi! >= 0 ? '+' : ''}{kimchi!.toFixed(2)}%</span>
                              <span className="text-[9px] text-label-tertiary"> · 원달러 기준</span>)
                            </span>
                          </p>
                          <p className="text-xs text-label-secondary leading-relaxed">
                            같은 비트코인을 글로벌 시세로 환산하면 <span className="num font-semibold text-label-primary">₩{formatNumber(satsGlobalKrw!)}</span>
                          </p>
                          <p className={`text-sm font-bold num mt-1 ${globalPnL >= 0 ? 'text-acc-green' : 'text-acc-red'}`}>
                            {globalPnL >= 0 ? '▲' : '▼'} ₩{formatNumber(Math.abs(globalPnL))} {globalPnL >= 0 ? '이득' : '손해'}
                            <span className="text-[11px] font-normal ml-1.5 opacity-70">({(Math.abs(globalPnL) / amountKrw * 100).toFixed(2)}%)</span>
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </motion.div>

              {/* Route path visualization */}
              <div>
                <SectionLabel>이동 경로</SectionLabel>
                <div className="ios-card rounded-2xl p-4">
                  <div className="flex items-center gap-1 flex-wrap">
                    {/* 국내 거래소 */}
                    <div className="flex flex-col items-center">
                      <ExFavicon id={resultPath.korean_exchange} size={24} />
                      <p className="text-[10px] text-label-secondary mt-1">{fmtEx(resultPath.korean_exchange)}</p>
                    </div>
                    <div className="flex flex-col items-center px-1">
                      <ArrowRight className="w-3.5 h-3.5 text-label-tertiary" />
                      <p className="text-[9px] text-label-tertiary mt-1">{resultPath.transfer_coin === 'BTC' ? '비트코인' : resultPath.transfer_coin}</p>
                    </div>
                    {/* 해외 거래소 (USDT 경유) */}
                    {global && (
                      <>
                        <div className="flex flex-col items-center">
                          <ExFavicon id={global} size={24} />
                          <p className="text-[10px] text-label-secondary mt-1">{fmtEx(global)}</p>
                        </div>
                        <div className="flex flex-col items-center px-1">
                          <ArrowRight className="w-3.5 h-3.5 text-label-tertiary" />
                          <p className="text-[9px] text-label-tertiary mt-1">비트코인</p>
                        </div>
                      </>
                    )}
                    {/* 스왑 서비스 (라이트닝) */}
                    {swapSvc && swapSvc !== '__direct__' && (
                      <>
                        <div className="flex flex-col items-center">
                          <ExFavicon id={swapSvc} size={24} />
                          <p className="text-[10px] text-label-secondary mt-1">{fmtEx(swapSvc)}</p>
                        </div>
                        <div className="flex flex-col items-center px-1">
                          <ArrowRight className="w-3.5 h-3.5 text-label-tertiary" />
                          <p className="text-[9px] text-label-tertiary mt-1">LN</p>
                        </div>
                      </>
                    )}
                    {swapSvc === '__direct__' && (
                      <>
                        <div className="flex flex-col items-center px-1">
                          <ArrowRight className="w-3.5 h-3.5 text-label-tertiary" />
                          <p className="text-[9px] text-acc-green mt-1">직접 LN</p>
                        </div>
                      </>
                    )}
                    {/* 개인 지갑 */}
                    <div className="flex flex-col items-center">
                      <div className="w-6 h-6 rounded-md bg-acc-green/15 flex items-center justify-center">
                        <Wallet weight="fill" className="w-3.5 h-3.5 text-acc-green" />
                      </div>
                      <p className="text-[10px] text-label-secondary mt-1">내 지갑</p>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-[rgba(180,110,50,0.08)] flex gap-3 text-[10px] text-label-tertiary flex-wrap">
                    <span className="flex items-center gap-1">네트워크 <NetworkIcon network={resultPath.network} size={12} /><span className="text-label-secondary font-medium">{resultPath.network}</span></span>
                    <span>출금 방식 <span className="text-label-secondary font-medium">{resultPath.global_exit_mode === 'lightning' ? '⚡ 라이트닝' : '온체인'}</span></span>
                  </div>
                </div>
              </div>

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
                {resultPath.domestic_kyc_status === 'kyc' && <Chip color="amber">국내 인증 필요</Chip>}
                {resultPath.global_kyc_status === 'kyc'   && <Chip color="amber">해외 인증 필요</Chip>}
                {resultPath.global_kyc_status === 'non_kyc' && <Chip color="green">해외 인증 불필요</Chip>}
                {resultPath.global_exit_mode === 'lightning' && <Chip color="blue">라이트닝 출금</Chip>}
              </div>

              {/* Alternative paths recommendation */}
              {altPaths.length > 0 && (() => {
                const bestAlt = altPaths[0];
                const savingsKrw = domesticBtcKrw != null
                  ? Math.round(((bestAlt.btc_received ?? 0) - (resultPath.btc_received ?? 0)) * domesticBtcKrw)
                  : Math.round(resultPath.total_fee_krw - bestAlt.total_fee_krw);
                return (
                  <div>
                    <button
                      onClick={() => setShowAltPaths(v => !v)}
                      className="w-full rounded-2xl px-4 py-3.5 flex items-center justify-between gap-3 text-left bg-acc-green/10 border border-acc-green/30"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-acc-green/20 flex items-center justify-center flex-shrink-0">
                          <TrendDown className="w-4.5 h-4.5 text-acc-green" weight="bold" />
                        </div>
                        <div>
                          <p className="text-[11px] text-acc-green font-medium">더 저렴한 경로가 있어요</p>
                          <p className="text-base font-bold text-acc-green num">
                            ₩{formatNumber(savingsKrw)} <span className="text-sm font-semibold">절약 가능</span>
                          </p>
                          <p className="text-[10px] text-acc-green/70 mt-0.5">
                            {altPaths.length}개 경로 {showAltPaths ? '접기' : '보기'} →
                          </p>
                        </div>
                      </div>
                      <CaretDown className={`w-4 h-4 text-acc-green/60 flex-shrink-0 transition-transform duration-200 ${showAltPaths ? 'rotate-180' : ''}`} />
                    </button>

                    {showAltPaths && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                        className="mt-2 space-y-2"
                      >
                        {altPaths.map((p, i) => {
                          const altSavingsKrw = domesticBtcKrw != null
                            ? Math.round(((p.btc_received ?? 0) - (resultPath.btc_received ?? 0)) * domesticBtcKrw)
                            : Math.round(resultPath.total_fee_krw - p.total_fee_krw);
                          return (
                            <div key={p.path_id ?? i} className="ios-card rounded-2xl px-4 py-3">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-1 flex-wrap min-w-0 flex-1">
                                  <ExFavicon id={p.korean_exchange} size={16} />
                                  <span className="text-[10px] text-label-secondary font-medium">{fmtEx(p.korean_exchange)}</span>
                                  <ArrowRight className="w-2.5 h-2.5 text-label-tertiary flex-shrink-0" />
                                  <span className="text-[10px] text-label-tertiary">{p.transfer_coin === 'BTC' ? '비트코인' : p.transfer_coin}</span>
                                  {p.transfer_coin === 'USDT' && p._g && (
                                    <>
                                      <ArrowRight className="w-2.5 h-2.5 text-label-tertiary flex-shrink-0" />
                                      <ExFavicon id={p._g} size={16} />
                                      <span className="text-[10px] text-label-secondary font-medium">{fmtEx(p._g)}</span>
                                    </>
                                  )}
                                  <ArrowRight className="w-2.5 h-2.5 text-label-tertiary flex-shrink-0" />
                                  <NetworkIcon network={p.network} size={12} />
                                  <span className="text-[10px] text-label-tertiary">{p.network}</span>
                                  {p.global_exit_mode === 'lightning' && (
                                    <span className="text-[9px] bg-acc-amber/10 text-acc-amber px-1.5 py-0.5 rounded-full font-medium">라이트닝</span>
                                  )}
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-xs font-bold text-acc-green num">+₩{formatNumber(altSavingsKrw)}</p>
                                  <p className="text-[10px] text-label-tertiary num mt-0.5">{formatPercent(p.fee_pct)}</p>
                                </div>
                              </div>
                              <div className="mt-1.5 flex gap-3 text-[10px] text-label-tertiary">
                                <span>수수료 <span className="text-acc-red num font-medium">-{formatFeeKrw(p.total_fee_krw)}</span></span>
                                <span>수령 <span className="text-label-primary num font-medium">{formatNumber(Math.round((p.btc_received ?? 0) * SATS_PER_BTC))} sats</span></span>
                              </div>
                            </div>
                          );
                        })}
                      </motion.div>
                    )}
                  </div>
                );
              })()}

              {/* Retry */}
              <button
                onClick={reset}
                className="w-full py-3.5 rounded-2xl bg-fill-secondary text-label-secondary text-sm font-semibold hover:bg-fill-primary transition-colors"
              >
                다시 탐색
              </button>
              <button onClick={handleBack} className="w-full py-2 text-sm text-label-tertiary hover:text-label-secondary transition-colors flex items-center justify-center gap-1.5">
                <ArrowLeft className="w-3.5 h-3.5" weight="bold" /> 이전으로
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <footer className="pb-6 pt-2 text-center">
        <span className="text-[10px] text-label-tertiary">v{__APP_VERSION__}</span>
      </footer>
    </div>
  );
}

// ── GatemanPanel ──────────────────────────────────────────────────────────────

const GATE_CFG = {
  required:    { borderCls: 'border-acc-red',   label: '필수',   textCls: 'text-acc-red' },
  conditional: { borderCls: 'border-acc-amber', label: '조건부', textCls: 'text-acc-amber' },
  info:        { borderCls: 'border-acc-blue',  label: '참고',   textCls: 'text-acc-blue' },
};

function GatemanPanel({
  gates,
  title = '체크리스트',
}: {
  gates: GateItem[];
  title?: string;
}) {
  return (
    <div className="ios-card rounded-2xl p-4 space-y-1.5">
      <div className="flex items-center gap-1.5 mb-2">
        <ShieldCheck className="w-3.5 h-3.5 text-label-tertiary flex-shrink-0" />
        <span className="text-[10px] font-semibold text-label-tertiary uppercase tracking-wider">{title}</span>
      </div>
      {gates.map((g, i) => {
        const cfg = GATE_CFG[g.level];
        return (
          <div key={i} className="flex gap-2.5 items-start">
            <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
              g.level === 'required' ? 'bg-acc-red' : g.level === 'conditional' ? 'bg-acc-amber' : 'bg-acc-blue'
            }`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`text-xs font-semibold ${cfg.textCls}`}>{g.label}</span>
                <span className="text-[9px] font-bold bg-fill-secondary text-label-tertiary px-1 py-0.5 rounded">{cfg.label}</span>
                {g.condition && <span className="text-[9px] text-label-tertiary">({g.condition})</span>}
              </div>
              <p className="text-[11px] text-label-secondary mt-0.5 leading-relaxed">{g.desc}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
