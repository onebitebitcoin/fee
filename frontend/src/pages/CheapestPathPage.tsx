import { ArrowRight, ChevronDown, ChevronUp, Info, Search, ShieldAlert, TrendingUp } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

import { api } from '../lib/api';
import type { CheapestPathBreakdown, CheapestPathEntry, CheapestPathResponse } from '../types';

const DEFAULT_AMOUNT_KRW = 1000000;
const GLOBAL_EXCHANGE_OPTIONS = ['binance', 'okx', 'coinbase', 'kraken', 'bitget'];
const TOP_PATH_SORT_OPTIONS = [
  { value: 'lowest_fee_krw', label: 'TOTAL FEE ASC' },
  { value: 'lowest_fee_pct', label: 'FEE RATIO ASC' },
  { value: 'highest_btc', label: 'BTC OUTPUT DESC' },
] as const;

type TopPathSortOption = (typeof TOP_PATH_SORT_OPTIONS)[number]['value'];

function formatNumber(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits }).format(value);
}

function formatCurrency(value: number) {
  return `${formatNumber(value)} KRW`;
}

function formatBtc(value: number) {
  return value.toLocaleString('ko-KR', { maximumFractionDigits: 8 });
}

function formatPercent(value: number) {
  return `${value.toFixed(value >= 1 ? 2 : 3)}%`;
}

function getFeeTone(feePct: number) {
  if (feePct <= 0.5) return 'text-bnb-green';
  if (feePct <= 1.0) return 'text-sky-300';
  return 'text-bnb-red';
}

function getRouteStatus(index: number, feePct: number) {
  if (index === 0) return { label: 'optimal', className: 'border-bnb-green/40 bg-bnb-green/10 text-bnb-green' };
  if (feePct <= 1.0) return { label: 'monitor', className: 'border-sky-400/30 bg-sky-400/10 text-sky-300' };
  return { label: 'high cost', className: 'border-bnb-red/30 bg-bnb-red/10 text-bnb-red' };
}

function sortTopPaths(paths: CheapestPathEntry[], sortBy: TopPathSortOption) {
  const sorted = [...paths];
  sorted.sort((left, right) => {
    if (sortBy === 'lowest_fee_krw') {
      if (left.total_fee_krw !== right.total_fee_krw) return left.total_fee_krw - right.total_fee_krw;
      return right.btc_received - left.btc_received;
    }
    if (sortBy === 'lowest_fee_pct') {
      if (left.fee_pct !== right.fee_pct) return left.fee_pct - right.fee_pct;
      return left.total_fee_krw - right.total_fee_krw;
    }
    if (left.btc_received !== right.btc_received) return right.btc_received - left.btc_received;
    return left.total_fee_krw - right.total_fee_krw;
  });
  return sorted.slice(0, 5);
}

