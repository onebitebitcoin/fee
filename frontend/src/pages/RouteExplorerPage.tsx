import { useMemo, useState } from 'react';
import {
  ArrowRight, Award, Bitcoin, ChevronDown, Globe,
  MapPin, RefreshCw, Shield, TrendingDown, Zap,
} from 'lucide-react';

import { api } from '../lib/api';
import { fmtEx } from '../lib/exchangeNames';
import { formatFeeKrw, formatPercent, formatSats } from '../lib/formatBtc';
import type { CheapestPathEntry, CheapestPathResponse, TickerRow } from '../types';

// ── Constants ─────────────────────────────────────────────────────────

const GLOBAL_EXCHANGES = ['binance', 'okx', 'bybit', 'bitget', 'kraken', 'coinbase'] as const;
type GlobalExchange = typeof GLOBAL_EXCHANGES[number];

type Phase = 'input' | 'loading' | 'domestic' | 'global' | 'method' | 'result';

interface AllData {
  byGlobal: Record<string, CheapestPathResponse>;
  tickers: TickerRow[];
}

interface MethodGroup {
  id: 'usdt_onchain' | 'usdt_lightning' | 'btc_direct';
  label: string;
  sublabel: string;
  isLightning: boolean;
  best: CheapestPathEntry;
}

const METHOD_META: Record<string, { label: string; sublabel: string; isLightning: boolean }> = {
  usdt_onchain:   { label: 'USDT 경유 온체인',    sublabel: '국내 USDT → 해외 BTC 매수 → 온체인 출금',       isLightning: false },
  usdt_lightning: { label: 'USDT 경유 Lightning', sublabel: '국내 USDT → 해외 BTC 매수 → ⚡ LN 출금 → 스왑', isLightning: true  },
  btc_direct:     { label: 'BTC 직접 출금',       sublabel: '국내 거래소에서 BTC 직접 온체인 출금',           isLightning: false },
};

// ── Main Page ─────────────────────────────────────────────────────────

