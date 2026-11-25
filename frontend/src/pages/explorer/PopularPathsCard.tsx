// 첫 화면 '많이 쓰는 경로 TOP 5'. 업비트·빗썸 ↔ 바이낸스·OKX 로 짠 간결한 경로 중 지금 쓸 수 있는 것만 보여 준다.
// 고르는 규칙은 백엔드(domain/popular_paths.py)에 있고, 이 카드는 방향(살 때/팔 때)에 맞는 목록을 그린다.
import { useEffect, useState } from 'react';
import { CaretRight } from '@phosphor-icons/react';
import { api } from '../../lib/api';
import { formatFeeKrw, formatPercent } from '../../lib/formatBtc';
import type { PathMode, PopularPathsResponse } from '../../types';
import { GATE_BADGE, GATE_BADGE_CLASS, gateSeverity } from './depositGate';
import { popularBasisLabel, popularStops } from './popularPaths';
import { ExFavicon } from './ui';

const REFRESH_MS = 5 * 60 * 1000;

interface PopularPathsCardProps {
  mode: PathMode;
}

export function PopularPathsCard({ mode }: PopularPathsCardProps) {
  const [data, setData] = useState<PopularPathsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    const load = () => api.getPopularPaths(mode)
      .then(d => { if (alive) { setData(d); setError(null); } })
      .catch((e: Error) => { if (alive) setError(e.message); });
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => { alive = false; clearInterval(id); };
  }, [mode]);

  return (
    <div className="ios-card rounded-2xl px-4 py-3">
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-[12px] font-bold text-label-primary">많이 쓰는 경로 TOP 5</p>
        {data && <p className="text-[10px] text-label-tertiary num">{popularBasisLabel(data)}</p>}
      </div>
      <p className="text-[10px] text-label-tertiary mb-2 leading-relaxed">
        업비트·빗썸, 바이낸스·OKX 만 거치는 간결한 경로입니다. 네트워크 점검으로 막힌 경로는 뺐습니다.
      </p>

      {!data ? (
        <p className={`text-[11px] text-center py-1 ${error ? 'text-acc-red' : 'text-label-tertiary'}`}>
          {error ? `경로를 불러오지 못했습니다: ${error}` : '경로 불러오는 중…'}
        </p>
      ) : (
        <ol>
          {data.paths.map((p, i) => {
            const stops = popularStops(p, mode);
            const level = gateSeverity(p.deposit_gates ?? []);
            return (
              <li key={p.path_id} className="border-t border-separator first:border-t-0 py-2 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className={`text-[13px] font-bold num w-4 text-center ${i < 3 ? 'text-acc-brand' : 'text-label-tertiary'}`}>{i + 1}</span>
                  {level && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${GATE_BADGE_CLASS[level]}`}>
                      {GATE_BADGE[level]}
                    </span>
                  )}
                  <span className="ml-auto text-right flex-shrink-0">
                    <span className="text-[13px] font-bold text-acc-red num">-{formatFeeKrw(p.total_fee_krw)}</span>
                    <span className="ml-1.5 text-[10px] text-label-tertiary num">{formatPercent(p.fee_pct)}</span>
                  </span>
                </div>
                {/* 화살표를 정거장 뒤에 붙여 줄이 바뀌어도 새 줄이 정거장 이름으로 시작하게 한다 */}
                <div className="flex flex-wrap items-center gap-x-1 gap-y-1 pl-6">
                  {stops.map((stop, si) => (
                    <span key={si} className="flex items-center gap-1">
                      {stop.iconId && <ExFavicon id={stop.iconId} size={14} />}
                      <span className={`text-[12px] whitespace-nowrap ${stop.iconId ? 'font-semibold text-label-primary' : 'text-label-secondary'}`}>
                        {stop.label}
                      </span>
                      {si < stops.length - 1 && <CaretRight className="w-2.5 h-2.5 text-label-quaternary flex-shrink-0" weight="bold" />}
                    </span>
                  ))}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
