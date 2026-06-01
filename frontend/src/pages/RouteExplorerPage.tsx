import { useMemo, useState } from 'react';
import { ArrowRight, Award, Bitcoin, ChevronDown, RefreshCw, Shield, TrendingDown, Zap } from 'lucide-react';

import { api } from '../lib/api';
import { fmtEx } from '../lib/exchangeNames';
import { formatFeeKrw, formatPercent, formatSats } from '../lib/formatBtc';
import type { CheapestPathEntry, CheapestPathResponse, TickerRow } from '../types';

// ── Types ──────────────────────────────────────────────────────────────

type Phase = 'input' | 'loading' | 'exchange' | 'method' | 'result';

interface ExchangeOption {
  exchange: string;
  best: CheapestPathEntry;
}

interface MethodGroup {
  id: string;
  label: string;
  sublabel: string;
  isLightning: boolean;
  best: CheapestPathEntry;
  paths: CheapestPathEntry[];
}

// ── Constants ───────────────────────────────────────────────────────────

const METHOD_META: Record<string, { label: string; sublabel: string; isLightning: boolean }> = {
  usdt_onchain:   { label: 'USDT 경유 온체인',    sublabel: '바이낸스 → BTC 온체인 출금',         isLightning: false },
  usdt_lightning: { label: 'USDT 경유 Lightning', sublabel: '바이낸스 → BTC ⚡ Lightning 즉시 정산', isLightning: true  },
  btc_direct:     { label: 'BTC 직접 출금',       sublabel: '국내 거래소 BTC → 온체인 출금',       isLightning: false },
};
const METHOD_ORDER = ['usdt_onchain', 'usdt_lightning', 'btc_direct'];

// ── Main Page ───────────────────────────────────────────────────────────

