import { AlertTriangle, ArrowRight, CheckCircle, Globe, Info, ShieldAlert, ShieldCheck, ShieldOff, XCircle } from 'lucide-react';
import { useState } from 'react';
import {
  CARF_GROUP_LABELS,
  CarfGroup,
  ExchangeCarfInfo,
  GLOBAL_EXCHANGES,
  KEY_INSIGHTS,
  KOREAN_EXCHANGES,
} from '../data/carfData';

function carfBadgeClass(group: CarfGroup): string {
  if (group === '2027') return 'border-bnb-green/30 bg-bnb-green/10 text-bnb-green';
  if (group === '2028') return 'border-brand-500/30 bg-brand-500/10 text-brand-400';
  if (group === '2029') return 'border-bnb-muted/30 bg-bnb-muted/10 text-bnb-muted';
  if (group === 'not_member') return 'border-bnb-red/30 bg-bnb-red/10 text-bnb-red';
  return 'border-bnb-muted/30 bg-bnb-muted/10 text-bnb-muted';
}

function carfIcon(group: CarfGroup) {
  if (group === '2027') return <ShieldCheck size={14} className="text-bnb-green" />;
  if (group === '2028') return <ShieldCheck size={14} className="text-brand-400" />;
  if (group === '2029') return <ShieldAlert size={14} className="text-bnb-muted" />;
  if (group === 'not_member') return <ShieldOff size={14} className="text-bnb-red" />;
  return <ShieldOff size={14} className="text-bnb-muted" />;
}

function impactDotClass(impact: string): string {
  if (impact === 'high') return 'bg-bnb-red';
  if (impact === 'medium') return 'bg-brand-400';
  if (impact === 'low') return 'bg-bnb-muted';
  return 'bg-dark-100';
}

function impactLabel(impact: string): string {
  if (impact === 'high') return '높음';
  if (impact === 'medium') return '중간';
  if (impact === 'low') return '낮음';
  return '없음';
}

function combinedYearLabel(src: ExchangeCarfInfo, dst: ExchangeCarfInfo): { label: string; cls: string } {
  const years = [src.carfFirstExchange, dst.carfFirstExchange].filter(Boolean) as string[];
  if (years.length === 0) return { label: '교환 없음 (사각지대)', cls: 'text-bnb-red' };
  const earliest = years.sort()[0];
  if (earliest === '2027') return { label: `${earliest}년부터 양측 정보교환`, cls: 'text-bnb-green' };
  if (earliest === '2028') return { label: `${earliest}년부터 정보교환 시작`, cls: 'text-brand-400' };
  return { label: `${earliest}년부터 정보교환 시작`, cls: 'text-bnb-muted' };
}

interface ExchangeCardProps {
  exchange: ExchangeCarfInfo;
  side: 'source' | 'dest';
}

