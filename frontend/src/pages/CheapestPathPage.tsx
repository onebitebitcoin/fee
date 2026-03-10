import { ArrowRight, ChevronDown, ChevronUp, Info, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

import { MetricCard } from '../components/MetricCard';
import { api } from '../lib/api';
import type { CheapestPathBreakdown, CheapestPathEntry, CheapestPathResponse } from '../types';

const DEFAULT_AMOUNT_KRW = 1000000;
const GLOBAL_EXCHANGE_OPTIONS = ['binance', 'okx', 'coinbase', 'kraken', 'bitget'];
const TOP_PATH_SORT_OPTIONS = [
  { value: 'lowest_fee_krw', label: '총 수수료 낮은 순' },
  { value: 'lowest_fee_pct', label: '수수료 비율 낮은 순' },
  { value: 'highest_btc', label: '받는 BTC 높은 순' },
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
  return `${value}%`;
}

function getFeeColor(feePct: number) {
  if (feePct <= 0.5) return 'text-bnb-green';
  if (feePct <= 1.0) return 'text-brand-500';
  return 'text-bnb-red';
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

function FeeBreakdown({ breakdown }: { breakdown?: CheapestPathBreakdown | null }) {
  const [open, setOpen] = useState(false);
  if (!breakdown?.components?.length) return null;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs text-bnb-muted hover:text-brand-500"
      >
        <Info size={12} />
        계산 근거 {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {open && (
        <ul className="mt-2 space-y-1">
          {breakdown.components.map((component, index) => (
            <li key={`${component.label}-${index}`} className="flex items-center justify-between rounded-lg bg-dark-400 px-3 py-2 text-xs">
              <div>
                <p className="font-medium text-bnb-text">{component.label}</p>
                <p className="text-bnb-muted">
                  {component.rate_pct != null ? `요율 ${formatPercent(component.rate_pct)}` : '고정'}
                  {component.amount_text ? ` · ${component.amount_text}` : ''}
                </p>
              </div>
              <p className="font-semibold text-brand-500">{formatCurrency(component.amount_krw)}</p>
            </li>
          ))}
        </ul>
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

  const topPaths = useMemo(() => (data ? sortTopPaths(data.all_paths, topPathSort) : []), [data, topPathSort]);
  const availableKoreanExchanges = useMemo(
    () => (data ? Array.from(new Set(data.all_paths.map((item) => item.korean_exchange))) : []),
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

  return (
    <div className="space-y-6">
      {/* 검색 패널 */}
      <div className="rounded-xl border border-dark-200 bg-dark-300 p-4">
        <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-bnb-text">Cheapest Path Explorer</h2>
            <p className="text-xs text-bnb-muted">최적 송금 경로와 수수료를 비교합니다</p>
          </div>
          <div className="text-right text-xs text-bnb-muted">
            {data?.data_source && (
              <span className="mr-2 rounded-md border border-dark-200 bg-dark-400 px-2 py-0.5 text-xs text-bnb-muted">
                {data.data_source}
              </span>
            )}
            {data?.latest_scraping_time && <p>스크래핑: {data.latest_scraping_time}</p>}
            {data?.maintenance_checked_at && <p>점검 확인: {data.maintenance_checked_at}</p>}
          </div>
        </div>
        <form className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_200px_auto]" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-bnb-muted">
            송금 금액 (KRW)
            <input
              type="number"
              min={10000}
              step={10000}
              value={amountKrwInput}
              onChange={(event) => setAmountKrwInput(event.target.value)}
              className="rounded-lg border border-dark-200 bg-dark-400 px-3 py-2 text-sm text-bnb-text outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-bnb-muted">
            도착 해외 거래소
            <select
              value={globalExchange}
              onChange={(event) => setGlobalExchange(event.target.value)}
              className="rounded-lg border border-dark-200 bg-dark-400 px-3 py-2 text-sm text-bnb-text outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30"
            >
              {GLOBAL_EXCHANGE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-5 py-2 text-sm font-semibold text-dark-500 transition-colors hover:bg-brand-400 disabled:opacity-50 md:self-end"
          >
            <Search size={14} />
            {submitting ? '탐색 중...' : '경로 탐색'}
          </button>
        </form>
      </div>

      {loading && (
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-dark-300" />)}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-bnb-red/30 bg-bnb-red/10 p-4 text-bnb-red">
          <p className="font-medium">{error}</p>
          {data?.latest_scraping_time && <p className="mt-1 text-xs text-bnb-muted">최신 스크래핑: {data.latest_scraping_time}</p>}
          {data?.errors?.length ? (
            <ul className="mt-2 space-y-1 text-sm">
              {data.errors.map((item, index) => (
                <li key={`${item.stage}-${item.exchange}-${item.coin}-${index}`} className="text-bnb-muted">
                  {[item.exchange, item.coin].filter(Boolean).join(' / ')}: {item.error_message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}

      {!loading && data && !error && (
        <>
          {/* 요약 지표 */}
          <div className="grid gap-4 md:grid-cols-4">
            <MetricCard label="평가 경로 수" value={formatNumber(data.total_paths_evaluated)} />
            <MetricCard label="비활성 경로 수" value={formatNumber(data.disabled_paths.length)} />
            <MetricCard label="USD/KRW" value={formatNumber(data.usd_krw_rate)} />
            <MetricCard label="BTC/USD" value={formatNumber(data.global_btc_price_usd, 2)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
            {/* 최적 경로 */}
            <div className="rounded-xl border border-dark-200 bg-dark-300 p-4">
              <h3 className="flex items-center gap-2 text-base font-semibold text-bnb-text">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-dark-500">1</span>
                최적 경로
              </h3>
              {data.best_path ? (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-2 rounded-lg bg-bnb-green/10 border border-bnb-green/30 px-4 py-3">
                    <span className="font-semibold text-bnb-green">{data.best_path.korean_exchange}</span>
                    <ArrowRight size={14} className="text-bnb-muted" />
                    <span className="font-semibold text-bnb-green">{data.global_exchange}</span>
                    <span className="ml-auto rounded-md bg-dark-400 px-2 py-0.5 text-xs text-bnb-muted">
                      {data.best_path.transfer_coin} / {data.best_path.network}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-dark-400 px-4 py-3">
                      <p className="text-xs text-bnb-muted">받는 BTC</p>
                      <p className="mt-1 font-semibold text-bnb-text">{formatBtc(data.best_path.btc_received)} BTC</p>
                    </div>
                    <div className="rounded-lg bg-dark-400 px-4 py-3">
                      <p className="text-xs text-bnb-muted">총 수수료</p>
                      <p className="mt-1 font-semibold text-brand-500">{formatCurrency(data.best_path.total_fee_krw)}</p>
                    </div>
                    <div className="rounded-lg bg-dark-400 px-4 py-3">
                      <p className="text-xs text-bnb-muted">수수료 비율</p>
                      <p className={`mt-1 font-semibold ${getFeeColor(data.best_path.fee_pct)}`}>{data.best_path.fee_pct}%</p>
                    </div>
                    <div className="rounded-lg bg-dark-400 px-4 py-3">
                      <p className="text-xs text-bnb-muted">BTC 환산 USD</p>
                      <p className="mt-1 font-semibold text-bnb-text">{formatNumber(data.best_path.btc_received_usd ?? 0, 2)} USD</p>
                    </div>
                  </div>
                  <FeeBreakdown breakdown={data.best_path.breakdown} />
                </div>
              ) : (
                <p className="mt-3 text-sm text-bnb-muted">조건에 맞는 경로가 없습니다.</p>
              )}
            </div>

            {/* 비활성 경로 */}
            <div className="rounded-xl border border-dark-200 bg-dark-300 p-4">
              <h3 className="text-base font-semibold text-bnb-text">비활성 경로</h3>
              {data.disabled_paths.length === 0 ? (
                <p className="mt-3 text-sm text-bnb-muted">점검/중단으로 제외된 경로가 없습니다.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {data.disabled_paths.map((item, index) => (
                    <li key={`${item.korean_exchange}-${item.transfer_coin}-${item.network}-${index}`} className="rounded-lg bg-dark-400 px-3 py-2 text-sm">
                      <p className="font-medium text-bnb-text">{item.korean_exchange} / {item.transfer_coin} / {item.network}</p>
                      {item.reason && <p className="mt-0.5 text-xs text-bnb-red">{item.reason}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* TOP 5 경로 */}
          <div className="rounded-xl border border-dark-200 bg-dark-300 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-bnb-text">상위 경로</h3>
              <select
                value={topPathSort}
                onChange={(event) => setTopPathSort(event.target.value as TopPathSortOption)}
                className="rounded-lg border border-dark-200 bg-dark-400 px-2 py-1 text-xs text-bnb-text focus:outline-none"
              >
                {TOP_PATH_SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div className="mt-4 space-y-2">
              {topPaths.map((path, index) => (
                <div
                  key={`${path.korean_exchange}-${path.transfer_coin}-${path.network}`}
                  className={`rounded-lg border px-4 py-3 ${index === 0 ? 'border-brand-500/40 bg-brand-500/5' : 'border-dark-200 bg-dark-400'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${index === 0 ? 'bg-brand-500 text-dark-500' : 'bg-dark-200 text-bnb-muted'}`}>
                        {index + 1}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-bnb-text">
                          {path.korean_exchange} <ArrowRight size={12} className="inline text-bnb-muted" /> {data.global_exchange}
                        </p>
                        <p className="text-xs text-bnb-muted">{path.transfer_coin} / {path.network}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-brand-500">{formatCurrency(path.total_fee_krw)}</p>
                      <p className={`text-xs ${getFeeColor(path.fee_pct)}`}>{path.fee_pct}%</p>
                    </div>
                  </div>
                  <FeeBreakdown breakdown={path.breakdown} />
                </div>
              ))}
            </div>
          </div>

          {/* 거래소별 경로 선택 */}
          {availableKoreanExchanges.length > 0 && (
            <div className="rounded-xl border border-dark-200 bg-dark-300 p-4">
              <div className="flex items-center gap-3">
                <h3 className="text-base font-semibold text-bnb-text">거래소별 조회</h3>
                <select
                  value={selectedKoreanExchange}
                  onChange={(event) => setSelectedKoreanExchange(event.target.value)}
                  className="rounded-lg border border-dark-200 bg-dark-400 px-3 py-1.5 text-sm text-bnb-text focus:outline-none focus:border-brand-500"
                >
                  <option value="">거래소 선택</option>
                  {availableKoreanExchanges.map((ex) => (
                    <option key={ex} value={ex}>{ex}</option>
                  ))}
                </select>
              </div>
              {selectedRoute && (
                <div className="mt-4 rounded-lg bg-dark-400 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-bnb-text">
                      {selectedRoute.path.korean_exchange} <ArrowRight size={12} className="inline text-bnb-muted" /> {data.global_exchange}
                      <span className="ml-2 text-xs text-bnb-muted">/ {selectedRoute.path.transfer_coin} / {selectedRoute.path.network}</span>
                    </p>
                    <span className="rounded-md bg-dark-200 px-2 py-0.5 text-xs text-bnb-muted">#{selectedRoute.rank}위</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                    <div>
                      <p className="text-xs text-bnb-muted">받는 BTC</p>
                      <p className="mt-0.5 text-sm font-semibold text-bnb-text">{formatBtc(selectedRoute.path.btc_received)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-bnb-muted">총 수수료</p>
                      <p className="mt-0.5 text-sm font-semibold text-brand-500">{formatCurrency(selectedRoute.path.total_fee_krw)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-bnb-muted">수수료 비율</p>
                      <p className={`mt-0.5 text-sm font-semibold ${getFeeColor(selectedRoute.path.fee_pct)}`}>{selectedRoute.path.fee_pct}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-bnb-muted">BTC → USD</p>
                      <p className="mt-0.5 text-sm font-semibold text-bnb-text">{formatNumber(selectedRoute.path.btc_received_usd ?? 0, 2)}</p>
                    </div>
                  </div>
                  <FeeBreakdown breakdown={selectedRoute.path.breakdown} />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
