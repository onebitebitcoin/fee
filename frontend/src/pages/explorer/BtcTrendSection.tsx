// 첫 화면 시세 카드 안쪽 아래 구역: 지난 24시간 가격 추이, 청산 규모, 선물 시장 신호.
// 시간별 청산 막대는 "시간별 보기"를 눌렀을 때만 펼친다.
// 선물 신호는 숫자보다 판정 한 단어(롱 과열, 매수 유입 등)를 크게 보여 줘서 처음 보는 사람도 바로 읽게 한다.
import { useEffect, useState } from 'react';
import { CaretDown } from '@phosphor-icons/react';
import { api } from '../../lib/api';
import type { Btc24hResponse, DerivativesSummary, LiquidationHour } from '../../types';
import {
  coveredHours, fmtHourKst, fmtTimeKst, fmtUsdCompact, fundingGaugePos, fundingReading, longShare, maxHourTotal,
  positionReading, signedPct, sparkPoints, type SignalTone,
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

      <div className="col-span-2 h-px bg-separator" />
      <div className="col-span-2">
        {data.derivatives
          ? <DerivativesSignals d={data.derivatives} priceChangePct={price.change_pct} />
          : <p className="text-[10px] text-acc-red text-center">선물 신호를 불러오지 못했습니다{data.derivatives_error ? `: ${data.derivatives_error}` : ''}</p>}
      </div>
    </>
  );
}

const TONE_CLASS: Record<SignalTone, string> = {
  up: 'text-acc-green',
  down: 'text-acc-red',
  warn: 'text-acc-orange',
  flat: 'text-label-primary',
};

function DerivativesSignals({ d, priceChangePct }: { d: DerivativesSummary; priceChangePct: number }) {
  const funding = fundingReading(d.funding_rate_pct);
  const flow = positionReading(d.oi_change_pct, priceChangePct);
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div title="롱이 많으면 롱이 숏에게, 숏이 많으면 숏이 롱에게 8시간마다 수수료를 냅니다">
          <p className="text-[10px] text-label-tertiary">롱·숏 쏠림</p>
          <p className={`text-[15px] font-bold ${TONE_CLASS[funding.tone]}`}>{funding.label}</p>
          <div className="relative h-1.5 mt-1 rounded-full bg-fill-primary">
            <span
              className="absolute top-1/2 w-2.5 h-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-label-primary ring-2 ring-sys-card"
              style={{ left: `${fundingGaugePos(d.funding_rate_pct)}%` }}
            />
          </div>
          <div className="flex justify-between text-[9px] text-label-quaternary mt-0.5">
            <span>숏</span><span className="num">펀딩비 {signedPct(d.funding_rate_pct, 3)}</span><span>롱</span>
          </div>
        </div>
        <div title="선물에 열려 있는 포지션의 양이 24시간 동안 늘었는지 줄었는지를 가격 방향과 함께 봅니다">
          <p className="text-[10px] text-label-tertiary">포지션 흐름</p>
          <p className={`text-[15px] font-bold ${TONE_CLASS[flow.tone]}`}>{flow.label}</p>
          <p className="text-[10px] text-label-secondary num mt-0.5">
            포지션 {signedPct(d.oi_change_pct, 1)} · 가격 {signedPct(priceChangePct, 1)}
          </p>
        </div>
      </div>
      <p className="text-[9px] text-label-quaternary mt-1">바이낸스 BTC 무기한 · 24시간 기준</p>
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