export function RouteExplorerPage() {
  const [phase, setPhase]               = useState<Phase>('input');
  const [amountInput, setAmountInput]   = useState('100');
  const [amountUnit, setAmountUnit]     = useState<'만원' | '억원'>('만원');
  const [data, setData]                 = useState<CheapestPathResponse | null>(null);
  const [tickers, setTickers]           = useState<TickerRow[]>([]);
  const [selectedExchange, setSelectedExchange] = useState<string | null>(null);
  const [selectedMethod, setSelectedMethod]     = useState<string | null>(null);
  const [error, setError]               = useState<string | null>(null);
  const [showBreakdown, setShowBreakdown]       = useState(false);

  const amountKrw = parseFloat(amountInput || '0') * (amountUnit === '만원' ? 10_000 : 100_000_000);

  // Domestic BTC/KRW price per exchange from tickers
  const domesticBtcPrices = useMemo(() => {
    const prices: Record<string, number> = {};
    for (const t of tickers) {
      if (t.currency === 'KRW' && t.price > 0 && t.pair?.includes('BTC')) {
        prices[t.exchange] = t.price;
      }
    }
    return prices;
  }, [tickers]);

  const globalBtcKrw = data ? data.global_btc_price_usd * data.usd_krw_rate : 0;

  function kimchiPct(exchange: string): number | null {
    const d = domesticBtcPrices[exchange];
    if (!d || !globalBtcKrw) return null;
    return ((d - globalBtcKrw) / globalBtcKrw) * 100;
  }

  // Exchanges sorted by best BTC received
  const availableExchanges = useMemo((): ExchangeOption[] => {
    if (!data) return [];
    const map = new Map<string, CheapestPathEntry[]>();
    for (const p of data.all_paths) {
      const arr = map.get(p.korean_exchange) ?? [];
      arr.push(p);
      map.set(p.korean_exchange, arr);
    }
    return [...map.entries()]
      .map(([exchange, paths]) => ({
        exchange,
        best: paths.reduce((a, b) => (a.btc_received ?? 0) > (b.btc_received ?? 0) ? a : b),
      }))
      .sort((a, b) => (b.best.btc_received ?? 0) - (a.best.btc_received ?? 0));
  }, [data]);

  // Method groups for selected exchange
  const methodGroups = useMemo((): MethodGroup[] => {
    if (!data || !selectedExchange) return [];
    const paths = data.all_paths.filter(p => p.korean_exchange === selectedExchange);
    const map = new Map<string, CheapestPathEntry[]>();
    for (const p of paths) {
      const key =
        p.transfer_coin === 'BTC'           ? 'btc_direct'
        : p.global_exit_mode === 'lightning' ? 'usdt_lightning'
        : 'usdt_onchain';
      const arr = map.get(key) ?? [];
      arr.push(p);
      map.set(key, arr);
    }
    return METHOD_ORDER.filter(id => map.has(id)).map(id => {
      const pts = map.get(id)!;
      const meta = METHOD_META[id];
      const best = pts.reduce((a, b) => (a.btc_received ?? 0) > (b.btc_received ?? 0) ? a : b);
      return { id, ...meta, best, paths: pts };
    });
  }, [data, selectedExchange]);

  const bestPath = useMemo((): CheapestPathEntry | null =>
    selectedMethod ? (methodGroups.find(g => g.id === selectedMethod)?.best ?? null) : null,
  [selectedMethod, methodGroups]);

  // Rank among all paths by btc_received (descending), 1-indexed
  const rank = useMemo(() => {
    if (!data || !bestPath) return null;
    const sorted = [...data.all_paths].sort((a, b) => (b.btc_received ?? 0) - (a.btc_received ?? 0));
    const idx = sorted.findIndex(p => p.path_id === bestPath.path_id);
    return idx >= 0 ? idx + 1 : null;
  }, [data, bestPath]);

  // Preservation rate: (BTC received × global BTC price) / invested KRW × 100
  const preservationRate = useMemo(() => {
    if (!bestPath || !data?.amount_krw || !globalBtcKrw) return null;
    return ((bestPath.btc_received ?? 0) * globalBtcKrw / data.amount_krw) * 100;
  }, [bestPath, data, globalBtcKrw]);

  // Kimchi premium display: raw ±% so sign is always correct
  const kimchiDisplay = useMemo(() => {
    if (!selectedExchange || !selectedMethod) return '-';
    const kp = kimchiPct(selectedExchange);
    if (kp === null) return '-';
    const sign = kp >= 0 ? '+' : '';
    return `${sign}${kp.toFixed(1)}%`;
  }, [selectedExchange, selectedMethod, domesticBtcPrices, globalBtcKrw]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSearch() {
    if (!amountKrw || amountKrw < 10_000) return;
    setPhase('loading');
    setSelectedExchange(null);
    setSelectedMethod(null);
    setError(null);
    setShowBreakdown(false);
    try {
      const [pathRes, tickerRes] = await Promise.all([
        api.getCheapestPath({ mode: 'buy', amountKrw, globalExchange: 'binance' }),
        api.getTickers().catch(() => ({ last_run: null, items: [] as TickerRow[] })),
      ]);
      setData(pathRes);
      setTickers(tickerRes.items);
      setPhase('exchange');
    } catch (e) {
      setError(e instanceof Error ? e.message : '데이터 로드 오류');
      setPhase('input');
    }
  }

  function handleExchangeSelect(exchange: string) {
    setSelectedExchange(exchange);
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
    setSelectedExchange(null);
    setSelectedMethod(null);
    setData(null);
    setError(null);
  }

  return (
    <div className="min-h-screen bg-dark-500 text-bnb-text">

      {/* ── Header ── */}
      <header className="sticky top-0 z-10 bg-dark-400 border-b border-dark-200">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bitcoin className="w-5 h-5 text-brand-500" />
            <span className="font-semibold text-sm">BTC 출금 경로 탐색</span>
          </div>
          {data && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1 text-xs text-bnb-muted hover:text-bnb-text transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              초기화
            </button>
          )}
        </div>

        {/* Breadcrumb path */}
        {phase !== 'input' && phase !== 'loading' && (
          <div className="max-w-xl mx-auto px-4 pb-2">
            <Breadcrumb
              steps={[
                { done: true,              label: `₩${amountInput}${amountUnit}` },
                { done: !!selectedExchange, label: selectedExchange ? fmtEx(selectedExchange) : '거래소' },
                { done: !!selectedMethod,   label: selectedMethod ? (METHOD_META[selectedMethod]?.label.split(' ')[0] ?? '경로') : '경로' },
                { done: phase === 'result', label: rank != null ? `#${rank}` : '결과' },
              ]}
            />
          </div>
        )}
      </header>

      <main className="max-w-xl mx-auto px-4 py-6 space-y-4">

        {/* ── Step 0: Amount Input ── */}
        <Card dimmed={phase !== 'input' && phase !== 'loading'}>
          <p className="text-xs text-bnb-muted mb-3">투자 금액</p>
          <div className="flex items-center gap-3">
            <span className="text-brand-500 text-xl font-bold">₩</span>
            <input
              type="number"
              value={amountInput}
              onChange={e => setAmountInput(e.target.value)}
              disabled={phase !== 'input'}
              className="flex-1 bg-transparent text-2xl font-bold text-bnb-text outline-none placeholder:text-dark-100 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              placeholder="100"
              min="1"
            />
            <div className="flex gap-1">
              {(['만원', '억원'] as const).map(u => (
                <button
                  key={u}
                  onClick={() => setAmountUnit(u)}
                  disabled={phase !== 'input'}
                  className={`text-xs px-2 py-1 rounded transition-all ${
                    amountUnit === u
                      ? 'bg-brand-500 text-dark-500 font-bold'
                      : 'text-bnb-muted hover:text-bnb-text'
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-bnb-muted mt-1">= ₩{(amountKrw || 0).toLocaleString('ko-KR')}</p>

          {phase === 'input' && (
            <button
              onClick={handleSearch}
              disabled={!amountKrw || amountKrw < 10_000}
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
            <p className="text-bnb-muted text-sm">경로 탐색 중...</p>
            <div className="flex gap-1.5">
              {[0, 1, 2].map(i => (
                <span
                  key={i}
                  className="w-2 h-2 rounded-full bg-brand-500 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-bnb-red text-sm text-center">{error}</p>}

        {/* ── Step 1: Exchange Selection ── */}
        {(phase === 'exchange' || phase === 'method' || phase === 'result') && (
          <Card dimmed={phase !== 'exchange'} animate>
            <SectionHeader
              label="국내 거래소"
              done={!!selectedExchange}
              onEdit={phase !== 'exchange' ? () => { setSelectedMethod(null); setPhase('exchange'); } : undefined}
            />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
              {availableExchanges.map(({ exchange, best }) => (
                <ExchangeCard
                  key={exchange}
                  exchange={exchange}
                  best={best}
                  kimchiPctVal={kimchiPct(exchange)}
                  selected={selectedExchange === exchange}
                  onClick={() => handleExchangeSelect(exchange)}
                />
              ))}
            </div>
          </Card>
        )}

        {/* ── Step 2: Method Selection ── */}
        {(phase === 'method' || phase === 'result') && selectedExchange && (
          <Card dimmed={phase !== 'method'} animate>
            <SectionHeader
              label="출금 경로"
              done={!!selectedMethod}
              onEdit={phase !== 'method' ? () => setPhase('method') : undefined}
            />
            <div className="space-y-2 mt-3">
              {methodGroups.map(group => (
                <MethodCard
                  key={group.id}
                  group={group}
                  selected={selectedMethod === group.id}
                  onClick={() => handleMethodSelect(group.id)}
                />
              ))}
            </div>
          </Card>
        )}

        {/* ── Step 3: Result ── */}
        {phase === 'result' && bestPath && data && rank != null && (
          <Card animate>
            <SectionHeader label="결과" done />
            <div className="mt-3 space-y-3">

              {/* Rank banner */}
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-brand-500/20 border border-brand-500/30">
                <div className="flex items-center gap-2">
                  <Award className="w-4 h-4 text-brand-500" />
                  <span className="text-brand-400 font-bold text-sm">
                    #{rank} / {data.all_paths.length}개 경로
                  </span>
                </div>
                <span className="text-xs text-brand-600">
                  {rank === 1 ? '최적 경로' : `상위 ${Math.ceil(rank / data.all_paths.length * 100)}%`}
                </span>
              </div>

              {/* BTC received */}
              <div className="text-center py-4 border-b border-dark-200">
                <div className="text-4xl font-bold text-bnb-text font-data">
                  {formatSats(bestPath.btc_received ?? 0)}
                </div>
                <div className="text-sm text-bnb-muted mt-1">수령 BTC</div>
              </div>

              {/* Metrics grid */}
              <div className="grid grid-cols-3 gap-2">
                <Metric
                  icon={<TrendingDown className="w-4 h-4 text-bnb-red" />}
                  label="수수료율"
                  value={formatPercent(bestPath.fee_pct)}
                  color="text-bnb-red"
                />
                <Metric
                  icon={<Shield className="w-4 h-4 text-bnb-green" />}
                  label="보전율"
                  value={preservationRate != null ? `${preservationRate.toFixed(2)}%` : '-'}
                  color="text-bnb-green"
                />
                <Metric
                  icon={<Bitcoin className="w-4 h-4 text-brand-500" />}
                  label="김치 프리미엄"
                  value={kimchiDisplay}
                  color="text-brand-400"
                />
              </div>

              {/* Fee breakdown toggle */}
              <button
                onClick={() => setShowBreakdown(v => !v)}
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
                      <span className="text-bnb-text font-medium font-data">{formatFeeKrw(c.amount_krw)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm font-bold border-t border-dark-200 pt-2">
                    <span className="text-bnb-text">총 수수료</span>
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

// ── Shared Sub-components ──────────────────────────────────────────────

function Card({ children, dimmed, animate }: { children: React.ReactNode; dimmed?: boolean; animate?: boolean }) {
  return (
    <div className={`bg-dark-300 border border-dark-200 rounded-xl p-4 transition-opacity duration-300 ${dimmed ? 'opacity-40 pointer-events-none' : ''} ${animate ? 'animate-fade-in-up' : ''}`}>
      {children}
    </div>
  );
}

function SectionHeader({ label, done, onEdit }: { label: string; done: boolean; onEdit?: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className={`w-1.5 h-4 rounded-full transition-colors ${done ? 'bg-brand-500' : 'bg-dark-100'}`} />
        <span className="text-xs font-semibold text-bnb-muted uppercase tracking-wider">{label}</span>
      </div>
      {onEdit && (
        <button onClick={onEdit} className="text-xs text-brand-500 hover:text-brand-400 transition-colors">
          변경
        </button>
      )}
    </div>
  );
}

function Breadcrumb({ steps }: { steps: { done: boolean; label: string }[] }) {
  return (
    <div className="flex items-center gap-1 text-xs overflow-x-auto">
      {steps.map((s, i) => (
        <span key={i} className="flex items-center gap-1 whitespace-nowrap">
          <span className={s.done ? 'text-brand-500 font-medium' : 'text-bnb-muted'}>{s.label}</span>
          {i < steps.length - 1 && (
            <ArrowRight className={`w-3 h-3 flex-shrink-0 ${s.done ? 'text-brand-500' : 'text-dark-100'}`} />
          )}
        </span>
      ))}
    </div>
  );
}

interface ExchangeCardProps {
  exchange: string;
  best: CheapestPathEntry;
  kimchiPctVal: number | null;
  selected: boolean;
  onClick: () => void;
}

function ExchangeCard({ exchange, best, kimchiPctVal, selected, onClick }: ExchangeCardProps) {
  return (
    <button
      onClick={onClick}
      className={`text-left p-3 rounded-lg border transition-all active:scale-[0.97] ${
        selected
          ? 'border-brand-500 bg-brand-500/10'
          : 'border-dark-200 hover:border-dark-100 hover:bg-dark-200/40'
      }`}
    >
      <div className="font-semibold text-sm text-bnb-text">{fmtEx(exchange)}</div>
      <div className="text-xs text-bnb-muted mt-0.5 font-data">{formatSats(best.btc_received ?? 0)}</div>
      {kimchiPctVal != null && (
        <div className={`text-xs mt-1 font-medium ${
          kimchiPctVal > 3 ? 'text-bnb-red' : kimchiPctVal > 1 ? 'text-brand-400' : 'text-bnb-green'
        }`}>
          {kimchiPctVal >= 0 ? `프리미엄 +${kimchiPctVal.toFixed(1)}%` : `역프리미엄 ${kimchiPctVal.toFixed(1)}%`}
        </div>
      )}
    </button>
  );
}

function MethodCard({ group, selected, onClick }: { group: MethodGroup; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded-lg border transition-all active:scale-[0.99] ${
        selected
          ? 'border-brand-500 bg-brand-500/10'
          : 'border-dark-200 hover:border-dark-100 hover:bg-dark-200/40'
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            {group.isLightning && <Zap className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />}
            <span className="font-semibold text-sm text-bnb-text">{group.label}</span>
          </div>
          <div className="text-xs text-bnb-muted mt-0.5">{group.sublabel}</div>
        </div>
        <div className="text-right ml-3 flex-shrink-0">
          <div className="font-bold text-sm text-bnb-text font-data">{formatSats(group.best.btc_received ?? 0)}</div>
          <div className="text-xs text-bnb-muted">수수료 {formatPercent(group.best.fee_pct)}</div>
        </div>
      </div>
    </button>
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
