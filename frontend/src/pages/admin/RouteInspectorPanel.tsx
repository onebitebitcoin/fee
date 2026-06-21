import { useState } from 'react';
import { ArrowsClockwise, CheckCircle, Warning, XCircle } from '@phosphor-icons/react';
import { fetchRouteInspect, type InspectResult } from '../../lib/routeInspect';
import { SectionLabel } from './adminHelpers';

const SEVERITY_CFG = {
  ok:      { icon: CheckCircle, cls: 'text-acc-green',  bg: 'bg-acc-green/10',  label: 'OK' },
  warning: { icon: Warning,     cls: 'text-acc-amber',  bg: 'bg-acc-amber/10',  label: '경고' },
  error:   { icon: XCircle,     cls: 'text-acc-red',    bg: 'bg-acc-red/10',    label: '오류' },
};

function ResultRow({ result }: { result: InspectResult }) {
  const [open, setOpen] = useState(false);
  const cfg = SEVERITY_CFG[result.severity] ?? SEVERITY_CFG.error;
  const Icon = cfg.icon;

  return (
    <div className={`rounded-xl border ${result.severity === 'error' ? 'border-acc-red/20' : result.severity === 'warning' ? 'border-acc-amber/20' : 'border-sys-separator'}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={`w-4 h-4 flex-shrink-0 ${cfg.cls}`} weight="fill" />
          <span className="text-xs font-mono text-label-secondary truncate">{result.path_id}</span>
        </div>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 font-semibold ${cfg.bg} ${cfg.cls}`}>
          {cfg.label}
        </span>
      </button>
      {open && result.issues.length > 0 && (
        <div className="px-4 pb-3 space-y-1 border-t border-sys-separator">
          {result.issues.map((issue, i) => (
            <p key={i} className={`text-[11px] ${cfg.cls}`}>{issue}</p>
          ))}
        </div>
      )}
    </div>
  );
}

export function RouteInspectorPanel() {
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchRouteInspect>> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amountKrw, setAmountKrw] = useState(1_000_000);

  async function handleRun() {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchRouteInspect(amountKrw));
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류');
    } finally {
      setLoading(false);
    }
  }

  const summary = data?.summary;
  const filtered = data?.results ?? [];

  return (
    <div className="space-y-4">
      {/* 컨트롤 */}
      <div className="ios-card rounded-2xl p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <label className="text-xs text-label-tertiary">투자 금액</label>
          <select
            value={amountKrw}
            onChange={e => setAmountKrw(Number(e.target.value))}
            className="bg-white border border-[rgba(160,100,40,0.20)] rounded-lg px-2 py-1 text-xs outline-none"
          >
            {[100_000, 500_000, 1_000_000, 5_000_000, 10_000_000].map(v => (
              <option key={v} value={v}>{(v / 10000).toLocaleString()}만원</option>
            ))}
          </select>
        </div>
        <button
          onClick={handleRun}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-acc-amber text-white font-semibold hover:bg-acc-orange transition-colors disabled:opacity-40"
        >
          <ArrowsClockwise className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? '검사 중...' : '경로 검사 실행'}
        </button>
      </div>

      {error && <p className="text-acc-red text-xs px-1">{error}</p>}

      {/* 요약 */}
      {summary && (
        <div className="ios-card rounded-2xl p-4">
          <div className="flex items-center gap-4 text-sm">
            <span className="text-label-tertiary text-xs">전체 {summary.total}개</span>
            <span className="text-acc-green font-semibold text-xs">OK {summary.ok}</span>
            {summary.warnings > 0 && <span className="text-acc-amber font-semibold text-xs">경고 {summary.warnings}</span>}
            {summary.errors > 0 && <span className="text-acc-red font-semibold text-xs">오류 {summary.errors}</span>}
          </div>
        </div>
      )}

      {/* 오류/경고 결과 */}
      {filtered.filter(r => r.severity !== 'ok').length > 0 && (
        <div>
          <SectionLabel>이상 경로</SectionLabel>
          <div className="space-y-2">
            {filtered.filter(r => r.severity !== 'ok').map(r => (
              <ResultRow key={r.path_id} result={r} />
            ))}
          </div>
        </div>
      )}

      {/* 정상 경로 */}
      {filtered.filter(r => r.severity === 'ok').length > 0 && (
        <div>
          <SectionLabel>정상 경로</SectionLabel>
          <div className="space-y-1">
            {filtered.filter(r => r.severity === 'ok').map(r => (
              <ResultRow key={r.path_id} result={r} />
            ))}
          </div>
        </div>
      )}

      {data && filtered.length === 0 && (
        <p className="text-xs text-label-tertiary text-center py-8">경로 없음 — 크롤 데이터가 필요합니다.</p>
      )}

      {!data && !loading && (
        <p className="text-xs text-label-tertiary text-center py-8">위 버튼을 눌러 경로 검사를 실행하세요.</p>
      )}
    </div>
  );
}
