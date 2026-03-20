import { AlertTriangle, ArrowDown, ArrowRight, Ban, BookOpen, ChevronDown, CheckCircle, ExternalLink, Globe, ShieldAlert, ShieldCheck, ShieldOff, Shuffle, XCircle } from 'lucide-react';
import { useState } from 'react';

import { ExchangeCarfGlobe } from '../components/ExchangeCarfGlobe';
import {
  ALL_EXCHANGES,
  CARF_GROUP_LABELS,
  CarfGroup,
  ExchangeCarfInfo,
  ExchangeSource,
  GLOBAL_EXCHANGES,
  KEY_INSIGHTS,
  KOREAN_EXCHANGES,
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
  if (status === 'compatible') {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-bnb-green/30 bg-bnb-green/10 px-1.5 py-0.5 text-[10px] font-semibold text-bnb-green">
        <Shuffle size={10} /> 호환
      </span>
    );
  }

  if (status === 'partial') {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-brand-500/30 bg-brand-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand-400">
        <Shuffle size={10} /> 부분
      </span>
    );
  }

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

function SourcesList({ sources }: { sources: ExchangeSource[] }) {
  return (
    <div className="flex flex-col gap-1 py-1">
      {sources.map((source, index) => (
        <a
          key={index}
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-center gap-1.5 text-[10px] text-bnb-muted transition-colors hover:text-brand-400"
        >
          <ExternalLink size={9} className="shrink-0" />
          <span className="underline-offset-2 group-hover:underline">{source.label}</span>
        </a>
      ))}
    </div>
  );
}

