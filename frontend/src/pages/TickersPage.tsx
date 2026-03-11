import { useCallback } from 'react';

import { PageErrorMessage } from '../components/PageErrorMessage';
import { fmtEx } from '../lib/exchangeNames';
import { PageSkeletonBlocks } from '../components/PageSkeletonBlocks';
import { useAsyncData } from '../hooks/useAsyncData';
import { api } from '../lib/api';
import type { TickerRow } from '../types';

export function TickersPage() {
  const loadTickers = useCallback(async (): Promise<TickerRow[]> => {
    const response = await api.getTickers();
    return response.items;
  }, []);
  const { data: items, error, loading } = useAsyncData(loadTickers, {
    initialData: [],
  });

  if (error) return <PageErrorMessage message={error} />;
  if (loading) return <PageSkeletonBlocks />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-bnb-text">거래소 시세</h2>
        <span className="text-sm text-bnb-muted">{items.length}개 항목</span>
      </div>
      <div className="overflow-x-auto border border-dark-200">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-dark-200 bg-dark-400">
            <tr>
              <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-bnb-muted">거래소</th>
              <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-bnb-muted">마켓</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-bnb-muted">가격</th>
              <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-bnb-muted">통화</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-bnb-muted">메이커</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-bnb-muted">테이커</th>
            </tr>
          </thead>
          <tbody className="bg-dark-300">
            {items.map((item) => (
              <tr key={`${item.exchange}-${item.market_type}`} className="border-t border-dark-200 transition-colors hover:bg-dark-400">
                <td className="px-4 py-3 font-medium text-bnb-text">{fmtEx(item.exchange)}</td>
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