function FeeBreakdownRow({ breakdown }: { breakdown?: CheapestPathBreakdown | null }) {
  const [open, setOpen] = useState(false);
  if (!breakdown?.components?.length) return <span className="text-[11px] uppercase tracking-[0.24em] text-bnb-muted">No detail</span>;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.24em] text-sky-300 transition-colors hover:text-sky-200"
      >
        <Info size={11} />
        Fee Trace {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </button>
      {open && (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
          <table className="min-w-full text-xs">
            <tbody>
              {breakdown.components.map((component, index) => (
                <tr key={`${component.label}-${index}`} className="border-t border-white/10 first:border-t-0">
                  <td className="py-2 pr-4 text-bnb-text">{component.label}</td>
                  <td className="py-2 pr-4 text-bnb-muted">
                    {component.rate_pct != null ? `요율 ${formatPercent(component.rate_pct)}` : '고정'}
                    {component.amount_text ? ` · ${component.amount_text}` : ''}
                  </td>
                  <td className="py-2 text-right font-semibold text-sky-300">{formatCurrency(component.amount_krw)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function CheapestPathPage() {
  const [amountKrwInput, setAmountKrwInput] = useState(String(DEFAULT_AMOUNT_KRW));
  const [globalExchange, setGlobalExchange] = useState('binance');
  const [selectedKoreanExchange, setSelectedKoreanExchange] = useState('');
  const [topPathSort, setTopPathSort] = useState<TopPathSortOption>('lowest_fee_krw');
  const [data, setData] = useState<CheapestPathResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (requestParams: { amountKrw: number; globalExchange: string }) => {
    try {
      setError(null);
      setLoading(true);
      const response = await api.getCheapestPath(requestParams);
      if (response.error) {
        setData(response);
        setError(response.error);
        return;
      }
      setData(response);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : '최적 경로 조회에 실패했습니다.');
    } finally {
      setLoading(false);
      setSubmitting(false);
    }
  }, []);

  useEffect(() => {
    void load({ amountKrw: DEFAULT_AMOUNT_KRW, globalExchange: 'binance' });
  }, [load]);

  const topPaths = useMemo(() => (data ? sortTopPaths(data.all_paths ?? [], topPathSort) : []), [data, topPathSort]);
  const availableKoreanExchanges = useMemo(
    () => (data ? Array.from(new Set((data.all_paths ?? []).map((item) => item.korean_exchange))) : []),
    [data],
  );
  const selectedRoute = useMemo(() => {
    if (!data || !selectedKoreanExchange) return null;
    const rankIndex = data.all_paths.findIndex((item) => item.korean_exchange === selectedKoreanExchange);
    if (rankIndex < 0) return null;
    return { rank: rankIndex + 1, path: data.all_paths[rankIndex] };
  }, [data, selectedKoreanExchange]);

  useEffect(() => {
    if (!selectedKoreanExchange) return;
    if (!availableKoreanExchanges.includes(selectedKoreanExchange)) {
      setSelectedKoreanExchange('');
    }
  }, [availableKoreanExchanges, selectedKoreanExchange]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    await load({
      amountKrw: Math.max(Number(amountKrwInput) || DEFAULT_AMOUNT_KRW, 10000),
      globalExchange,
    });
  };

  const summaryCards = data && !error
    ? [
        { label: 'Evaluated Paths', value: `${formatNumber(data.total_paths_evaluated)} routes`, helper: '현재 계산에 포함된 후보 수' },
        { label: 'Best Total Fee', value: data.best_path ? formatCurrency(data.best_path.total_fee_krw) : 'N/A', helper: '최저 총 수수료 기준' },
        { label: 'Best Receiver', value: data.best_path ? data.best_path.korean_exchange.toUpperCase() : 'N/A', helper: data.best_path ? `${data.best_path.transfer_coin} / ${data.best_path.network}` : '활성 경로 없음' },
        { label: 'Suppressed Paths', value: `${formatNumber(data.disabled_paths.length)} routes`, helper: data.disabled_paths.length ? '점검/정지 경로 제외' : '비활성 경로 없음' },
      ]
    : [];

  const maxFeePct = Math.max(...topPaths.map((path) => path.fee_pct), 1);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.16),_transparent_32%),linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.96))] shadow-[0_24px_80px_rgba(2,6,23,0.45)]">
        <div className="border-b border-white/10 px-5 py-4 md:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.38em] text-sky-300">Cheapest Path Command</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white md:text-[2rem]">Dark route optimization dashboard</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-300">
                국내 거래소별 송금 경로를 실시간 비교하고, 가장 낮은 총 수수료 조합을 운영 대시보드 형태로 확인합니다.
              </p>
            </div>
            <div className="grid gap-2 text-[11px] uppercase tracking-[0.24em] text-slate-400 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                Source {data?.data_source ? `· ${data.data_source}` : ''}
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                Snapshot {data?.latest_scraping_time ?? 'standby'}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6 px-5 py-5 md:px-6 md:py-6">
          <form className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_240px_240px_240px_auto]" onSubmit={handleSubmit}>
            <label className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-[11px] font-medium uppercase tracking-[0.26em] text-slate-400">
              Capital Input
              <input
                type="number"
                min={10000}
                step={10000}
                value={amountKrwInput}
                onChange={(event) => setAmountKrwInput(event.target.value)}
                className="mt-3 w-full border-0 bg-transparent p-0 text-xl font-semibold tracking-tight text-white outline-none placeholder:text-slate-500"
              />
              <p className="mt-2 text-[11px] normal-case tracking-normal text-slate-500">최소 10,000 KRW</p>
            </label>

            <label className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-[11px] font-medium uppercase tracking-[0.26em] text-slate-400">
              Target Venue
              <select
                value={globalExchange}
                onChange={(event) => setGlobalExchange(event.target.value)}
                className="mt-3 w-full appearance-none border-0 bg-transparent p-0 text-base font-semibold uppercase tracking-[0.18em] text-white outline-none"
              >
                {GLOBAL_EXCHANGE_OPTIONS.map((option) => (
                  <option key={option} value={option} className="bg-slate-950 text-white">{option}</option>
                ))}
              </select>
              <p className="mt-2 text-[11px] normal-case tracking-normal text-slate-500">도착 해외 거래소</p>
            </label>

            <label className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-[11px] font-medium uppercase tracking-[0.26em] text-slate-400">
              Route Focus
              <select
                value={selectedKoreanExchange}
                onChange={(event) => setSelectedKoreanExchange(event.target.value)}
                className="mt-3 w-full appearance-none border-0 bg-transparent p-0 text-base font-semibold uppercase tracking-[0.18em] text-white outline-none"
              >
                <option value="" className="bg-slate-950 text-white">거래소 선택</option>
                {availableKoreanExchanges.map((exchange) => (
                  <option key={exchange} value={exchange} className="bg-slate-950 text-white">{exchange}</option>
                ))}
              </select>
              <p className="mt-2 text-[11px] normal-case tracking-normal text-slate-500">거래소별 상세 보기</p>
            </label>

            <label className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-[11px] font-medium uppercase tracking-[0.26em] text-slate-400">
              Output View
              <select
                value={topPathSort}
                onChange={(event) => setTopPathSort(event.target.value as TopPathSortOption)}
                className="mt-3 w-full appearance-none border-0 bg-transparent p-0 text-base font-semibold uppercase tracking-[0.18em] text-white outline-none"
              >
                {TOP_PATH_SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value} className="bg-slate-950 text-white">{option.label}</option>
                ))}
              </select>
              <p className="mt-2 text-[11px] normal-case tracking-normal text-slate-500">정렬 우선순위</p>
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex min-h-[88px] items-center justify-center gap-2 rounded-2xl border border-sky-400/40 bg-sky-400/20 px-6 py-4 text-sm font-semibold uppercase tracking-[0.24em] text-sky-200 transition hover:bg-sky-400/30 disabled:opacity-50 xl:self-stretch"
            >
              <Search size={16} />
              {submitting ? 'Scanning' : 'Run Analysis'}
            </button>
          </form>

          {loading ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-28 animate-pulse rounded-2xl border border-white/10 bg-white/5" />
              ))}
            </div>
          ) : null}

          {!loading && summaryCards.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {summaryCards.map((card) => (
                <article key={card.label} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 backdrop-blur-sm">
                  <p className="text-[11px] font-medium uppercase tracking-[0.32em] text-slate-400">{card.label}</p>
                  <p className="mt-4 text-2xl font-semibold tracking-tight text-white">{card.value}</p>
                  <p className="mt-2 text-xs text-slate-500">{card.helper}</p>
                </article>
              ))}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-3xl border border-bnb-red/30 bg-bnb-red/10 p-5 text-bnb-red">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5" size={18} />
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.3em]">Route analysis failed</p>
                  <p className="mt-2 text-sm font-medium">{error}</p>
                  {data?.errors?.length ? (
                    <ul className="mt-3 space-y-1 text-sm text-slate-300">
                      {data.errors.map((item, index) => (
                        <li key={`${item.stage}-${item.exchange}-${item.coin}-${index}`}>
                          {[item.exchange, item.coin].filter(Boolean).join(' / ')}: {item.error_message}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {!loading && data && !error ? (
            <>
              {data.best_path ? (
                <section className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_380px]">
                  <div className="rounded-[28px] border border-sky-400/25 bg-sky-400/10 p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-sky-300">Primary Route Recommendation</p>
                        <div className="mt-4 flex flex-wrap items-center gap-3 text-white">
                          <span className="rounded-full border border-sky-300/40 bg-sky-300/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-200">Rank 01</span>
                          <span className="text-xl font-semibold uppercase tracking-[0.08em]">{data.best_path.korean_exchange}</span>
                          <ArrowRight size={18} className="text-slate-400" />
                          <span className="text-xl font-semibold uppercase tracking-[0.08em]">{data.global_exchange}</span>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.24em] text-slate-300">
                          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">{data.best_path.transfer_coin}</span>
                          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">{data.best_path.network}</span>
                        </div>
                      </div>

                      <div className="grid min-w-[220px] gap-3 sm:grid-cols-3 xl:grid-cols-1">
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Received BTC</p>
                          <p className="mt-2 text-xl font-semibold text-white">{formatBtc(data.best_path.btc_received)}</p>
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Total Fee</p>
                          <p className="mt-2 text-xl font-semibold text-sky-300">{formatCurrency(data.best_path.total_fee_krw)}</p>
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Fee Ratio</p>
                          <p className={`mt-2 text-xl font-semibold ${getFeeTone(data.best_path.fee_pct)}`}>{formatPercent(data.best_path.fee_pct)}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <aside className="rounded-[28px] border border-white/10 bg-slate-950/65 p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-400">Operations Log</p>
                    <div className="mt-4 space-y-4 text-sm text-slate-300">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Last Run</p>
                        <p className="mt-1 font-medium text-white">{data.last_run?.status ?? 'unknown'}</p>
                        <p className="mt-1 text-xs text-slate-500">{data.last_run?.completed_at ?? data.maintenance_checked_at ?? '최근 실행 정보 없음'}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Market Inputs</p>
                        <p className="mt-1">USD/KRW {formatNumber(data.usd_krw_rate)} · BTC/USD {formatNumber(data.global_btc_price_usd, 2)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Fee Trace</p>
                        <div className="mt-2">
                          <FeeBreakdownRow breakdown={data.best_path.breakdown} />
                        </div>
                      </div>
                    </div>
                  </aside>
                </section>
              ) : null}

              <section className="rounded-[28px] border border-white/10 bg-slate-950/70 p-5 md:p-6">
                <div className="flex flex-col gap-3 border-b border-white/10 pb-4 md:flex-row md:items-end md:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-sky-300">Route Optimization Analysis</p>
                    <h2 className="mt-2 text-lg font-semibold text-white">상위 경로 비교 테이블</h2>
                  </div>
                  <p className="max-w-xl text-sm text-slate-400">현재 정렬 기준에 따라 최상위 다섯 개 경로를 대시보드 스타일로 표시합니다. 녹색은 즉시 검토, 붉은색은 수수료 경고를 의미합니다.</p>
                </div>

                <div className="mt-5 overflow-x-auto">
                  <table className="min-w-full border-separate border-spacing-y-3 text-sm">
                    <thead>
                      <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                        <th className="px-4">Path</th>
                        <th className="px-4">Lane</th>
                        <th className="px-4 text-right">Received BTC</th>
                        <th className="px-4 text-right">Fee Cost</th>
                        <th className="px-4 text-right">Fee Ratio</th>
                        <th className="px-4">Status</th>
                        <th className="px-4">Trace</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topPaths.map((path, index) => {
                        const status = getRouteStatus(index, path.fee_pct);
                        return (
                          <tr key={`${path.korean_exchange}-${path.transfer_coin}-${path.network}`} className="rounded-2xl bg-white/[0.04] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]">
                            <td className="rounded-l-2xl px-4 py-4">
                              <div className="flex items-center gap-3">
                                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xs font-semibold text-slate-300">{String(index + 1).padStart(2, '0')}</span>
                                <div>
                                  <p className="font-semibold uppercase tracking-[0.08em] text-white">{path.korean_exchange}</p>
                                  <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">to {data.global_exchange}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4 text-slate-300">
                              <p className="font-medium text-white">{path.transfer_coin}</p>
                              <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">{path.network}</p>
                            </td>
                            <td className="px-4 py-4 text-right font-medium text-white">{formatBtc(path.btc_received)}</td>
                            <td className="px-4 py-4 text-right font-semibold text-sky-300">{formatCurrency(path.total_fee_krw)}</td>
                            <td className={`px-4 py-4 text-right font-semibold ${getFeeTone(path.fee_pct)}`}>{formatPercent(path.fee_pct)}</td>
                            <td className="px-4 py-4">
                              <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] ${status.className}`}>{status.label}</span>
                            </td>
                            <td className="rounded-r-2xl px-4 py-4">
                              <FeeBreakdownRow breakdown={path.breakdown} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_0.9fr]">
                <div className="rounded-[28px] border border-white/10 bg-slate-950/70 p-5 md:p-6">
                  <div className="flex flex-col gap-3 border-b border-white/10 pb-4 md:flex-row md:items-end md:justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-sky-300">Focused Route Inspector</p>
                      <h2 className="mt-2 text-lg font-semibold text-white">거래소별 상세 보기</h2>
                    </div>
                    <p className="text-sm text-slate-400">Route Focus 선택값에 따라 해당 거래소 경로의 순위와 수수료 근거를 추적합니다.</p>
                  </div>

                  {selectedRoute ? (
                    <div className="mt-5 space-y-5">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-300">#{selectedRoute.rank} rank</span>
                        <span className="text-lg font-semibold uppercase tracking-[0.08em] text-white">{selectedRoute.path.korean_exchange}</span>
                        <ArrowRight size={16} className="text-slate-500" />
                        <span className="text-lg font-semibold uppercase tracking-[0.08em] text-white">{data.global_exchange}</span>
                      </div>

                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Asset Lane</p>
                          <p className="mt-2 font-semibold text-white">{selectedRoute.path.transfer_coin}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">{selectedRoute.path.network}</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Received BTC</p>
                          <p className="mt-2 font-semibold text-white">{formatBtc(selectedRoute.path.btc_received)}</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Fee Ratio</p>
                          <p className={`mt-2 font-semibold ${getFeeTone(selectedRoute.path.fee_pct)}`}>{formatPercent(selectedRoute.path.fee_pct)}</p>
                        </div>
                      </div>

                      <FeeBreakdownRow breakdown={selectedRoute.path.breakdown} />
                    </div>
                  ) : (
                    <div className="mt-5 rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-5 text-sm text-slate-400">
                      거래소를 선택하면 해당 경로의 순위, 수수료, 세부 계산 근거를 이 영역에서 확인할 수 있습니다.
                    </div>
                  )}
                </div>

                <div className="rounded-[28px] border border-white/10 bg-slate-950/70 p-5 md:p-6">
                  <div className="flex items-center gap-2 border-b border-white/10 pb-4">
                    <TrendingUp size={16} className="text-sky-300" />
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-sky-300">Fee Rate Velocity (Live Snapshot)</p>
                      <p className="mt-1 text-sm text-slate-400">상위 경로의 현재 수수료 비율을 바 차트로 압축해 보여줍니다.</p>
                    </div>
                  </div>
                  <div className="mt-5 space-y-4">
                    {topPaths.map((path) => (
                      <div key={`velocity-${path.korean_exchange}-${path.network}`}>
                        <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.18em] text-slate-400">
                          <span>{path.korean_exchange}</span>
                          <span>{formatPercent(path.fee_pct)}</span>
                        </div>
                        <div className="h-3 rounded-full bg-white/5">
                          <div
                            className="h-3 rounded-full bg-gradient-to-r from-sky-400 via-cyan-300 to-emerald-300"
                            style={{ width: `${Math.max((path.fee_pct / maxFeePct) * 100, 8)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {data.disabled_paths.length > 0 ? (
                    <div className="mt-6 rounded-2xl border border-bnb-red/20 bg-bnb-red/5 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-bnb-red">Suppressed routes</p>
                      <ul className="mt-3 space-y-2 text-sm text-slate-300">
                        {data.disabled_paths.slice(0, 4).map((path, index) => (
                          <li key={`${path.korean_exchange}-${path.transfer_coin}-${index}`}>
                            {path.korean_exchange} · {path.transfer_coin} / {path.network}
                            {path.reason ? ` — ${path.reason}` : ''}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </section>
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}
