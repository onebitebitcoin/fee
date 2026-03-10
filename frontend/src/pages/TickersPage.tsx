import { useEffect, useState } from 'react';

import { api } from '../lib/api';
import type { TickerRow } from '../types';

export function TickersPage() {
  const [items, setItems] = useState<TickerRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getTickers()
      .then((response) => setItems(response.items))
      .catch((err) => setError(err instanceof Error ? err.message : '불러오기 실패'))
      .finally(() => setLoading(false));
  }, []);

  if (error) return <div className="rounded-xl border border-bnb-red/30 bg-bnb-red/10 p-4 text-bnb-red">{error}</div>;
  if (loading) return <div className="h-64 animate-pulse rounded-xl bg-dark-300" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-bnb-text">거래소 시세</h2>
        <span className="text-sm text-bnb-muted">{items.length}개 항목</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-dark-200">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-dark-200 bg-dark-400">
            <tr>
              <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-bnb-muted">Exchange</th>
              <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-bnb-muted">Market</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-bnb-muted">Price</th>
              <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-bnb-muted">Currency</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-bnb-muted">Maker %</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-bnb-muted">Taker %</th>
            </tr>
          </thead>
          <tbody className="bg-dark-300">
            {items.map((item) => (
              <tr key={`${item.exchange}-${item.market_type}`} className="border-t border-dark-200 transition-colors hover:bg-dark-400">
                <td className="px-4 py-3 font-medium text-bnb-text">{item.exchange}</td>
                <td className="px-4 py-3 text-bnb-muted">{item.market_type}</td>
                <td className="px-4 py-3 text-right font-semibold text-brand-500">{item.price.toLocaleString()}</td>
                <td className="px-4 py-3 text-bnb-muted">{item.currency}</td>
                <td className="px-4 py-3 text-right text-bnb-text">{item.maker_fee_pct ?? '-'}</td>
                <td className="px-4 py-3 text-right text-bnb-text">{item.taker_fee_pct ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
