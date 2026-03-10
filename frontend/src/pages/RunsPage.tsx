import { useEffect, useState } from 'react';

import { StatusBadge } from '../components/StatusBadge';
import { api } from '../lib/api';
import type { CrawlRun } from '../types';

export function RunsPage() {
  const [items, setItems] = useState<CrawlRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getRuns()
      .then((response) => setItems(response.items))
      .catch((err) => setError(err instanceof Error ? err.message : '불러오기 실패'))
      .finally(() => setLoading(false));
  }, []);

  if (error) return <div className="rounded-xl border border-bnb-red/30 bg-bnb-red/10 p-4 text-bnb-red">{error}</div>;
  if (loading) return <div className="h-64 animate-pulse rounded-xl bg-dark-300" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-bnb-text">수집 실행 이력</h2>
        <span className="text-sm text-bnb-muted">{items.length}건</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-dark-200">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-dark-200 bg-dark-400">
            <tr>
              <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-bnb-muted">ID</th>
              <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-bnb-muted">Trigger</th>
              <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-bnb-muted">Status</th>
              <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-bnb-muted">Started</th>
              <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-bnb-muted">Completed</th>
              <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-bnb-muted">Message</th>
            </tr>
          </thead>
          <tbody className="bg-dark-300">
            {items.map((item) => (
              <tr key={item.id} className="border-t border-dark-200 transition-colors hover:bg-dark-400">
                <td className="px-4 py-3 font-mono text-xs text-bnb-muted">#{item.id}</td>
                <td className="px-4 py-3 text-bnb-text">{item.trigger}</td>
                <td className="px-4 py-3"><StatusBadge status={item.status} /></td>
                <td className="px-4 py-3 text-xs text-bnb-muted">{item.started_at ?? '-'}</td>
                <td className="px-4 py-3 text-xs text-bnb-muted">{item.completed_at ?? '-'}</td>
                <td className="px-4 py-3 max-w-xs truncate text-xs text-bnb-muted" title={item.message ?? undefined}>{item.message ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