function ExchangeRow({ exchange, side }: { exchange: ExchangeCarfInfo; side: '출발' | '도착' }) {
  return (
    <div className="flex items-center justify-between gap-3 px-2 py-3 transition-colors hover:bg-dark-400/30 sm:px-4">
      <div className="flex min-w-0 items-center gap-2">
        <span className="w-10 shrink-0 text-[11px] text-bnb-muted">{side}</span>
        <span className="truncate text-sm font-semibold text-bnb-text">
          {exchange.name}
          <span className="ml-2 hidden text-xs font-normal text-bnb-muted sm:inline">
            <Globe size={10} className="mr-0.5 inline" />{exchange.registeredCountry}
          </span>
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-semibold ${carfBadgeClass(exchange.carfGroup)}`}>
          {carfIcon(exchange.carfGroup)}
          {CARF_GROUP_LABELS[exchange.carfGroup]}
        </span>
        {exchange.koreaBlocked ? (
          <span className="hidden sm:inline-flex items-center gap-1 rounded border border-bnb-red/30 bg-bnb-red/10 px-2 py-0.5 text-[11px] font-semibold text-bnb-red">
            <XCircle size={10} /> 차단
          </span>
        ) : null}
        {exchange.koreaService && !exchange.koreaBlocked ? (
          <span className="hidden sm:inline-flex items-center gap-1 rounded border border-bnb-green/30 bg-bnb-green/10 px-2 py-0.5 text-[11px] font-semibold text-bnb-green">
            <CheckCircle size={10} /> 한국
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function PolicyPage() {
  const [srcId, setSrcId] = useState<string>(KOREAN_EXCHANGES[0].id);
  const [dstId, setDstId] = useState<string>(GLOBAL_EXCHANGES[0].id);
  const [showSources, setShowSources] = useState(false);

  const src = KOREAN_EXCHANGES.find((exchange) => exchange.id === srcId) ?? KOREAN_EXCHANGES[0];
  const dst = GLOBAL_EXCHANGES.find((exchange) => exchange.id === dstId) ?? GLOBAL_EXCHANGES[0];
  const combined = combinedYear(src, dst);
  const isImpossible = dst.travelRuleKorea === 'none';

  return (
    <div className="animate-fade-in-up space-y-5">
      <div className="border-b border-dark-200 pb-4">
        <h1 className="font-display text-xl font-bold tracking-tight text-bnb-text">CARF 정책 현황</h1>
        <p className="mt-1 text-xs text-bnb-muted">거래소 경로별 CARF(암호화자산 보고 프레임워크) 적용 여부 및 정보교환 예정 연도</p>
      </div>

      <div className="divide-y divide-dark-200 border border-dark-200">
        <div className="flex flex-wrap items-center gap-2 px-2 py-3 sm:flex-nowrap sm:px-4">
          <div className="min-w-[120px] flex-1">
            <label className="mb-1 block text-[10px] uppercase tracking-wider text-bnb-muted">출발 (한국)</label>
            <select
              value={srcId}
              onChange={(event) => setSrcId(event.target.value)}
              className="w-full border border-dark-200 bg-dark-400 px-2.5 py-1.5 text-sm text-bnb-text focus:border-brand-500 focus:outline-none"
            >
              {KOREAN_EXCHANGES.map((exchange) => (
                <option key={exchange.id} value={exchange.id}>
                  {exchange.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end pb-1.5 sm:items-center sm:pb-0 sm:pt-5">
            <ArrowRight size={16} className="hidden text-brand-500 sm:block" />
            <ArrowDown size={16} className="text-brand-500 sm:hidden" />
          </div>

          <div className="min-w-[120px] flex-1">
            <label className="mb-1 block text-[10px] uppercase tracking-wider text-bnb-muted">도착 (글로벌)</label>
            <select
              value={dstId}
              onChange={(event) => { setDstId(event.target.value); setShowSources(false); }}
              className="w-full border border-dark-200 bg-dark-400 px-2.5 py-1.5 text-sm text-bnb-text focus:border-brand-500 focus:outline-none"
            >
              {GLOBAL_EXCHANGES.map((exchange) => (
                <option key={exchange.id} value={exchange.id}>
                  {exchange.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <ExchangeRow exchange={src} side="출발" />

        <div className={isImpossible ? 'opacity-50' : ''}>
          <ExchangeRow exchange={dst} side="도착" />
        </div>

        {isImpossible ? (
          <div className="flex items-center gap-3 border-t border-bnb-red/20 bg-bnb-red/10 px-2 py-3 sm:px-4">
            <Ban size={14} className="shrink-0 text-bnb-red" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-bnb-red">불가능한 경로</p>
              <p className="mt-0.5 text-[11px] text-bnb-muted">
                {dst.name}은(는) 트래블룰 미지원 거래소입니다. 한국 거래소(특금법)에서 공식적으로 출금이 불가합니다.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 bg-dark-400/40 px-2 py-3 sm:px-4">
            <div className="flex items-center gap-2 text-xs text-bnb-muted">
              <span className={`h-2 w-2 rounded-full ${impactDotClass(dst.koreaImpact)}`} />
              <span>
                한국 사용자 영향: <span className="font-semibold text-bnb-text">{impactLabel(dst.koreaImpact)}</span>
              </span>
            </div>
            <span className={`font-data text-xs font-bold ${combined.cls}`}>{combined.label}</span>
          </div>
        )}

        <div className="px-2 py-2.5 sm:px-4">
          <p className="text-[11px] leading-relaxed text-bnb-muted">{dst.impactDetail}</p>
        </div>
        {dst.sources && dst.sources.length > 0 && (
          <div className="border-t border-dark-200 px-2 py-2.5 sm:px-4">
            <button
              type="button"
              onClick={() => setShowSources((v) => !v)}
              className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-bnb-muted transition-colors hover:text-brand-400"
            >
              <BookOpen size={10} />
              출처 보기
              <ChevronDown size={10} className={`ml-0.5 transition-transform duration-150 ${showSources ? 'rotate-180' : ''}`} />
            </button>
            {showSources && <SourcesList sources={dst.sources} />}
          </div>
        )}
      </div>

      <ExchangeCarfGlobe exchanges={ALL_EXCHANGES} selectedSourceId={src.id} selectedDestinationId={dst.id} />

      <div className="divide-y divide-dark-200 border border-dark-200">
        <div className="px-2 py-2.5 sm:px-4">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-bnb-muted">요약</span>
        </div>
        {KEY_INSIGHTS.map((insight, index) => (
          <div key={index} className="flex items-start gap-2.5 px-2 py-2.5 sm:px-4">
            <AlertTriangle size={12} className="mt-0.5 shrink-0 text-brand-400" />
            <p className="text-xs leading-relaxed text-bnb-text">{insight}</p>
          </div>
        ))}
      </div>

      <div className="border border-dark-200">
        <div className="border-b border-dark-200 px-2 py-2.5 sm:px-4">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-bnb-muted">전체 거래소 CARF 현황</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-dark-200">
                <th className="whitespace-nowrap px-4 py-2 text-left font-semibold text-bnb-muted">거래소</th>
                <th className="hidden whitespace-nowrap px-4 py-2 text-left font-semibold text-bnb-muted sm:table-cell">등록 국가</th>
                <th className="whitespace-nowrap px-4 py-2 text-left font-semibold text-bnb-muted">CARF</th>
                <th className="hidden whitespace-nowrap px-4 py-2 text-left font-semibold text-bnb-muted sm:table-cell">수집 시작</th>
                <th className="whitespace-nowrap px-4 py-2 text-left font-semibold text-bnb-muted">첫 교환</th>
                <th className="hidden whitespace-nowrap px-4 py-2 text-left font-semibold text-bnb-muted md:table-cell">한국</th>
                <th className="hidden whitespace-nowrap px-4 py-2 text-left font-semibold text-bnb-muted lg:table-cell">트래블룰</th>
                <th className="hidden whitespace-nowrap px-4 py-2 text-left font-semibold text-bnb-muted lg:table-cell">한국 사용자 관할권</th>
                <th className="hidden whitespace-nowrap px-4 py-2 text-left font-semibold text-bnb-muted md:table-cell">영향도</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-200/60">
              <tr className="bg-dark-400/20">
                <td colSpan={9} className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-bnb-muted">
                  한국 거래소
                </td>
              </tr>
              {KOREAN_EXCHANGES.map((exchange) => (
                <tr key={exchange.id} className="transition-colors hover:bg-dark-400/30">
                  <td className="whitespace-nowrap px-4 py-2.5 font-medium text-bnb-text">{exchange.name}</td>
                  <td className="hidden whitespace-nowrap px-4 py-2.5 text-bnb-muted sm:table-cell">{exchange.registeredCountry}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${carfBadgeClass(exchange.carfGroup)}`}>
                      {carfIcon(exchange.carfGroup)}
                      {CARF_GROUP_LABELS[exchange.carfGroup]}
                    </span>
                  </td>
                  <td className="font-data hidden whitespace-nowrap px-4 py-2.5 text-xs text-bnb-text sm:table-cell">{exchange.carfDataCollectionStart ?? '—'}</td>
                  <td className="font-data whitespace-nowrap px-4 py-2.5 text-bnb-text">{exchange.carfFirstExchange ?? '—'}</td>
                  <td className="hidden px-4 py-2.5 md:table-cell">
                    <span className="inline-flex items-center gap-1 text-bnb-green">
                      <CheckCircle size={11} /> 제공
                    </span>
                  </td>
                  <td className="hidden px-4 py-2.5 lg:table-cell">
                    <span className="text-[10px] text-bnb-muted">한국 특금법 적용</span>
                  </td>
                  <td className="hidden px-4 py-2.5 lg:table-cell">
                    <span className="text-xs text-bnb-text">대한민국</span>
                  </td>
                  <td className="hidden px-4 py-2.5 md:table-cell">
                    <span className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${impactDotClass(exchange.koreaImpact)}`} />
                      {impactLabel(exchange.koreaImpact)}
                    </span>
                  </td>
                </tr>
              ))}

              <tr className="bg-dark-400/20">
                <td colSpan={9} className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-bnb-muted">
                  글로벌 거래소
                </td>
              </tr>
              {GLOBAL_EXCHANGES.map((exchange) => (
                <tr key={exchange.id} className="group transition-colors hover:bg-dark-400/30">
                  <td className="px-4 py-2.5 font-medium text-bnb-text">
                    <span className="whitespace-nowrap">{exchange.name}</span>
                    {exchange.sources && exchange.sources.length > 0 && (
                      <details className="mt-0.5">
                        <summary className="flex cursor-pointer list-none items-center gap-1 text-[10px] text-bnb-muted hover:text-brand-400">
                          <BookOpen size={8} />출처
                        </summary>
                        <SourcesList sources={exchange.sources} />
                      </details>
                    )}
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-2.5 text-bnb-muted sm:table-cell">{exchange.registeredCountry}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${carfBadgeClass(exchange.carfGroup)}`}>
                      {carfIcon(exchange.carfGroup)}
                      {CARF_GROUP_LABELS[exchange.carfGroup]}
                    </span>
                  </td>
                  <td className="font-data hidden whitespace-nowrap px-4 py-2.5 text-xs text-bnb-text sm:table-cell">{exchange.carfDataCollectionStart ?? '—'}</td>
                  <td className="font-data whitespace-nowrap px-4 py-2.5 text-bnb-text">{exchange.carfFirstExchange ?? '—'}</td>
                  <td className="hidden px-4 py-2.5 md:table-cell">
                    {exchange.koreaService ? (
                      <span className="inline-flex items-center gap-1 text-bnb-green">
                        <CheckCircle size={11} /> 제공
                      </span>
                    ) : exchange.koreaBlocked ? (
                      <span className="inline-flex items-center gap-1 text-bnb-red">
                        <XCircle size={11} /> 차단
                      </span>
                    ) : (
                      <span className="text-bnb-muted">미제공</span>
                    )}
                  </td>
                  <td className="hidden px-4 py-2.5 lg:table-cell">
                    {exchange.travelRuleKorea ? (
                      <div className="flex flex-col gap-0.5">
                        {travelRuleBadge(exchange.travelRuleKorea)}
                        <span className="max-w-[180px] text-[10px] leading-tight text-bnb-muted">{exchange.travelRuleNote}</span>
                      </div>
                    ) : (
                      <span className="text-bnb-muted">—</span>
                    )}
                  </td>
                  <td className="hidden px-4 py-2.5 lg:table-cell">
                    <div className="flex flex-col gap-0.5">
                      <span className="whitespace-nowrap text-xs text-bnb-text">{exchange.koreaUserJurisdiction ?? '—'}</span>
                      {exchange.koreaUserJurisdictionNote ? (
                        <span className="max-w-[200px] text-[10px] leading-tight text-bnb-muted">{exchange.koreaUserJurisdictionNote}</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="hidden px-4 py-2.5 md:table-cell">
                    <span className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${impactDotClass(exchange.koreaImpact)}`} />
                      {impactLabel(exchange.koreaImpact)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