export function RouteExplorerPage() {
  const [phase, setPhase]                   = useState<Phase>('input');
  const [amountInput, setAmountInput]       = useState('100');
  const [amountUnit, setAmountUnit]         = useState<'만원' | '억원'>('만원');
  const [allData, setAllData]               = useState<AllData | null>(null);
  const [selectedDomestic, setSelectedDomestic] = useState<string | null>(null);
  const [selectedGlobal, setSelectedGlobal]     = useState<GlobalExchange | null>(null);
  const [selectedMethod, setSelectedMethod]     = useState<string | null>(null);
  const [showBreakdown, setShowBreakdown]       = useState(false);
  const [error, setError]                   = useState<string | null>(null);

  const amountKrw = parseFloat(amountInput || '0') * (amountUnit === '만원' ? 10_000 : 100_000_000);

  // Domestic BTC/KRW prices from tickers
  const domesticBtcPrices = useMemo(() => {
    if (!allData) return {} as Record<string, number>;
    const prices: Record<string, number> = {};
    for (const t of allData.tickers) {
      if (t.currency === 'KRW' && t.price > 0 && t.pair?.includes('BTC')) {
        prices[t.exchange] = t.price;
      }
    }
    return prices;
  }, [allData]);

  // Global BTC/KRW price for the selected global exchange
  const globalBtcKrw = useMemo(() => {
    if (!selectedGlobal || !allData) return 0;
    const d = allData.byGlobal[selectedGlobal];
    return d ? d.global_btc_price_usd * d.usd_krw_rate : 0;
  }, [selectedGlobal, allData]);

  function kimchiPct(exchange: string): number | null {
    const d = domesticBtcPrices[exchange];
    const g = (() => {
      // Use binance as reference for domestic exchange card (global-agnostic)
      const ref = allData?.byGlobal['binance'];
      return ref ? ref.global_btc_price_usd * ref.usd_krw_rate : 0;
    })();
    if (!d || !g) return null;
    return ((d - g) / g) * 100;
  }

  // Best BTC received per domestic exchange across ALL global exchanges
  const domesticOptions = useMemo(() => {
    if (!allData) return [] as { exchange: string; bestBtc: number; bestGlobal: string }[];
    const map = new Map<string, { bestBtc: number; bestGlobal: string }>();
    for (const [global, data] of Object.entries(allData.byGlobal)) {
      for (const p of data.all_paths) {
        const cur = map.get(p.korean_exchange);
        if (!cur || (p.btc_received ?? 0) > cur.bestBtc) {
          map.set(p.korean_exchange, { bestBtc: p.btc_received ?? 0, bestGlobal: global });
        }
      }
    }
    return [...map.entries()]
      .map(([exchange, v]) => ({ exchange, ...v }))
      .sort((a, b) => b.bestBtc - a.bestBtc);
  }, [allData]);

  // Global exchange options for the selected domestic exchange
  const globalOptions = useMemo(() => {
    if (!allData || !selectedDomestic) return [] as { exchange: GlobalExchange; bestBtc: number; hasLightning: boolean }[];
    return GLOBAL_EXCHANGES
      .map(g => {
        const paths = (allData.byGlobal[g]?.all_paths ?? []).filter(p => p.korean_exchange === selectedDomestic);
        if (paths.length === 0) return null;
        const best = paths.reduce((a, b) => (a.btc_received ?? 0) > (b.btc_received ?? 0) ? a : b);
        const hasLightning = paths.some(p => p.global_exit_mode === 'lightning');
        return { exchange: g, bestBtc: best.btc_received ?? 0, hasLightning };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.bestBtc - a.bestBtc);
  }, [allData, selectedDomestic]);

  // Method groups for the selected domestic + global combo
  const methodGroups = useMemo((): MethodGroup[] => {
    if (!allData || !selectedDomestic || !selectedGlobal) return [];
    const paths = (allData.byGlobal[selectedGlobal]?.all_paths ?? [])
      .filter(p => p.korean_exchange === selectedDomestic);
    const map = new Map<string, CheapestPathEntry[]>();
    for (const p of paths) {
      const key: string =
        p.transfer_coin === 'BTC'           ? 'btc_direct'
        : p.global_exit_mode === 'lightning' ? 'usdt_lightning'
        : 'usdt_onchain';
      const arr = map.get(key) ?? [];
      arr.push(p);
      map.set(key, arr);
    }
    const order = ['usdt_onchain', 'usdt_lightning', 'btc_direct'];
    return order
      .filter(id => map.has(id))
      .map(id => {
        const pts = map.get(id)!;
        const meta = METHOD_META[id];
        const best = pts.reduce((a, b) => (a.btc_received ?? 0) > (b.btc_received ?? 0) ? a : b);
        return { id: id as MethodGroup['id'], ...meta, best };
      });
  }, [allData, selectedDomestic, selectedGlobal]);

  const bestPath = useMemo((): CheapestPathEntry | null =>
    selectedMethod ? (methodGroups.find(g => g.id === selectedMethod)?.best ?? null) : null,
  [selectedMethod, methodGroups]);

  // Rank among ALL paths across all global exchanges
  const { rank, total } = useMemo(() => {
    if (!allData || !bestPath) return { rank: null, total: 0 };
    const all: CheapestPathEntry[] = Object.values(allData.byGlobal).flatMap(d => d.all_paths);
    const sorted = [...all].sort((a, b) => (b.btc_received ?? 0) - (a.btc_received ?? 0));
    const idx = sorted.findIndex(p =>
      p.korean_exchange === bestPath.korean_exchange &&
      p.global_exit_mode === bestPath.global_exit_mode &&
      p.transfer_coin === bestPath.transfer_coin &&
      Math.abs((p.btc_received ?? 0) - (bestPath.btc_received ?? 0)) < 1e-9,
    );
    return { rank: idx >= 0 ? idx + 1 : null, total: sorted.length };
  }, [allData, bestPath]);

  const preservationRate = useMemo(() => {
    if (!bestPath || !amountKrw || !globalBtcKrw) return null;
    return ((bestPath.btc_received ?? 0) * globalBtcKrw / amountKrw) * 100;
  }, [bestPath, amountKrw, globalBtcKrw]);

  const kimchiDisplay = useMemo(() => {
    if (!selectedDomestic || !selectedGlobal || !allData) return '-';
    const d = domesticBtcPrices[selectedDomestic];
    const g = globalBtcKrw;
    if (!d || !g) return '-';
    const kp = ((d - g) / g) * 100;
    return kp >= 0 ? `+${kp.toFixed(1)}%` : `${kp.toFixed(1)}%`;
  }, [selectedDomestic, selectedGlobal, allData, domesticBtcPrices, globalBtcKrw]);

  async function handleSearch() {
    if (!amountKrw || amountKrw < 10_000) return;
    setPhase('loading');
    setSelectedDomestic(null);
    setSelectedGlobal(null);
    setSelectedMethod(null);
    setAllData(null);
    setError(null);
    setShowBreakdown(false);
    try {
      const [tickerRes, ...pathResults] = await Promise.all([
        api.getTickers().catch(() => ({ last_run: null, items: [] as TickerRow[] })),
        ...GLOBAL_EXCHANGES.map(g =>
          api.getCheapestPath({ mode: 'buy', amountKrw, globalExchange: g })
            .catch(() => null),
        ),
      ]);
      const byGlobal: Record<string, CheapestPathResponse> = {};
      GLOBAL_EXCHANGES.forEach((g, i) => {
        const r = pathResults[i];
        if (r && !r.error) byGlobal[g] = r;
      });
      if (Object.keys(byGlobal).length === 0) throw new Error('모든 거래소 조회 실패');
      setAllData({ byGlobal, tickers: tickerRes.items });
      setPhase('domestic');
    } catch (e) {
      setError(e instanceof Error ? e.message : '데이터 로드 오류');
      setPhase('input');
    }
  }

  function handleDomesticSelect(exchange: string) {
    setSelectedDomestic(exchange);
    setSelectedGlobal(null);
    setSelectedMethod(null);
    setShowBreakdown(false);
    setPhase('global');
  }

  function handleGlobalSelect(exchange: GlobalExchange) {
    setSelectedGlobal(exchange);
    setSelectedMethod(null);
    setShowBreakdown(false);
    setPhase('method');
  }

  function handleMethodSelect(id: string) {
    setSelectedMethod(id);
    setPhase('result');
  }

  function handleReset() {
    setPhase('input');
    setSelectedDomestic(null);
    setSelectedGlobal(null);
    setSelectedMethod(null);
    setAllData(null);
    setError(null);
  }

  const showSteps = phase !== 'input' && phase !== 'loading';

  return (
    <div className="min-h-screen bg-dark-500 text-bnb-text">

      {/* ── Header ── */}
      <header className="sticky top-0 z-10 bg-dark-400 border-b border-dark-200">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bitcoin className="w-5 h-5 text-brand-500" />
            <span className="font-semibold text-sm">BTC 출금 경로 탐색</span>
          </div>
          {allData && (
            <button onClick={handleReset} className="flex items-center gap-1 text-xs text-bnb-muted hover:text-bnb-text transition-colors">
              <RefreshCw className="w-3 h-3" />
              초기화
            </button>
          )}
        </div>

        {/* Breadcrumb */}
        {showSteps && (
          <div className="max-w-xl mx-auto px-4 pb-2">
            <Breadcrumb steps={[
              { done: true,                label: `₩${amountInput}${amountUnit}` },
              { done: !!selectedDomestic,  label: selectedDomestic ? fmtEx(selectedDomestic) : '출발 거래소' },
              { done: !!selectedGlobal,    label: selectedGlobal ? fmtEx(selectedGlobal) : '경유 거래소' },
              { done: !!selectedMethod,    label: selectedMethod ? METHOD_META[selectedMethod]?.label.split(' ')[0] : '출금 방법' },
              { done: phase === 'result',  label: rank != null ? `#${rank}` : '결과' },
            ]} />
          </div>
        )}
      </header>

      <main className="max-w-xl mx-auto px-4 py-6 space-y-4">

        {/* ── Step 0: Amount Input ── */}
        <Card dimmed={showSteps}>
          <p className="text-xs text-bnb-muted mb-3">투자 금액</p>
          <div className="flex items-center gap-3">
            <span className="text-brand-500 text-xl font-bold">₩</span>
            <input
              type="number"
              value={amountInput}
              onChange={e => setAmountInput(e.target.value)}
              disabled={showSteps}
              className="flex-1 bg-transparent text-2xl font-bold text-bnb-text outline-none placeholder:text-dark-100 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              placeholder="100"
              min="1"
            />
            <div className="flex gap-1">
              {(['만원', '억원'] as const).map(u => (
                <button key={u} onClick={() => setAmountUnit(u)} disabled={showSteps}
                  className={`text-xs px-2 py-1 rounded transition-all ${amountUnit === u ? 'bg-brand-500 text-dark-500 font-bold' : 'text-bnb-muted hover:text-bnb-text'}`}
                >
                  {u}
                </button>
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
        </Card>

        {/* ── Loading ── */}
        {phase === 'loading' && (
          <div className="animate-fade-in-up flex flex-col items-center gap-5 py-12">
            <div className="relative">
              <Bitcoin className="w-12 h-12 text-brand-500 animate-pulse" />
              <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-brand-500">
                <span className="absolute inset-0 rounded-full bg-brand-400 animate-live-ping" />
              </span>
            </div>
            <p className="text-bnb-muted text-sm">6개 글로벌 거래소 실시간 조회 중...</p>
            <div className="flex gap-1.5">
              {[0, 1, 2].map(i => (
                <span key={i} className="w-2 h-2 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-bnb-red text-sm text-center">{error}</p>}

        {/* ── Step 1: Domestic Exchange ── */}
        {showSteps && (
          <Card dimmed={phase !== 'domestic'} animate>
            <SectionHeader
              icon={<MapPin className="w-3.5 h-3.5" />}
              label="출발 거래소 (국내)"
              done={!!selectedDomestic}
              onEdit={phase !== 'domestic' ? () => { setSelectedGlobal(null); setSelectedMethod(null); setPhase('domestic'); } : undefined}
            />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
              {domesticOptions.map(({ exchange, bestBtc }) => {
                const kp = kimchiPct(exchange);
                return (
                  <button key={exchange} onClick={() => handleDomesticSelect(exchange)}
                    className={`text-left p-3 rounded-lg border transition-all active:scale-[0.97] ${
                      selectedDomestic === exchange ? 'border-brand-500 bg-brand-500/10' : 'border-dark-200 hover:border-dark-100 hover:bg-dark-200/40'
                    }`}
                  >
                    <div className="font-semibold text-sm">{fmtEx(exchange)}</div>
                    <div className="text-xs text-bnb-muted mt-0.5 font-data">{formatSats(bestBtc)}</div>
                    {kp != null && (
                      <div className={`text-xs mt-1 font-medium ${kp > 3 ? 'text-bnb-red' : kp > 1 ? 'text-brand-400' : 'text-bnb-green'}`}>
                        {kp >= 0 ? `프리미엄 +${kp.toFixed(1)}%` : `역프리미엄 ${kp.toFixed(1)}%`}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </Card>
        )}

        {/* ── Step 2: Global Exchange ── */}
        {(phase === 'global' || phase === 'method' || phase === 'result') && selectedDomestic && (
          <Card dimmed={phase !== 'global'} animate>
            <SectionHeader
              icon={<Globe className="w-3.5 h-3.5" />}
              label="경유 거래소 (해외)"
              done={!!selectedGlobal}
              onEdit={phase !== 'global' ? () => { setSelectedMethod(null); setPhase('global'); } : undefined}
            />
            <div className="space-y-2 mt-3">
              {globalOptions.map(({ exchange, bestBtc, hasLightning }) => (
                <button key={exchange} onClick={() => handleGlobalSelect(exchange)}
                  className={`w-full text-left p-3 rounded-lg border transition-all active:scale-[0.99] ${
                    selectedGlobal === exchange ? 'border-brand-500 bg-brand-500/10' : 'border-dark-200 hover:border-dark-100 hover:bg-dark-200/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-sm">{fmtEx(exchange)}</span>
                        {hasLightning && <Zap className="w-3 h-3 text-yellow-400" />}
                      </div>
                      <div className="text-xs text-bnb-muted mt-0.5">
                        {hasLightning ? 'Lightning 출금 지원' : '온체인 출금'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-sm font-data">{formatSats(bestBtc)}</div>
                      <div className="text-xs text-bnb-muted">최대 수령</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </Card>
        )}

        {/* ── Step 3: Exit Method ── */}
        {(phase === 'method' || phase === 'result') && selectedGlobal && (
          <Card dimmed={phase !== 'method'} animate>
            <SectionHeader
              icon={<ArrowRight className="w-3.5 h-3.5" />}
              label="출금 방법"
              done={!!selectedMethod}
              onEdit={phase !== 'method' ? () => setPhase('method') : undefined}
            />
            <div className="space-y-2 mt-3">
              {methodGroups.map(group => (
                <button key={group.id} onClick={() => handleMethodSelect(group.id)}
                  className={`w-full text-left p-4 rounded-lg border transition-all active:scale-[0.99] ${
                    selectedMethod === group.id ? 'border-brand-500 bg-brand-500/10' : 'border-dark-200 hover:border-dark-100 hover:bg-dark-200/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-1.5">
                        {group.isLightning && <Zap className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />}
                        <span className="font-semibold text-sm">{group.label}</span>
                      </div>
                      <div className="text-xs text-bnb-muted mt-0.5">{group.sublabel}</div>
                    </div>
                    <div className="text-right ml-3 flex-shrink-0">
                      <div className="font-bold text-sm font-data">{formatSats(group.best.btc_received ?? 0)}</div>
                      <div className="text-xs text-bnb-muted">수수료 {formatPercent(group.best.fee_pct)}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </Card>
        )}

        {/* ── Step 4: Result ── */}
        {phase === 'result' && bestPath && rank != null && (
          <Card animate>
            <SectionHeader icon={<Award className="w-3.5 h-3.5" />} label="결과" done />
            <div className="mt-3 space-y-3">

              {/* Rank banner */}
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-brand-500/20 border border-brand-500/30">
                <div className="flex items-center gap-2">
                  <Award className="w-4 h-4 text-brand-500" />
                  <span className="text-brand-400 font-bold text-sm">#{rank} / {total}개 경로</span>
                </div>
                <span className="text-xs text-brand-600">
                  {rank === 1 ? '최적 경로' : `상위 ${Math.ceil(rank / total * 100)}%`}
                </span>
              </div>

              {/* BTC received */}
              <div className="text-center py-4 border-b border-dark-200">
                <div className="text-4xl font-bold font-data">{formatSats(bestPath.btc_received ?? 0)}</div>
                <div className="text-sm text-bnb-muted mt-1">수령 BTC</div>
              </div>

              {/* Route summary */}
              <div className="flex items-center justify-center gap-1.5 text-xs text-bnb-muted">
                <span className="text-bnb-text font-medium">{fmtEx(selectedDomestic!)}</span>
                <ArrowRight className="w-3 h-3" />
                <span className="text-bnb-text font-medium">{fmtEx(selectedGlobal!)}</span>
                <ArrowRight className="w-3 h-3" />
                {selectedMethod === 'usdt_lightning' && <Zap className="w-3 h-3 text-yellow-400" />}
                <span className="text-bnb-text font-medium">개인 지갑</span>
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-3 gap-2">
                <Metric icon={<TrendingDown className="w-4 h-4 text-bnb-red" />} label="수수료율"
                  value={formatPercent(bestPath.fee_pct)} color="text-bnb-red" />
                <Metric icon={<Shield className="w-4 h-4 text-bnb-green" />} label="보전율"
                  value={preservationRate != null ? `${preservationRate.toFixed(2)}%` : '-'} color="text-bnb-green" />
                <Metric icon={<Bitcoin className="w-4 h-4 text-brand-500" />} label="김치 프리미엄"
                  value={kimchiDisplay} color="text-brand-400" />
              </div>

              {/* Breakdown toggle */}
              <button onClick={() => setShowBreakdown(v => !v)}
                className="w-full flex items-center justify-between text-xs text-bnb-muted hover:text-bnb-text transition-colors pt-2 border-t border-dark-200"
              >
                <span>수수료 내역 상세</span>
                <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showBreakdown ? 'rotate-180' : ''}`} />
              </button>

              {showBreakdown && bestPath.breakdown && (
                <div className="animate-fade-in-up space-y-2">
                  {bestPath.breakdown.components.map((c, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-bnb-muted">{c.label}</span>
                      <span className="font-medium font-data">{formatFeeKrw(c.amount_krw)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm font-bold border-t border-dark-200 pt-2">
                    <span>총 수수료</span>
                    <span className="text-bnb-red font-data">{formatFeeKrw(bestPath.total_fee_krw)}</span>
                  </div>
                </div>
              )}
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────

function Card({ children, dimmed, animate }: { children: React.ReactNode; dimmed?: boolean; animate?: boolean }) {
  return (
    <div className={`bg-dark-300 border border-dark-200 rounded-xl p-4 transition-opacity duration-300 ${dimmed ? 'opacity-40 pointer-events-none' : ''} ${animate ? 'animate-fade-in-up' : ''}`}>
      {children}
    </div>
  );
}

function SectionHeader({ icon, label, done, onEdit }: { icon: React.ReactNode; label: string; done: boolean; onEdit?: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className={`flex items-center justify-center w-5 h-5 rounded-full transition-colors ${done ? 'bg-brand-500 text-dark-500' : 'bg-dark-200 text-bnb-muted'}`}>
          {icon}
        </span>
        <span className="text-xs font-semibold text-bnb-muted uppercase tracking-wider">{label}</span>
      </div>
      {onEdit && (
        <button onClick={onEdit} className="text-xs text-brand-500 hover:text-brand-400 transition-colors">변경</button>
      )}
    </div>
  );
}

function Breadcrumb({ steps }: { steps: { done: boolean; label: string }[] }) {
  return (
    <div className="flex items-center gap-1 text-xs overflow-x-auto pb-0.5">
      {steps.map((s, i) => (
        <span key={i} className="flex items-center gap-1 whitespace-nowrap">
          <span className={s.done ? 'text-brand-500 font-medium' : 'text-bnb-muted'}>{s.label}</span>
          {i < steps.length - 1 && <ArrowRight className={`w-3 h-3 flex-shrink-0 ${s.done ? 'text-brand-500' : 'text-dark-100'}`} />}
        </span>
      ))}
    </div>
  );
}

function Metric({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="bg-dark-400 rounded-lg p-3 text-center">
      <div className="flex justify-center mb-1">{icon}</div>
      <div className={`font-bold text-sm ${color}`}>{value}</div>
      <div className="text-xs text-bnb-muted mt-0.5">{label}</div>
    </div>
  );
}