function ExchangeCard({ exchange, side }: ExchangeCardProps) {
  return (
    <div className="flex-1 rounded-lg border border-dark-200 bg-dark-300 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium text-bnb-muted uppercase tracking-wider mb-1">
            {side === 'source' ? '출발 거래소' : '도착 거래소'}
          </p>
          <p className="text-base font-bold text-bnb-text font-display">{exchange.name}</p>
          <p className="text-xs text-bnb-muted mt-0.5 flex items-center gap-1">
            <Globe size={10} />
            {exchange.registeredCountry}
          </p>
        </div>
        <div>{carfIcon(exchange.carfGroup)}</div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${carfBadgeClass(exchange.carfGroup)}`}
          >
            {carfIcon(exchange.carfGroup)}
            {CARF_GROUP_LABELS[exchange.carfGroup]}
          </span>
          {exchange.koreaBlocked && (
            <span className="inline-flex items-center gap-1 rounded-full border border-bnb-red/30 bg-bnb-red/10 px-2.5 py-0.5 text-[11px] font-semibold text-bnb-red">
              <XCircle size={10} />
              한국 차단
            </span>
          )}
          {exchange.koreaService && !exchange.koreaBlocked && (
            <span className="inline-flex items-center gap-1 rounded-full border border-bnb-green/30 bg-bnb-green/10 px-2.5 py-0.5 text-[11px] font-semibold text-bnb-green">
              <CheckCircle size={10} />
              한국 서비스
            </span>
          )}
        </div>

        <div className="flex items-start gap-1.5 rounded-md bg-dark-400/60 px-3 py-2">
          <Info size={11} className="mt-0.5 shrink-0 text-bnb-muted" />
          <p className="text-[11px] text-bnb-muted leading-relaxed">{exchange.impactDetail}</p>
        </div>
      </div>
    </div>
  );
}

export function PolicyPage() {
  const [srcId, setSrcId] = useState<string>(KOREAN_EXCHANGES[0].id);
  const [dstId, setDstId] = useState<string>(GLOBAL_EXCHANGES[0].id);

  const src = KOREAN_EXCHANGES.find((e) => e.id === srcId)!;
  const dst = GLOBAL_EXCHANGES.find((e) => e.id === dstId)!;
  const combined = combinedYearLabel(src, dst);

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-bnb-text font-display tracking-tight">CARF 정책 현황</h1>
        <p className="mt-1 text-sm text-bnb-muted">
          거래소 경로별 CARF(암호화자산 보고 프레임워크) 적용 여부 및 정보교환 예정 연도
        </p>
      </div>

      {/* Path Visualizer */}
      <div className="rounded-xl border border-dark-200 bg-dark-300/50 p-5 space-y-4">
        <p className="text-xs font-semibold text-bnb-muted uppercase tracking-wider">경로 선택</p>

        {/* Dropdowns */}
        <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
          <div className="flex-1 min-w-[140px]">
            <label className="block text-[11px] text-bnb-muted mb-1">출발 (한국 거래소)</label>
            <select
              value={srcId}
              onChange={(e) => setSrcId(e.target.value)}
              className="w-full rounded-md border border-dark-200 bg-dark-400 px-3 py-2 text-sm text-bnb-text focus:border-brand-500 focus:outline-none"
            >
              {KOREAN_EXCHANGES.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-center pt-5">
            <div className="flex items-center gap-1 px-3">
              <ArrowRight size={18} className="text-brand-500" />
            </div>
          </div>

          <div className="flex-1 min-w-[140px]">
            <label className="block text-[11px] text-bnb-muted mb-1">도착 (글로벌 거래소)</label>
            <select
              value={dstId}
              onChange={(e) => setDstId(e.target.value)}
              className="w-full rounded-md border border-dark-200 bg-dark-400 px-3 py-2 text-sm text-bnb-text focus:border-brand-500 focus:outline-none"
            >
              {GLOBAL_EXCHANGES.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Exchange Cards */}
        <div className="flex items-stretch gap-3 flex-col sm:flex-row">
          <ExchangeCard exchange={src} side="source" />

          <div className="flex items-center justify-center sm:py-0 py-1">
            <div className="flex flex-col items-center gap-1">
              <ArrowRight size={20} className="text-brand-500 hidden sm:block" />
              <div className="text-[10px] text-bnb-muted hidden sm:block">BTC 이동</div>
            </div>
          </div>

          <ExchangeCard exchange={dst} side="dest" />
        </div>

        {/* Combined Result */}
        <div className="rounded-lg border border-dark-200 bg-dark-400/60 px-4 py-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Info size={14} className="text-bnb-muted shrink-0" />
              <span className="text-xs text-bnb-muted">이 경로의 CARF 정보교환</span>
            </div>
            <span className={`text-sm font-bold font-data ${combined.cls}`}>{combined.label}</span>
          </div>
          <div className="mt-2 flex items-center gap-3 flex-wrap">
            <span className="text-[11px] text-bnb-muted">
              한국 사용자 영향도:
              <span className="ml-1 inline-flex items-center gap-1">
                <span className={`inline-block h-2 w-2 rounded-full ${impactDotClass(dst.koreaImpact)}`} />
                <span className="font-semibold text-bnb-text">{impactLabel(dst.koreaImpact)}</span>
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Key Insights */}
      <div className="rounded-xl border border-dark-200 bg-dark-300/50 p-5 space-y-3">
        <p className="text-xs font-semibold text-bnb-muted uppercase tracking-wider">핵심 인사이트</p>
        <ul className="space-y-2">
          {KEY_INSIGHTS.map((insight, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-bnb-text">
              <AlertTriangle size={13} className="mt-0.5 shrink-0 text-brand-400" />
              {insight}
            </li>
          ))}
        </ul>
      </div>

      {/* Full Exchange Table */}
      <div className="rounded-xl border border-dark-200 bg-dark-300/50 p-5 space-y-3">
        <p className="text-xs font-semibold text-bnb-muted uppercase tracking-wider">전체 거래소 CARF 현황</p>

        {/* Korean Exchanges */}
        <div className="space-y-2">
          <p className="text-xs text-bnb-muted font-medium">한국 거래소</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-200">
                  <th className="pb-2 text-left text-[11px] font-semibold text-bnb-muted">거래소</th>
                  <th className="pb-2 text-left text-[11px] font-semibold text-bnb-muted">등록 국가</th>
                  <th className="pb-2 text-left text-[11px] font-semibold text-bnb-muted">CARF 그룹</th>
                  <th className="pb-2 text-left text-[11px] font-semibold text-bnb-muted">첫 교환</th>
                  <th className="pb-2 text-left text-[11px] font-semibold text-bnb-muted">영향도</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-200/50">
                {KOREAN_EXCHANGES.map((ex) => (
                  <tr key={ex.id} className="hover:bg-dark-400/30 transition-colors">
                    <td className="py-2.5 pr-4 font-medium text-bnb-text whitespace-nowrap">{ex.name}</td>
                    <td className="py-2.5 pr-4 text-bnb-muted text-xs whitespace-nowrap">{ex.registeredCountry}</td>
                    <td className="py-2.5 pr-4">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${carfBadgeClass(ex.carfGroup)}`}>
                        {carfIcon(ex.carfGroup)}
                        {CARF_GROUP_LABELS[ex.carfGroup]}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 font-data text-xs text-bnb-text">
                      {ex.carfFirstExchange ?? '-'}
                    </td>
                    <td className="py-2.5">
                      <span className="flex items-center gap-1.5 text-xs">
                        <span className={`h-2 w-2 rounded-full ${impactDotClass(ex.koreaImpact)}`} />
                        {impactLabel(ex.koreaImpact)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Global Exchanges */}
        <div className="space-y-2 pt-2">
          <p className="text-xs text-bnb-muted font-medium">글로벌 거래소</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-200">
                  <th className="pb-2 text-left text-[11px] font-semibold text-bnb-muted">거래소</th>
                  <th className="pb-2 text-left text-[11px] font-semibold text-bnb-muted">등록 국가</th>
                  <th className="pb-2 text-left text-[11px] font-semibold text-bnb-muted">CARF 그룹</th>
                  <th className="pb-2 text-left text-[11px] font-semibold text-bnb-muted">첫 교환</th>
                  <th className="pb-2 text-left text-[11px] font-semibold text-bnb-muted">한국 서비스</th>
                  <th className="pb-2 text-left text-[11px] font-semibold text-bnb-muted">영향도</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-200/50">
                {GLOBAL_EXCHANGES.map((ex) => (
                  <tr key={ex.id} className="hover:bg-dark-400/30 transition-colors">
                    <td className="py-2.5 pr-4 font-medium text-bnb-text whitespace-nowrap">{ex.name}</td>
                    <td className="py-2.5 pr-4 text-bnb-muted text-xs whitespace-nowrap">{ex.registeredCountry}</td>
                    <td className="py-2.5 pr-4">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${carfBadgeClass(ex.carfGroup)}`}>
                        {carfIcon(ex.carfGroup)}
                        {CARF_GROUP_LABELS[ex.carfGroup]}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 font-data text-xs text-bnb-text">
                      {ex.carfFirstExchange ?? '-'}
                    </td>
                    <td className="py-2.5 pr-4">
                      {ex.koreaService ? (
                        <span className="inline-flex items-center gap-1 text-xs text-bnb-green">
                          <CheckCircle size={11} /> 제공
                        </span>
                      ) : ex.koreaBlocked ? (
                        <span className="inline-flex items-center gap-1 text-xs text-bnb-red">
                          <XCircle size={11} /> 차단
                        </span>
                      ) : (
                        <span className="text-xs text-bnb-muted">미제공</span>
                      )}
                    </td>
                    <td className="py-2.5">
                      <span className="flex items-center gap-1.5 text-xs">
                        <span className={`h-2 w-2 rounded-full ${impactDotClass(ex.koreaImpact)}`} />
                        {impactLabel(ex.koreaImpact)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Source note */}
      <p className="text-[11px] text-bnb-muted text-right">
        출처: OECD CARF 공식 문서 (2025) · 조사 기준일 2026-03-16
      </p>
    </div>
  );
}
