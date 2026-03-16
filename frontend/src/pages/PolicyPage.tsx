import { AlertTriangle, ArrowDown, ArrowRight, CheckCircle, ExternalLink, Globe, ShieldAlert, ShieldCheck, ShieldOff, Shuffle, XCircle } from 'lucide-react';
import { useState } from 'react';
import {
  CARF_GROUP_LABELS,
  CarfGroup,
  ExchangeCarfInfo,
  GLOBAL_EXCHANGES,
  KEY_INSIGHTS,
  KOREAN_EXCHANGES,
  SOURCES,
  TravelRuleStatus,
} from '../data/carfData';

function carfBadgeClass(group: CarfGroup): string {
  if (group === '2027') return 'border-bnb-green/30 bg-bnb-green/10 text-bnb-green';
  if (group === '2028') return 'border-brand-500/30 bg-brand-500/10 text-brand-400';
  if (group === '2029') return 'border-bnb-muted/30 bg-bnb-muted/10 text-bnb-muted';
  if (group === 'not_member') return 'border-bnb-red/30 bg-bnb-red/10 text-bnb-red';
  return 'border-bnb-muted/30 bg-bnb-muted/10 text-bnb-muted';
}

function carfIcon(group: CarfGroup, size = 12) {
  if (group === '2027') return <ShieldCheck size={size} className="text-bnb-green" />;
  if (group === '2028') return <ShieldCheck size={size} className="text-brand-400" />;
  if (group === '2029') return <ShieldAlert size={size} className="text-bnb-muted" />;
  return <ShieldOff size={size} className="text-bnb-red" />;
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

function travelRuleBadge(status: TravelRuleStatus) {
  if (status === 'compatible')
    return (
      <span className="inline-flex items-center gap-1 rounded border border-bnb-green/30 bg-bnb-green/10 px-1.5 py-0.5 text-[10px] font-semibold text-bnb-green">
        <Shuffle size={10} /> 호환
      </span>
    );
  if (status === 'partial')
    return (
      <span className="inline-flex items-center gap-1 rounded border border-brand-500/30 bg-brand-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand-400">
        <Shuffle size={10} /> 부분
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded border border-bnb-red/30 bg-bnb-red/10 px-1.5 py-0.5 text-[10px] font-semibold text-bnb-red">
      <XCircle size={10} /> 미적용
    </span>
  );
}

function combinedYear(src: ExchangeCarfInfo, dst: ExchangeCarfInfo): { label: string; cls: string } {
  const years = [src.carfFirstExchange, dst.carfFirstExchange].filter(Boolean) as string[];
  if (years.length === 0) return { label: '교환 없음 (사각지대)', cls: 'text-bnb-red' };
  const earliest = years.sort()[0];
  if (earliest === '2027') return { label: `${earliest}년부터 양측 정보교환`, cls: 'text-bnb-green' };
  if (earliest === '2028') return { label: `${earliest}년부터 정보교환 시작`, cls: 'text-brand-400' };
  return { label: `${earliest}년부터 정보교환 시작`, cls: 'text-bnb-muted' };
}

function ExchangeRow({ exchange, side }: { exchange: ExchangeCarfInfo; side: '출발' | '도착' }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-dark-400/30 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-14 shrink-0">
          <span className="text-[11px] text-bnb-muted">{side}</span>
        </div>
        <div className="min-w-0">
          <span className="text-sm font-semibold text-bnb-text">{exchange.name}</span>
          <span className="ml-2 text-xs text-bnb-muted hidden sm:inline">
            <Globe size={10} className="inline mr-0.5" />
            {exchange.registeredCountry}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-semibold ${carfBadgeClass(exchange.carfGroup)}`}>
          {carfIcon(exchange.carfGroup)}
          {CARF_GROUP_LABELS[exchange.carfGroup]}
        </span>
        {exchange.koreaBlocked && (
          <span className="hidden sm:inline-flex items-center gap-1 rounded border border-bnb-red/30 bg-bnb-red/10 px-2 py-0.5 text-[11px] font-semibold text-bnb-red">
            <XCircle size={10} />
            차단
          </span>
        )}
        {exchange.koreaService && !exchange.koreaBlocked && (
          <span className="hidden sm:inline-flex items-center gap-1 rounded border border-bnb-green/30 bg-bnb-green/10 px-2 py-0.5 text-[11px] font-semibold text-bnb-green">
            <CheckCircle size={10} />
            한국
          </span>
        )}
      </div>
    </div>
  );
}

export function PolicyPage() {
  const [srcId, setSrcId] = useState<string>(KOREAN_EXCHANGES[0].id);
  const [dstId, setDstId] = useState<string>(GLOBAL_EXCHANGES[0].id);

  const src = KOREAN_EXCHANGES.find((e) => e.id === srcId)!;
  const dst = GLOBAL_EXCHANGES.find((e) => e.id === dstId)!;
  const combined = combinedYear(src, dst);

  return (
    <div className="space-y-5 animate-fade-in-up">

      {/* Header */}
      <div className="border-b border-dark-200 pb-4">
        <h1 className="text-xl font-bold text-bnb-text font-display tracking-tight">CARF 정책 현황</h1>
        <p className="mt-1 text-xs text-bnb-muted">
          거래소 경로별 CARF(암호화자산 보고 프레임워크) 적용 여부 및 정보교환 예정 연도
        </p>
      </div>

      {/* Path Visualizer */}
      <div className="border border-dark-200 divide-y divide-dark-200">
        {/* Dropdowns */}
        <div className="px-4 py-3 flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <div className="flex-1 min-w-[120px]">
            <label className="block text-[10px] text-bnb-muted mb-1 uppercase tracking-wider">출발 (한국)</label>
            <select
              value={srcId}
              onChange={(e) => setSrcId(e.target.value)}
              className="w-full border border-dark-200 bg-dark-400 px-2.5 py-1.5 text-sm text-bnb-text focus:border-brand-500 focus:outline-none"
            >
              {KOREAN_EXCHANGES.map((ex) => (
                <option key={ex.id} value={ex.id}>{ex.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-end pb-1.5 sm:pb-0 sm:items-center sm:pt-5">
            <ArrowRight size={16} className="text-brand-500 hidden sm:block" />
            <ArrowDown size={16} className="text-brand-500 sm:hidden" />
          </div>

          <div className="flex-1 min-w-[120px]">
            <label className="block text-[10px] text-bnb-muted mb-1 uppercase tracking-wider">도착 (글로벌)</label>
            <select
              value={dstId}
              onChange={(e) => setDstId(e.target.value)}
              className="w-full border border-dark-200 bg-dark-400 px-2.5 py-1.5 text-sm text-bnb-text focus:border-brand-500 focus:outline-none"
            >
              {GLOBAL_EXCHANGES.map((ex) => (
                <option key={ex.id} value={ex.id}>{ex.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Source row */}
        <ExchangeRow exchange={src} side="출발" />

        {/* Dest row */}
        <ExchangeRow exchange={dst} side="도착" />

        {/* Combined result */}
        <div className="px-4 py-3 flex items-center justify-between gap-3 bg-dark-400/40">
          <div className="flex items-center gap-2 text-xs text-bnb-muted">
            <span className={`h-2 w-2 rounded-full ${impactDotClass(dst.koreaImpact)}`} />
            <span>한국 사용자 영향: <span className="font-semibold text-bnb-text">{impactLabel(dst.koreaImpact)}</span></span>
          </div>
          <span className={`text-xs font-bold font-data ${combined.cls}`}>{combined.label}</span>
        </div>

        {/* Detail note for destination */}
        <div className="px-4 py-2.5">
          <p className="text-[11px] text-bnb-muted leading-relaxed">{dst.impactDetail}</p>
        </div>
      </div>

      {/* Key Insights */}
      <div className="border border-dark-200 divide-y divide-dark-200">
        <div className="px-4 py-2.5">
          <span className="text-[11px] font-semibold text-bnb-muted uppercase tracking-wider">요약</span>
        </div>
        {KEY_INSIGHTS.map((insight, i) => (
          <div key={i} className="px-4 py-2.5 flex items-start gap-2.5">
            <AlertTriangle size={12} className="mt-0.5 shrink-0 text-brand-400" />
            <p className="text-xs text-bnb-text leading-relaxed">{insight}</p>
          </div>
        ))}
      </div>

      {/* Exchange Table */}
      <div className="border border-dark-200">
        <div className="px-4 py-2.5 border-b border-dark-200">
          <span className="text-[11px] font-semibold text-bnb-muted uppercase tracking-wider">전체 거래소 CARF 현황</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-dark-200">
                <th className="px-4 py-2 text-left font-semibold text-bnb-muted whitespace-nowrap">거래소</th>
                <th className="px-4 py-2 text-left font-semibold text-bnb-muted whitespace-nowrap hidden sm:table-cell">등록 국가</th>
                <th className="px-4 py-2 text-left font-semibold text-bnb-muted whitespace-nowrap">CARF</th>
                <th className="px-4 py-2 text-left font-semibold text-bnb-muted whitespace-nowrap">첫 교환</th>
                <th className="px-4 py-2 text-left font-semibold text-bnb-muted whitespace-nowrap hidden md:table-cell">한국</th>
                <th className="px-4 py-2 text-left font-semibold text-bnb-muted whitespace-nowrap hidden lg:table-cell">트래블룰</th>
                <th className="px-4 py-2 text-left font-semibold text-bnb-muted whitespace-nowrap hidden lg:table-cell">한국 사용자 관할권</th>
                <th className="px-4 py-2 text-left font-semibold text-bnb-muted whitespace-nowrap hidden md:table-cell">영향도</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-200/60">
              {/* Korean exchanges */}
              <tr className="bg-dark-400/20">
                <td colSpan={8} className="px-4 py-1.5 text-[10px] font-semibold text-bnb-muted uppercase tracking-wider">한국 거래소</td>
              </tr>
              {KOREAN_EXCHANGES.map((ex) => (
                <tr key={ex.id} className="hover:bg-dark-400/30 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-bnb-text whitespace-nowrap">{ex.name}</td>
                  <td className="px-4 py-2.5 text-bnb-muted whitespace-nowrap hidden sm:table-cell">{ex.registeredCountry}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${carfBadgeClass(ex.carfGroup)}`}>
                      {carfIcon(ex.carfGroup)}
                      {CARF_GROUP_LABELS[ex.carfGroup]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-data text-bnb-text whitespace-nowrap">{ex.carfFirstExchange ?? '—'}</td>
                  <td className="px-4 py-2.5 hidden md:table-cell">
                    <span className="inline-flex items-center gap-1 text-bnb-green">
                      <CheckCircle size={11} /> 제공
                    </span>
                  </td>
                  <td className="px-4 py-2.5 hidden lg:table-cell">
                    <span className="text-[10px] text-bnb-muted">한국 특금법 적용</span>
                  </td>
                  <td className="px-4 py-2.5 hidden lg:table-cell">
                    <span className="text-xs text-bnb-text">대한민국</span>
                  </td>
                  <td className="px-4 py-2.5 hidden md:table-cell">
                    <span className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${impactDotClass(ex.koreaImpact)}`} />
                      {impactLabel(ex.koreaImpact)}
                    </span>
                  </td>
                </tr>
              ))}
              {/* Global exchanges */}
              <tr className="bg-dark-400/20">
                <td colSpan={8} className="px-4 py-1.5 text-[10px] font-semibold text-bnb-muted uppercase tracking-wider">글로벌 거래소</td>
              </tr>
              {GLOBAL_EXCHANGES.map((ex) => (
                <tr key={ex.id} className="hover:bg-dark-400/30 transition-colors group">
                  <td className="px-4 py-2.5 font-medium text-bnb-text whitespace-nowrap">{ex.name}</td>
                  <td className="px-4 py-2.5 text-bnb-muted whitespace-nowrap hidden sm:table-cell">{ex.registeredCountry}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${carfBadgeClass(ex.carfGroup)}`}>
                      {carfIcon(ex.carfGroup)}
                      {CARF_GROUP_LABELS[ex.carfGroup]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-data text-bnb-text whitespace-nowrap">{ex.carfFirstExchange ?? '—'}</td>
                  <td className="px-4 py-2.5 hidden md:table-cell">
                    {ex.koreaService ? (
                      <span className="inline-flex items-center gap-1 text-bnb-green"><CheckCircle size={11} /> 제공</span>
                    ) : ex.koreaBlocked ? (
                      <span className="inline-flex items-center gap-1 text-bnb-red"><XCircle size={11} /> 차단</span>
                    ) : (
                      <span className="text-bnb-muted">미제공</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 hidden lg:table-cell">
                    {ex.travelRuleKorea ? (
                      <div className="flex flex-col gap-0.5">
                        {travelRuleBadge(ex.travelRuleKorea)}
                        <span className="text-[10px] text-bnb-muted leading-tight max-w-[180px]">{ex.travelRuleNote}</span>
                      </div>
                    ) : <span className="text-bnb-muted">—</span>}
                  </td>
                  <td className="px-4 py-2.5 hidden lg:table-cell">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-bnb-text whitespace-nowrap">{ex.koreaUserJurisdiction ?? '—'}</span>
                      {ex.koreaUserJurisdictionNote && (
                        <span className="text-[10px] text-bnb-muted leading-tight max-w-[200px]">{ex.koreaUserJurisdictionNote}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 hidden md:table-cell">
                    <span className="flex items-center gap-1.5">
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

      {/* Sources */}
      <div className="border border-dark-200 divide-y divide-dark-200">
        <div className="px-4 py-2.5">
          <span className="text-[11px] font-semibold text-bnb-muted uppercase tracking-wider">데이터 출처</span>
        </div>
        {SOURCES.map((src, i) => (
          <a
            key={i}
            href={src.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-dark-400/30 transition-colors group"
          >
            <span className="text-xs text-bnb-muted group-hover:text-bnb-text transition-colors leading-relaxed">{src.label}</span>
            <ExternalLink size={11} className="shrink-0 text-bnb-muted group-hover:text-brand-400 transition-colors" />
          </a>
        ))}
        <div className="px-4 py-2 flex justify-end">
          <span className="text-[10px] text-bnb-muted">조사 기준일 2026-03-16</span>
        </div>
      </div>
    </div>
  );
}
