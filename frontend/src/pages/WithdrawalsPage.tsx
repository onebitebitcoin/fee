import { AlertTriangle, ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';

import { api } from '../lib/api';
import type { CrawlErrorRow, WithdrawalRow } from '../types';

export function WithdrawalsPage() {
  const [items, setItems] = useState<WithdrawalRow[]>([]);
  const [errors, setErrors] = useState<CrawlErrorRow[]>([]);
  const [latestScrapingTime, setLatestScrapingTime] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getWithdrawals()
      .then((response) => {
        setItems(response.items);
        setErrors(response.errors ?? []);
        setLatestScrapingTime(response.latest_scraping_time ?? response.last_run?.completed_at ?? null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : '불러오기 실패'))
      .finally(() => setLoading(false));
  }, []);

  if (error) return <div className="rounded-xl border border-bnb-red/30 bg-bnb-red/10 p-4 text-bnb-red">{error}</div>;
  if (loading) return <div className="h-64 animate-pulse rounded-xl bg-dark-300" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-bnb-text">출금 수수료 현황</h2>
          {latestScrapingTime && (
            <p className="mt-1 text-xs text-bnb-muted">최신 스크래핑: {latestScrapingTime}</p>
          )}
        </div>
        <span className="text-sm text-bnb-muted">{items.length}개 항목</span>
      </div>

      {errors.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-bnb-red/30 bg-bnb-red/10 p-4">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-bnb-red" />
          <div className="text-sm text-bnb-red">
            <p className="font-semibold">스크래핑 오류 {errors.length}건</p>
            <ul className="mt-2 space-y-1">
              {errors.map((item, index) => (
                <li key={`${item.stage}-${item.exchange}-${item.coin}-${index}`} className="text-bnb-muted">
                  {[item.exchange, item.coin].filter(Boolean).join(' / ')}: {item.error_message}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-dark-200">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-dark-200 bg-dark-400">
            <tr>
              <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-bnb-muted">Exchange</th>
              <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-bnb-muted">Coin</th>
              <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-bnb-muted">Network</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-bnb-muted">Fee</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-bnb-muted">Fee USD</th>
              <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-bnb-muted">Source</th>
              <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-bnb-muted">URL</th>
              <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wide text-bnb-muted">Enabled</th>
            </tr>
          </thead>
          <tbody className="bg-dark-300">
            {items.map((item) => (
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
                    <span className="rounded-md bg-bnb-green/20 px-2 py-0.5 text-xs font-medium text-bnb-green">Y</span>
                  ) : (
                    <span className="rounded-md bg-bnb-red/20 px-2 py-0.5 text-xs font-medium text-bnb-red">N</span>
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
