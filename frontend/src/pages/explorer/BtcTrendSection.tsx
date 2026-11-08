// 첫 화면 시세 카드 안쪽 아래 구역: 지난 24시간 가격 추이와 청산 규모.
// 시간별 청산 막대는 "시간별 보기"를 눌렀을 때만 펼친다.
import { useEffect, useState } from 'react';
import { CaretDown } from '@phosphor-icons/react';
import { api } from '../../lib/api';
import type { Btc24hResponse, LiquidationHour } from '../../types';
import {
  coveredHours, fmtHourKst, fmtTimeKst, fmtUsdCompact, longShare, maxHourTotal, sparkPoints,
} from './marketOverview';

const REFRESH_MS = 5 * 60 * 1000;
const usd = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`;

export function BtcTrendSection() {
  const [data, setData] = useState<Btc24hResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hourlyOpen, setHourlyOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () => api.getBtc24h()
      .then(d => { if (alive) { setData(d); setError(null); } })
      .catch((e: Error) => { if (alive) setError(e.message); });
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (!data) {
    return (
      <div className="col-span-2 text-center py-1">
        <p className={`text-[10px] ${error ? 'text-acc-red' : 'text-label-tertiary'}`}>
          {error ? `24시간 추이를 불러오지 못했습니다: ${error}` : '24시간 추이 불러오는 중…'}
        </p>
      </div>
    );
  }

  const { price, liquidations: liq } = data;
  const share = longShare(liq.total_long_usd, liq.total_short_usd);
  const covered = coveredHours(liq.hours);

  return (
    <>
      <div className="col-span-2 h-px bg-separator" />
      <div className="col-span-2">
        <div className="flex items-baseline justify-between mb-1">
          <p className="text-[10px] text-label-tertiary">
            24시간 가격 추이{' '}
            <span className={`font-semibold num ${price.change_pct >= 0 ? 'text-acc-green' : 'text-acc-red'}`}>
              {price.change_pct >= 0 ? '+' : ''}{price.change_pct.toFixed(2)}%
            </span>
          </p>
          <p className="text-[10px] text-label-tertiary num">저 {usd(price.low)} · 고 {usd(price.high)}</p>
        </div>
        <Sparkline values={price.points.map(p => p.close)} up={price.change_pct >= 0} />
        <div className="flex justify-between text-[9px] text-label-quaternary num mt-0.5">
          <span>{price.points.length ? `${fmtHourKst(price.points[0].t)}` : ''}</span>
          <span>{price.points.length ? `${fmtHourKst(price.points[price.points.length - 1].t)}` : ''}</span>
        </div>
      </div>

      <div className="col-span-2 h-px bg-separator" />
      <div className="col-span-2">
        <div className="flex items-baseline justify-between mb-1.5">
          <p className="text-[10px] text-label-tertiary">24시간 청산 규모</p>
          <p className="text-[10px] text-label-secondary font-semibold num">
            {fmtUsdCompact(liq.total_long_usd + liq.total_short_usd)}
          </p>
        </div>
        <div className="flex justify-between text-[11px] mb-1">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm bg-acc-red" />롱 <b className="num">{fmtUsdCompact(liq.total_long_usd)}</b>
          </span>
          <span className="flex items-center gap-1.5">
            숏 <b className="num">{fmtUsdCompact(liq.total_short_usd)}</b><span className="w-2 h-2 rounded-sm bg-acc-green" />
          </span>
        </div>
        <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-fill-tertiary">
          {share != null && (
            <>
              <div className="h-full bg-acc-red" style={{ width: `${share}%` }} />
              <div className="h-full bg-acc-green" style={{ width: `${100 - share}%` }} />
            </>
          )}
        </div>
        <button
          onClick={() => setHourlyOpen(o => !o)}
          aria-expanded={hourlyOpen}
          className="inline-flex items-center gap-0.5 mt-1.5 text-[10px] font-medium text-acc-brand hover:opacity-80 transition-opacity"
        >
          시간별 보기
          <CaretDown className={`w-2.5 h-2.5 transition-transform ${hourlyOpen ? 'rotate-180' : ''}`} weight="bold" />
        </button>
        {hourlyOpen && <LiquidationBars hours={liq.hours} />}
        <p className="text-[9px] text-label-quaternary mt-1 leading-relaxed">
          OKX BTC 무기한 기준
          {covered < liq.hours.length && liq.covered_from
            ? ` · ${fmtTimeKst(new Date(liq.covered_from))}부터 기록(${covered}시간분)`
            : ''}
        </p>
      </div>
    </>
  );
}

function Sparkline({ values, up }: { values: number[]; up: boolean }) {
  const W = 300, H = 56;
  const pts = sparkPoints(values).map(p => `${(p.x * (W - 4) + 2).toFixed(1)},${(p.y * (H - 6) + 3).toFixed(1)}`);
  if (pts.length < 2) return <div className="h-14" />;
  const color = up ? 'rgb(var(--acc-green))' : 'rgb(var(--acc-red))';
  const [lx, ly] = pts[pts.length - 1].split(',');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-14" preserveAspectRatio="none" role="img" aria-label="24시간 가격 추이">
      <defs>
        <linearGradient id="btc-trend-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.22" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`2,${H} ${pts.join(' ')} ${W - 2},${H}`} fill="url(#btc-trend-fill)" />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={lx} cy={ly} r="2.5" fill={color} />
    </svg>
  );
}

function LiquidationBars({ hours }: { hours: LiquidationHour[] }) {
  const max = maxHourTotal(hours) || 1;
  return (
    <div className="mt-2">
      <div className="flex items-end gap-[2px] h-14">
        {hours.map(h => {
          const label = `${fmtHourKst(h.t)} ${h.long == null ? '기록 없음' : `롱 ${fmtUsdCompact(h.long)} · 숏 ${fmtUsdCompact(h.short ?? 0)}`}`;
          if (h.long == null) {
            return <div key={h.t} title={label} className="flex-1 h-[2px] rounded-sm bg-fill-tertiary" />;
          }
          const total = h.long + (h.short ?? 0);
          return (
            <div key={h.t} title={label} className="flex-1 flex flex-col justify-end" style={{ height: `${Math.max(4, (total / max) * 100)}%` }}>
              <div className="bg-acc-green rounded-t-sm" style={{ flexGrow: h.short ?? 0 }} />
              <div className="bg-acc-red rounded-b-sm" style={{ flexGrow: h.long }} />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[9px] text-label-quaternary num mt-0.5">
        <span>{hours.length ? `${fmtHourKst(hours[0].t)}` : ''}</span>
        <span>{hours.length ? `${fmtHourKst(hours[hours.length - 1].t)}` : ''}</span>
      </div>
    </div>
  );
}
