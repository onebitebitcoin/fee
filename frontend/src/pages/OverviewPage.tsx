import { Activity, ArrowDown, ArrowUp, DollarSign, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

import { MetricCard } from '../components/MetricCard';
import { StatusBadge } from '../components/StatusBadge';
import { api } from '../lib/api';

type OverviewData = Awaited<ReturnType<typeof api.getOverview>>;

export function OverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.getOverview();
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleManualRun = async () => {
    try {
      setSubmitting(true);
      const result = await api.triggerCrawl();
      setActionMessage(`수동 크롤링 완료: ${result.status}`);
      await load();
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : '수동 실행 실패');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-dark-300" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-bnb-red/30 bg-bnb-red/10 p-4 text-bnb-red">{error}</div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="최근 수집 상태" value={data?.last_run?.status ?? 'no-data'} helper={data?.last_run?.completed_at ?? '아직 수집 없음'} />
        <MetricCard label="Ticker Rows" value={data?.counts.tickers ?? 0} />
        <MetricCard label="Withdrawal Rows" value={data?.counts.withdrawal_rows ?? 0} />
        <MetricCard label="Suspended Networks" value={data?.counts.suspended_networks ?? 0} />
      </div>

      <div className="rounded-xl border border-dark-200 bg-dark-300 p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-bnb-text">
              <Activity size={16} className="text-brand-500" />
              최근 실행
            </h2>
            {data?.last_run ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-bnb-muted">
                <StatusBadge status={data.last_run.status} />
                <span>ID {data.last_run.id}</span>
                <span>{data.last_run.completed_at}</span>
              </div>
            ) : (
              <p className="mt-2 text-sm text-bnb-muted">아직 저장된 수집 결과가 없습니다.</p>
            )}
          </div>
          <div className="flex flex-col items-stretch gap-2 md:items-end">
            <button
              type="button"
              onClick={handleManualRun}
              disabled={submitting}
              className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-dark-500 transition-colors hover:bg-brand-400 disabled:opacity-50"
            >
              <RefreshCw size={14} className={submitting ? 'animate-spin' : ''} />
              {submitting ? '실행 중...' : '수동 크롤링 실행'}
            </button>
            {actionMessage ? <p className="text-xs text-bnb-muted">{actionMessage}</p> : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-dark-200 bg-dark-300 p-4">
          <h2 className="flex items-center gap-2 text-base font-semibold text-bnb-text">
            <DollarSign size={16} className="text-brand-500" />
            가격 하이라이트
          </h2>
          <div className="mt-4 space-y-3">
            {[
              { label: 'KRW 최저가', data: data?.ticker_highlights.krw_lowest, icon: ArrowDown, color: 'text-bnb-green' },
              { label: 'KRW 최고가', data: data?.ticker_highlights.krw_highest, icon: ArrowUp, color: 'text-bnb-red' },
              { label: 'USD 최저가', data: data?.ticker_highlights.usd_lowest, icon: ArrowDown, color: 'text-bnb-green' },
              { label: 'USD 최고가', data: data?.ticker_highlights.usd_highest, icon: ArrowUp, color: 'text-bnb-red' },
            ].map(({ label, data: item, icon: Icon, color }) => (
              <div key={label} className="flex items-center justify-between border-b border-dark-200 pb-3 last:border-0 last:pb-0">
                <div className="flex items-center gap-2 text-sm text-bnb-muted">
                  <Icon size={14} className={color} />
                  {label}
                </div>
                <div className="text-right">
                  {item ? (
                    <>
                      <p className="text-sm font-semibold text-brand-500">{item.price.toLocaleString()}</p>
                      <p className="text-xs text-bnb-muted">{item.exchange}</p>
                    </>
                  ) : (
                    <p className="text-sm text-bnb-muted">N/A</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-dark-200 bg-dark-300 p-4">
          <h2 className="flex items-center gap-2 text-base font-semibold text-bnb-text">
            <Activity size={16} className="text-brand-500" />
            환경 정보
          </h2>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between border-b border-dark-200 pb-3">
              <span className="text-sm text-bnb-muted">USD/KRW 환율</span>
              <span className="text-sm font-semibold text-brand-500">{data?.usd_krw_rate?.toLocaleString() ?? 'N/A'}</span>
            </div>
            <div className="flex items-center justify-between border-b border-dark-200 pb-3">
              <span className="text-sm text-bnb-muted">한국 거래소 수</span>
              <span className="text-sm font-semibold text-bnb-text">{data?.available_exchanges?.korea?.length ?? 0}개</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-bnb-muted">글로벌 거래소 수</span>
              <span className="text-sm font-semibold text-bnb-text">{data?.available_exchanges?.global?.length ?? 0}개</span>
            </div>
          </div>
          {data?.available_exchanges?.korea && (
            <div className="mt-4">
              <p className="mb-2 text-xs text-bnb-muted">한국 거래소</p>
              <div className="flex flex-wrap gap-1">
                {data.available_exchanges.korea.map((ex) => (
                  <span key={ex} className="rounded-md border border-dark-200 bg-dark-400 px-2 py-0.5 text-xs text-bnb-muted">{ex}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
