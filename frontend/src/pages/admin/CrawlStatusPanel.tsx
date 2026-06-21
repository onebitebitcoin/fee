import { useState, useEffect, useCallback } from 'react';
import { Lightning, ArrowsClockwise, WarningCircle } from '@phosphor-icons/react';
import { api } from '../../lib/api';
import { SectionLabel } from './adminHelpers';

type CrawlStatusData = Awaited<ReturnType<typeof api.getCrawlStatus>>;

const STATUS_CLS: Record<string, string> = {
  pass:    'bg-acc-green/10 text-acc-green',
  error:   'bg-acc-red/10 text-acc-red',
  missing: 'bg-fill-secondary text-label-tertiary',
  running: 'bg-acc-amber/10 text-acc-amber',
};
const STATUS_LABEL: Record<string, string> = {
  pass: 'PASS', error: 'FAIL', missing: '없음', running: '실행 중',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_CLS[status] ?? STATUS_CLS.missing}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function fmtTs(ts: number | null | undefined): string {
  if (!ts) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZone: 'Asia/Seoul',
  }).format(new Date(ts * 1000));
}

export function CrawlStatusPanel() {
  const [data, setData]       = useState<CrawlStatusData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setData(await api.getCrawlStatus());
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(fetch, 3_600_000);
    return () => clearInterval(id);
  }, [autoRefresh, fetch]);

  useEffect(() => {
    if (!data?.running) return;
    const id = setInterval(fetch, 5_000);
    return () => clearInterval(id);
  }, [data?.running, fetch]);

  async function handleTrigger() {
    try {
      setTriggering(true);
      const key = sessionStorage.getItem('admin_key') ?? 'dev-secret-key';
      await api.triggerCrawl(key);
      setTimeout(fetch, 2000);
    } catch {
      alert('크롤 트리거 실패. 서버 설정을 확인하세요.');
    } finally {
      setTriggering(false);
    }
  }

  const run = data?.last_run;
  const isRunning = data?.running;
  const korea = data?.exchanges.filter(e => e.group === 'korea') ?? [];
  const global = data?.exchanges.filter(e => e.group === 'global') ?? [];

  const totalPass = data?.exchanges.filter(e => e.ticker === 'pass' && e.btc_wd === 'pass' && e.usdt_wd === 'pass').length ?? 0;
  const totalFail = data?.exchanges.filter(e => e.ticker === 'error' || e.btc_wd === 'error' || e.usdt_wd === 'error').length ?? 0;

  return (
    <div className="space-y-4">
      <div className="ios-card rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            {isRunning && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-acc-amber bg-acc-amber/10 px-2.5 py-1 rounded-full">
                <Lightning className="w-3 h-3 animate-pulse" weight="fill" />
                크롤링 실행 중
              </span>
            )}
            {run && !isRunning && (
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                run.status === 'success'
                  ? 'bg-acc-green/10 text-acc-green'
                  : run.status === 'partial_success'
                    ? 'bg-acc-amber/10 text-acc-amber'
                    : 'bg-acc-red/10 text-acc-red'
              }`}>
                {run.status === 'success' ? '완료' : run.status === 'partial_success' ? '일부 완료' : '실패'}
              </span>
            )}
            {run && (
              <span className="text-xs text-label-tertiary">
                완료: {fmtTs(run.completed_at)} · ₩/$ {run.usd_krw_rate?.toLocaleString() ?? '-'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-1.5 text-xs text-label-tertiary cursor-pointer">
              <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
              자동 갱신 (1시간)
            </label>
            <button
              onClick={fetch}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs text-label-secondary hover:text-label-primary px-2.5 py-1.5 rounded-xl ios-card transition-colors disabled:opacity-40"
            >
              <ArrowsClockwise className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              새로고침
            </button>
            <button
              onClick={handleTrigger}
              disabled={triggering || isRunning}
              className="flex items-center gap-1.5 text-xs text-white bg-acc-amber hover:bg-acc-orange disabled:opacity-40 px-2.5 py-1.5 rounded-xl font-semibold transition-colors shadow-glow-sm"
            >
              <Lightning className="w-3.5 h-3.5" weight="fill" />
              {triggering ? '트리거 중...' : '크롤 실행'}
            </button>
          </div>
        </div>

        {data && (
          <div className="flex items-center gap-3 text-xs pt-1 border-t border-sys-separator">
            <span className="text-label-tertiary">전체 {data.exchanges.length}개</span>
            <span className="text-acc-green font-semibold">성공 {totalPass}</span>
            <span className={totalFail > 0 ? 'text-acc-red font-semibold' : 'text-label-tertiary'}>
              실패 {totalFail}
            </span>
            {(() => {
              const missing = data.exchanges.length - totalPass - totalFail;
              return missing > 0 ? <span className="text-label-tertiary">미수집 {missing}</span> : null;
            })()}
          </div>
        )}
      </div>

      {error && <p className="text-acc-red text-xs px-1">{error}</p>}

      {data && data.data_gaps.length > 0 && (
        <div className="ios-card rounded-xl px-4 py-3 border border-acc-amber/30 bg-acc-amber/5">
          <div className="flex items-center gap-1.5 mb-2">
            <WarningCircle className="w-4 h-4 text-acc-amber" weight="fill" />
            <span className="text-sm font-semibold text-label-primary">조치 필요 · 데이터 갭 {data.data_gaps.length}건</span>
          </div>
          <p className="text-[11px] text-label-secondary mb-2 leading-snug">
            출금이 활성 상태이지만 수수료가 수집되지 않아 해당 경로가 계산에서 제외됩니다. 크롤을 다시 실행하거나 수수료를 보완하세요.
          </p>
          <div className="space-y-1">
            {data.data_gaps.map((g, i) => (
              <div key={`${g.exchange}-${g.coin}-${g.network_label}-${i}`} className="flex items-center justify-between gap-2 text-xs">
                <span className="font-medium capitalize text-label-primary">
                  {g.exchange} · {g.coin}
                  {g.network_label && <span className="text-label-tertiary"> ({g.network_label})</span>}
                </span>
                <span className="text-[11px] text-acc-amber flex-shrink-0">{g.issue}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data && [
        { label: '국내 거래소', rows: korea },
        { label: '해외 거래소', rows: global },
      ].map(({ label, rows }) => (
        <div key={label}>
          <SectionLabel>{label}</SectionLabel>
          <div className="space-y-2">
            {rows.map(ex => {
              const allPass = ex.ticker === 'pass' && ex.btc_wd === 'pass' && ex.usdt_wd === 'pass';
              const st = (s: string) => isRunning ? 'running' : s;
              return (
                <div
                  key={ex.exchange}
                  className={`ios-card rounded-xl px-4 py-3 ${allPass ? '' : 'border-acc-red/25'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm capitalize text-label-primary">{ex.exchange}</span>
                    <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
                      <span className="text-[10px] text-label-tertiary">티커</span>
                      <StatusBadge status={st(ex.ticker)} />
                      <span className="text-[10px] text-label-tertiary ml-1">BTC</span>
                      <StatusBadge status={st(ex.btc_wd)} />
                      <span className="text-[10px] text-label-tertiary ml-1">USDT</span>
                      <StatusBadge status={st(ex.usdt_wd)} />
                    </div>
                  </div>
                  {ex.errors.length > 0 && (
                    <p className="text-[11px] text-acc-red mt-1.5 leading-snug">{ex.errors.join(' · ')}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {!data && !error && (
        <p className="text-label-tertiary text-xs text-center py-8">로딩 중...</p>
      )}
    </div>
  );
}
