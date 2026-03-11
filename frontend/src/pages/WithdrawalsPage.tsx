import { AlertTriangle, CheckCircle, ExternalLink, XCircle } from 'lucide-react';
import { useCallback } from 'react';

import { PageErrorMessage } from '../components/PageErrorMessage';
import { PageSkeletonBlocks } from '../components/PageSkeletonBlocks';
import { useAsyncData } from '../hooks/useAsyncData';
import { api } from '../lib/api';
import type { CrawlErrorRow, WithdrawalRow } from '../types';

type WithdrawalsPageData = {
  items: WithdrawalRow[];
  errors: CrawlErrorRow[];
  latestScrapingTime: string | null;
};

export function WithdrawalsPage() {
  const loadWithdrawals = useCallback(async (): Promise<WithdrawalsPageData> => {
    const response = await api.getWithdrawals();
    return {
      items: response.items,
      errors: response.errors ?? [],
      latestScrapingTime: response.latest_scraping_time ?? response.last_run?.completed_at ?? null,
    };
  }, []);
  const { data, error, loading } = useAsyncData(loadWithdrawals, {
    initialData: {
      items: [],
      errors: [],
      latestScrapingTime: null,
    },
  });

  if (error) return <PageErrorMessage message={error} />;
  if (loading) return <PageSkeletonBlocks />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-bnb-text">출금 수수료 현황</h2>
          {data.latestScrapingTime && (
            <p className="mt-1 text-xs text-bnb-muted">최신 스크래핑: {data.latestScrapingTime}</p>
          )}
        </div>
        <span className="text-sm text-bnb-muted">{data.items.length}개 항목</span>
      </div>

      {data.errors.length > 0 && (
        <div className="flex items-start gap-2 border border-bnb-red/30 bg-bnb-red/10 p-4">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-bnb-red" />
          <div className="text-sm text-bnb-red">
            <p className="font-semibold">스크래핑 오류 {data.errors.length}건</p>
            <ul className="mt-2 space-y-1">
              {data.errors.map((item, index) => (
                <li key={`${item.stage}-${item.exchange}-${item.coin}-${index}`} className="text-bnb-muted">
                  {[item.exchange, item.coin].filter(Boolean).join(' / ')}: {item.error_message}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="overflow-x-auto border border-dark-200">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-dark-200 bg-dark-400">
            <tr>
              <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-bnb-muted">거래소</th>
              <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-bnb-muted">코인</th>
              <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-bnb-muted">네트워크</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-bnb-muted">수수료</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-bnb-muted">USD</th>
              <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-bnb-muted">출처</th>
              <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-bnb-muted"><ExternalLink size={12} /></th>
              <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wide text-bnb-muted"><CheckCircle size={12} /></th>
            </tr>
          </thead>
          <tbody className="bg-dark-300">
            {data.items.map((item) => (
              <tr key={`${item.exchange}-${item.coin}-${item.network_label}`} className="border-t border-dark-200 transition-colors hover:bg-dark-400">
                <td className="px-4 py-3 font-medium text-bnb-text">{item.exchange}</td>
                <td className="px-4 py-3 text-bnb-text">{item.coin}</td>
                <td className="px-4 py-3 text-bnb-muted">{item.network_label}</td>
                <td className="px-4 py-3 text-right font-semibold text-brand-500">{item.fee ?? '-'}</td>
                <td className="px-4 py-3 text-right text-bnb-muted">{item.fee_usd != null ? `$${item.fee_usd}` : '-'}</td>
                <td className="px-4 py-3 text-bnb-muted">{item.source}</td>
                <td className="px-4 py-3">
                  {item.source_url ? (
                    <a href={item.source_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-brand-500 hover:text-brand-400">
                      <ExternalLink size={12} />
                      보기
                    </a>
                  ) : (
                    <span className="text-bnb-muted">-</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  {item.enabled ? (
                    <CheckCircle size={14} className="mx-auto text-bnb-green" />
                  ) : (
                    <XCircle size={14} className="mx-auto text-bnb-red" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
