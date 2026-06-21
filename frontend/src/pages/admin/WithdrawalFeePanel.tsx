import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import type { WithdrawalRow } from '../../types';

const WD_SOURCE_META: Record<string, { label: string; cls: string }> = {
  realtime_api:    { label: '실시간 API', cls: 'bg-acc-green/10 text-acc-green' },
  static:          { label: '정적',       cls: 'bg-acc-amber/15 text-acc-amber' },
  static_fallback: { label: '정적',       cls: 'bg-acc-amber/15 text-acc-amber' },
  scraped_page:    { label: '스크래핑',   cls: 'bg-acc-blue/10 text-acc-blue' },
  playwright:      { label: '스크래핑',   cls: 'bg-acc-blue/10 text-acc-blue' },
};

function fmtWdFee(coin: string, fee: number | null | undefined): string {
  if (fee == null) return '—';
  if (coin === 'BTC') return `${Math.round(fee * 1e8).toLocaleString()} sats`;
  return `${fee} ${coin}`;
}

export function WithdrawalFeePanel({ exchanges }: { exchanges: { id: string; name: string }[] }) {
  const [rows, setRows] = useState<WithdrawalRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getWithdrawalFees()
      .then(r => setRows(r.items))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const nameById = new Map(exchanges.map(e => [e.id, e.name]));
  const ids = new Set(exchanges.map(e => e.id));
  const byEx = new Map<string, WithdrawalRow[]>();
  for (const r of rows) {
    if (!ids.has(r.exchange)) continue;
    if (!byEx.has(r.exchange)) byEx.set(r.exchange, []);
    byEx.get(r.exchange)!.push(r);
  }

  if (loading) return <p className="text-xs text-label-tertiary">불러오는 중…</p>;
  if (byEx.size === 0) return <p className="text-xs text-label-tertiary">출금 수수료 데이터가 없습니다.</p>;

  return (
    <div className="space-y-3">
      {[...byEx.entries()].map(([ex, exRows]) => (
        <div key={ex}>
          <p className="text-xs font-semibold text-label-primary mb-1">{nameById.get(ex) ?? ex}</p>
          <div className="space-y-1">
            {exRows.map((r, i) => {
              const src = WD_SOURCE_META[r.source] ?? { label: r.source, cls: 'bg-fill-secondary text-label-tertiary' };
              return (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  <span className="text-label-tertiary w-9 flex-shrink-0">{r.coin}</span>
                  <span className="text-label-secondary flex-1 min-w-0 truncate">{r.network_label}</span>
                  <span className={`num flex-shrink-0 ${r.enabled ? 'text-label-primary' : 'text-label-tertiary line-through'}`}>
                    {fmtWdFee(r.coin, r.fee)}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${src.cls}`}>{src.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
