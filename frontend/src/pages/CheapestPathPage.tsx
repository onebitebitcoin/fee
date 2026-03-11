import { ArrowRight, ChevronDown, ChevronUp, Info, Search, ShieldAlert, TrendingUp } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

import { api } from '../lib/api';
import type { CheapestPathBreakdown, CheapestPathEntry, CheapestPathResponse } from '../types';

const DEFAULT_AMOUNT_KRW = 1000000;
const GLOBAL_EXCHANGE_OPTIONS = ['binance', 'okx', 'coinbase', 'kraken', 'bitget'];
const TOP_PATH_SORT_OPTIONS = [
  { value: 'lowest_fee_krw', label: '수수료 낮은 순' },
  { value: 'lowest_fee_pct', label: '수수료율 낮은 순' },
  { value: 'highest_btc', label: 'BTC 최대 순' },
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
  if (feePct <= 1.0) return 'text-brand-400';
  return 'text-bnb-red';
}

function getRouteStatus(index: number, feePct: number) {
  if (index === 0) return { label: '최적', className: 'border-bnb-green/40 bg-bnb-green/10 text-bnb-green' };
  if (feePct <= 1.0) return { label: '안정', className: 'border-brand-400/40 bg-brand-400/10 text-brand-400' };
  return { label: '고비용', className: 'border-bnb-red/30 bg-bnb-red/10 text-bnb-red' };
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
  if (!breakdown?.components?.length) return <span className="text-[11px] text-bnb-muted">상세 없음</span>;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-400 transition-colors hover:text-brand-300"
      >
        <Info size={11} />
        수수료 내역 {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </button>
      {open && (
        <div className="border border-dark-200 bg-dark-400 p-3">
          <table className="min-w-full text-xs">
            <tbody>
              {breakdown.components.map((component, index) => (
                <tr key={`${component.label}-${index}`} className="border-t border-dark-200 first:border-t-0">
                  <td className="py-2 pr-4 text-bnb-text">{component.label}</td>
                  <td className="py-2 pr-4 text-bnb-muted">
                    {component.rate_pct != null ? `요율 ${formatPercent(component.rate_pct)}` : '고정'}
                    {component.amount_text ? ` · ${component.amount_text}` : ''}
                  </td>
                  <td className="py-2 text-right font-semibold text-brand-400">{formatCurrency(component.amount_krw)}</td>
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
        { label: '분석 경로', value: `${formatNumber(data.total_paths_evaluated)}개`, helper: '현재 계산에 포함된 후보 수' },
        { label: '최저 수수료', value: data.best_path ? formatCurrency(data.best_path.total_fee_krw) : 'N/A', helper: '최저 총 수수료 기준' },
        { label: '최적 거래소', value: data.best_path ? data.best_path.korean_exchange.toUpperCase() : 'N/A', helper: data.best_path ? `${data.best_path.transfer_coin} / ${data.best_path.network}` : '활성 경로 없음' },
        { label: '비활성 경로', value: `${formatNumber(data.disabled_paths.length)}개`, helper: data.disabled_paths.length ? '점검/정지 경로 제외' : '비활성 경로 없음' },
      ]
    : [];

  const maxFeePct = Math.max(...topPaths.map((path) => path.fee_pct), 1);

  return (
    <div className="space-y-0 border border-dark-200">
      {/* Header */}
      <div className="border-b border-dark-200 bg-dark-400 px-5 py-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.38em] text-bnb-muted">BTC 경로 탐색기</p>
            <h1 className="mt-1 text-lg font-semibold tracking-tight text-bnb-text">최적 경로 대시보드</h1>
          </div>
          <div className="flex gap-4 text-[11px] uppercase tracking-[0.24em] text-bnb-muted">
            <div>
              출처{data?.data_source ? `: ${data.data_source}` : ''}
            </div>
            <div className="border-l border-dark-200 pl-4">
              스냅샷: {data?.latest_scraping_time ?? '대기 중'}
            </div>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="border-b border-dark-200 bg-dark-500 px-5 py-4">
        <form className="grid gap-0 xl:grid-cols-[minmax(0,1.2fr)_220px_220px_220px_auto]" onSubmit={handleSubmit}>
          <label className="border border-dark-200 bg-dark-400 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.26em] text-bnb-muted xl:border-r-0">
            거래 금액 (KRW)
            <input
              type="number"
              min={10000}
              step={10000}
              value={amountKrwInput}
              onChange={(event) => setAmountKrwInput(event.target.value)}
              className="mt-2 w-full border-0 bg-transparent p-0 text-xl font-semibold tracking-tight text-bnb-text outline-none placeholder:text-bnb-muted"
            />
            <p className="mt-1 text-[10px] normal-case tracking-normal text-bnb-muted">최소 10,000 KRW</p>
          </label>

          <label className="border border-dark-200 bg-dark-400 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.26em] text-bnb-muted xl:border-r-0">
            목적지 거래소
            <select
              value={globalExchange}
              onChange={(event) => setGlobalExchange(event.target.value)}
              className="mt-2 w-full appearance-none border-0 bg-transparent p-0 text-base font-semibold uppercase tracking-[0.18em] text-bnb-text outline-none"
            >
              {GLOBAL_EXCHANGE_OPTIONS.map((option) => (
                <option key={option} value={option} className="bg-dark-400 text-bnb-text">{option}</option>
              ))}
            </select>
            <p className="mt-1 text-[10px] normal-case tracking-normal text-bnb-muted">도착 해외 거래소</p>
          </label>

          <label className="border border-dark-200 bg-dark-400 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.26em] text-bnb-muted xl:border-r-0">
            경로 필터
            <select
              value={selectedKoreanExchange}
              onChange={(event) => setSelectedKoreanExchange(event.target.value)}
              className="mt-2 w-full appearance-none border-0 bg-transparent p-0 text-base font-semibold uppercase tracking-[0.18em] text-bnb-text outline-none"
            >
              <option value="" className="bg-dark-400 text-bnb-text">거래소 선택</option>
              {availableKoreanExchanges.map((exchange) => (
                <option key={exchange} value={exchange} className="bg-dark-400 text-bnb-text">{exchange}</option>
              ))}
            </select>
            <p className="mt-1 text-[10px] normal-case tracking-normal text-bnb-muted">거래소별 상세 보기</p>
          </label>

          <label className="border border-dark-200 bg-dark-400 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.26em] text-bnb-muted xl:border-r-0">
            정렬 기준
            <select
              value={topPathSort}
              onChange={(event) => setTopPathSort(event.target.value as TopPathSortOption)}
              className="mt-2 w-full appearance-none border-0 bg-transparent p-0 text-base font-semibold uppercase tracking-[0.18em] text-bnb-text outline-none"
            >
              {TOP_PATH_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value} className="bg-dark-400 text-bnb-text">{option.label}</option>
              ))}
            </select>
            <p className="mt-1 text-[10px] normal-case tracking-normal text-bnb-muted">정렬 우선순위</p>
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="flex items-center justify-center gap-2 border border-brand-600 bg-brand-600 px-6 py-3 text-sm font-semibold uppercase tracking-[0.24em] text-dark-500 transition-colors hover:bg-brand-500 disabled:opacity-50"
          >
            <Search size={15} />
            {submitting ? '검색 중...' : '최적 경로 검색'}
          </button>
        </form>
      </div>

      {/* Summary Cards */}
      {loading ? (
        <div className="grid gap-0 border-b border-dark-200 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse border-r border-dark-200 bg-dark-300 last:border-r-0" />
          ))}
        </div>
      ) : null}

      {!loading && summaryCards.length > 0 ? (
        <div className="grid gap-0 border-b border-dark-200 md:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card, idx) => (
            <article key={card.label} className={`bg-dark-400 px-5 py-4 ${idx < summaryCards.length - 1 ? 'border-r border-dark-200' : ''}`}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-bnb-muted">{card.label}</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight text-bnb-text">{card.value}</p>
              <p className="mt-1 text-xs text-bnb-muted">{card.helper}</p>
            </article>
          ))}
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
          {/* Best Path */}
          {data.best_path ? (
            <div className="grid gap-0 border-b border-dark-200 xl:grid-cols-[minmax(0,1.55fr)_380px]">
              <div className="border-b border-dark-200 bg-dark-400 p-5 xl:border-b-0 xl:border-r">
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-brand-400">최적 경로</p>
                <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-3 text-bnb-text">
                      <span className="border border-brand-400/40 bg-brand-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-brand-400">1위</span>
                      <span className="text-xl font-semibold uppercase tracking-[0.08em]">{data.best_path.korean_exchange}</span>
                      <ArrowRight size={16} className="text-bnb-muted" />
                      <span className="text-xl font-semibold uppercase tracking-[0.08em]">{data.global_exchange}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.24em] text-bnb-muted">
                      <span className="border border-dark-200 bg-dark-300 px-2 py-0.5">{data.best_path.transfer_coin}</span>
                      <span className="border border-dark-200 bg-dark-300 px-2 py-0.5">{data.best_path.network}</span>
                    </div>
                  </div>

                  <div className="grid min-w-[220px] gap-4 sm:grid-cols-3 xl:grid-cols-1">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.24em] text-bnb-muted">수령 BTC</p>
                      <p className="mt-1 text-xl font-semibold text-bnb-text">{formatBtc(data.best_path.btc_received)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.24em] text-bnb-muted">총 수수료</p>
                      <p className="mt-1 text-xl font-semibold text-brand-400">{formatCurrency(data.best_path.total_fee_krw)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.24em] text-bnb-muted">수수료율</p>
                      <p className={`mt-1 text-xl font-semibold ${getFeeTone(data.best_path.fee_pct)}`}>{formatPercent(data.best_path.fee_pct)}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-dark-500 p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-bnb-muted">운영 정보</p>
                <div className="mt-4 space-y-4 text-sm text-bnb-muted">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.24em] text-bnb-muted">최근 실행</p>
                    <p className="mt-1 font-medium text-bnb-text">{data.last_run?.status ?? '알 수 없음'}</p>
                    <p className="mt-0.5 text-xs text-bnb-muted">{data.last_run?.completed_at ?? data.maintenance_checked_at ?? '최근 실행 정보 없음'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.24em] text-bnb-muted">시장 가격</p>
                    <p className="mt-1">USD/KRW {formatNumber(data.usd_krw_rate)} · BTC/USD {formatNumber(data.global_btc_price_usd, 2)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.24em] text-bnb-muted">수수료 내역</p>
                    <div className="mt-2">
                      <FeeBreakdownRow breakdown={data.best_path.breakdown} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* Route Optimization Table */}
          <div className="border-b border-dark-200 bg-dark-500">
            <div className="flex flex-col gap-2 border-b border-dark-200 bg-dark-400 px-5 py-3 md:flex-row md:items-center md:justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-bnb-muted">경로 분석</p>
              <p className="text-[11px] uppercase tracking-[0.2em] text-bnb-muted">
                업데이트: {data.latest_scraping_time ?? '—'}
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-200 bg-dark-400 text-left text-[11px] font-semibold uppercase tracking-[0.28em] text-bnb-muted">
                    <th className="px-5 py-3">경로</th>
                    <th className="px-5 py-3">거래소/방식</th>
                    <th className="px-5 py-3 text-right">수수료율</th>
                    <th className="px-5 py-3 text-right">수령 BTC</th>
                    <th className="px-5 py-3 text-right">수수료(KRW)</th>
                    <th className="px-5 py-3">상태</th>
                    <th className="px-5 py-3">내역</th>
                  </tr>
                </thead>
                <tbody>
                  {topPaths.map((path, index) => {
                    const status = getRouteStatus(index, path.fee_pct);
                    return (
                      <tr
                        key={`${path.korean_exchange}-${path.transfer_coin}-${path.network}`}
                        className="border-b border-dark-200 bg-dark-500 transition-colors hover:bg-dark-400 last:border-b-0"
                      >
                        <td className="px-5 py-4">
                          <span className="font-mono text-xs text-bnb-muted">#{String(index + 1).padStart(3, '0')}</span>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-semibold uppercase tracking-[0.08em] text-bnb-text">{path.korean_exchange}</p>
                          <p className="mt-0.5 text-xs uppercase tracking-[0.2em] text-bnb-muted">{path.transfer_coin} / {path.network}</p>
                        </td>
                        <td className={`px-5 py-4 text-right font-semibold ${getFeeTone(path.fee_pct)}`}>
                          {formatPercent(path.fee_pct)}
                        </td>
                        <td className="px-5 py-4 text-right font-medium text-bnb-text">
                          {formatBtc(path.btc_received)}
                        </td>
                        <td className="px-5 py-4 text-right font-semibold text-brand-400">
                          {formatCurrency(path.total_fee_krw)}
                        </td>
                        <td className="px-5 py-4">
                          <span className={`border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] ${status.className}`}>
                            {status.label}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <FeeBreakdownRow breakdown={path.breakdown} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bottom: Focused Route + Fee Velocity */}
          <div className="grid gap-0 xl:grid-cols-[minmax(0,1.1fr)_0.9fr]">
            {/* Focused Route Inspector */}
            <div className="border-r border-dark-200 bg-dark-500">
              <div className="border-b border-dark-200 bg-dark-400 px-5 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-bnb-muted">경로 상세</p>
              </div>
              <div className="p-5">
                {selectedRoute ? (
                  <div className="space-y-5">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="border border-dark-200 bg-dark-400 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-bnb-muted">{selectedRoute.rank}위</span>
                      <span className="text-lg font-semibold uppercase tracking-[0.08em] text-bnb-text">{selectedRoute.path.korean_exchange}</span>
                      <ArrowRight size={14} className="text-bnb-muted" />
                      <span className="text-lg font-semibold uppercase tracking-[0.08em] text-bnb-text">{data.global_exchange}</span>
                    </div>

                    <div className="grid gap-0 border border-dark-200 md:grid-cols-3">
                      <div className="border-r border-dark-200 p-4 last:border-r-0">
                        <p className="text-[11px] uppercase tracking-[0.24em] text-bnb-muted">코인/네트워크</p>
                        <p className="mt-2 font-semibold text-bnb-text">{selectedRoute.path.transfer_coin}</p>
                        <p className="mt-0.5 text-xs uppercase tracking-[0.2em] text-bnb-muted">{selectedRoute.path.network}</p>
                      </div>
                      <div className="border-r border-dark-200 p-4 last:border-r-0">
                        <p className="text-[11px] uppercase tracking-[0.24em] text-bnb-muted">수령 BTC</p>
                        <p className="mt-2 font-semibold text-bnb-text">{formatBtc(selectedRoute.path.btc_received)}</p>
                      </div>
                      <div className="p-4">
                        <p className="text-[11px] uppercase tracking-[0.24em] text-bnb-muted">수수료율</p>
                        <p className={`mt-2 font-semibold ${getFeeTone(selectedRoute.path.fee_pct)}`}>{formatPercent(selectedRoute.path.fee_pct)}</p>
                      </div>
                    </div>

                    <FeeBreakdownRow breakdown={selectedRoute.path.breakdown} />
                  </div>
                ) : (
                  <div className="border border-dashed border-dark-200 bg-dark-400 p-5 text-sm text-bnb-muted">
                    거래소를 선택하면 해당 경로의 순위, 수수료, 세부 계산 근거를 이 영역에서 확인할 수 있습니다.
                  </div>
                )}
              </div>
            </div>

            {/* Fee Rate Velocity */}
            <div className="bg-dark-500">
              <div className="flex items-center gap-2 border-b border-dark-200 bg-dark-400 px-5 py-3">
                <TrendingUp size={14} className="text-bnb-muted" />
                <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-bnb-muted">
                  수수료율 비교
                </p>
              </div>
              <div className="p-5">
                <div className="space-y-4">
                  {topPaths.map((path) => (
                    <div key={`velocity-${path.korean_exchange}-${path.network}`}>
                      <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.18em] text-bnb-muted">
                        <span>{path.korean_exchange}</span>
                        <span className={getFeeTone(path.fee_pct)}>{formatPercent(path.fee_pct)}</span>
                      </div>
                      <div className="h-2 bg-dark-200">
                        <div
                          className="h-2 bg-brand-500"
                          style={{ width: `${Math.max((path.fee_pct / maxFeePct) * 100, 8)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {data.disabled_paths.length > 0 ? (
                  <div className="mt-6 border border-bnb-red/30 bg-bnb-red/5 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-bnb-red">비활성 경로</p>
                    <ul className="mt-3 space-y-2 text-sm text-bnb-muted">
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
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
