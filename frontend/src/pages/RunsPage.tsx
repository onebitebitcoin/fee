import { useCallback } from 'react';

import { PageErrorMessage } from '../components/PageErrorMessage';
import { PageSkeletonBlocks } from '../components/PageSkeletonBlocks';
import { StatusBadge } from '../components/StatusBadge';
import { useAsyncData } from '../hooks/useAsyncData';
import { api } from '../lib/api';
import type { CrawlRun } from '../types';

export function RunsPage() {
  const loadRuns = useCallback(async (): Promise<CrawlRun[]> => {
    const response = await api.getRuns();
    return response.items;
  }, []);
  const { data: items, error, loading } = useAsyncData(loadRuns, {
    initialData: [],
  });

  if (error) return <PageErrorMessage message={error} />;
  if (loading) return <PageSkeletonBlocks />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-bnb-text">수집 실행 이력</h2>
        <span className="text-sm text-bnb-muted">{items.length}건</span>
      </div>
      <div className="overflow-x-auto border border-dark-200">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-dark-200 bg-dark-400">
            <tr>
              <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-bnb-muted">ID</th>
              <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-bnb-muted">트리거</th>
              <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-bnb-muted">상태</th>
              <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-bnb-muted">시작</th>
              <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-bnb-muted">완료</th>
              <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-bnb-muted">메시지</th>
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
