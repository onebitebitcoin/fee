import type { CheapestPathBreakdown } from '../types';

const SEGMENT_COLORS = [
  'bg-brand-500',
  'bg-bnb-green',
  'bg-blue-400',
  'bg-purple-400',
  'bg-cyan-400',
];

type FeeBreakdownBarProps = {
  breakdown: CheapestPathBreakdown;
  className?: string;
};

export function FeeBreakdownBar({ breakdown, className = '' }: FeeBreakdownBarProps) {
  const { components, total_fee_krw } = breakdown;
  if (!components.length || total_fee_krw <= 0) return null;

  return (
    <div className={className}>
      {/* Segmented bar */}
      <div className="fee-bar-track flex gap-px overflow-hidden rounded-full">
        {components.map((c, i) => {
          const pct = Math.max((c.amount_krw / total_fee_krw) * 100, 1);
          return (
            <div
              key={i}
              className={`fee-bar-segment ${SEGMENT_COLORS[i % SEGMENT_COLORS.length]}`}
              style={{ width: `${pct}%` }}
              title={`${c.label}: ${c.amount_krw.toLocaleString('ko-KR')} KRW`}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
        {components.map((c, i) => {
          const pct = ((c.amount_krw / total_fee_krw) * 100).toFixed(0);
          return (
            <div key={i} className="flex items-center gap-1">
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${SEGMENT_COLORS[i % SEGMENT_COLORS.length]}`}
              />
              <span className="text-[10px] text-bnb-muted truncate max-w-[120px]" title={c.label}>
                {c.label}
              </span>
              <span className="text-[10px] text-bnb-muted font-data">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
