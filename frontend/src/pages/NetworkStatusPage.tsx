import { CheckCircle, ExternalLink, XCircle } from 'lucide-react';
import { useCallback } from 'react';

import { fmtEx } from '../lib/exchangeNames';

import { PageErrorMessage } from '../components/PageErrorMessage';
import { PageSkeletonBlocks } from '../components/PageSkeletonBlocks';
import { StatusBadge } from '../components/StatusBadge';
import { useAsyncData } from '../hooks/useAsyncData';
import { api } from '../lib/api';
import { formatTs } from '../lib/formatTs';
import type { NetworkStatusMap, ScrapeStatusResponse } from '../types';

const CATEGORY_LABEL: Record<string, string> = {
  network_status: '네트워크',
  withdrawal: '출금',
  lightning: '라이트닝',
};

export function NetworkStatusPage() {
  const loadNetworkStatus = useCallback(async (): Promise<NetworkStatusMap> => {
    const response = await api.getNetworkStatus();
    return response.exchanges;
  }, []);
  const { data: items, error, loading } = useAsyncData(loadNetworkStatus, {
    initialData: {},
  });

  const loadScrapeStatus = useCallback(async (): Promise<ScrapeStatusResponse> => {
    return api.getScrapeStatus();
  }, []);
  const { data: scrapeData, loading: scrapeLoading } = useAsyncData(loadScrapeStatus, {
    initialData: { last_run: null, items: [] },
  });

  if (error) return <PageErrorMessage message={error} />;
  if (loading) return <PageSkeletonBlocks blocks={4} className="h-40 bg-dark-300" containerClassName="grid gap-4 md:grid-cols-2" />;

  return (
    <div className="space-y-6">
      {/* 네트워크 상태 섹션 */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-bnb-text">네트워크 상태</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {Object.entries(items).map(([exchange, value]) => (
            <div key={exchange} className="border border-dark-200 bg-dark-300 p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-bnb-text">{fmtEx(exchange)}</h3>
                <StatusBadge status={value.status} />
              </div>
              {value.checked_at && (
                <p className="mt-1 text-xs text-bnb-muted">확인 시각: {formatTs(value.checked_at)}</p>
              )}
              {value.suspended_networks.length === 0 ? (
                <div className="mt-3 flex items-center gap-2 text-sm text-bnb-green">
                  <CheckCircle size={14} />
                  감지된 점검 없음
                </div>
              ) : (
                <ul className="mt-3 space-y-2">
                  {value.suspended_networks.map((item, index) => (
                    <li key={`${item.coin}-${item.network}-${index}`} className="flex items-start gap-2 bg-dark-400 px-3 py-2">
                      <XCircle size={14} className="mt-0.5 shrink-0 text-bnb-red" />
                      <div className="text-sm">
                        <p className="font-medium text-bnb-text">
                          {item.coin} / {item.network === 'Lightning Network' ? '라이트닝 네트워크' : item.network === 'Bitcoin' ? '비트코인' : item.network}
                        </p>
                        <p className="text-xs text-bnb-muted">{item.reason ?? item.status}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 스크래핑 페이지 상태 섹션 */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-bnb-text">스크래핑 페이지 상태</h2>
        {scrapeLoading ? (
          <PageSkeletonBlocks blocks={3} className="h-12 bg-dark-300" />
        ) : scrapeData.items.filter(i => i.category !== 'network_status').length === 0 ? (
          <p className="text-sm text-bnb-muted">스크래핑 데이터 없음</p>
        ) : (
          <div className="space-y-2">
            {scrapeData.items.filter(i => i.category !== 'network_status').map((item, index) => (
              <div
                key={`${item.label}-${index}`}
                className="flex items-start gap-3 border border-dark-200 bg-dark-300 px-4 py-3"
              >
                {item.status === 'ok' ? (
                  <CheckCircle size={14} className="mt-0.5 shrink-0 text-bnb-green" />
                ) : (
                  <XCircle size={14} className="mt-0.5 shrink-0 text-bnb-red" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-bnb-text">{item.label}</span>
                    <span className="rounded bg-dark-400 px-1.5 py-0.5 text-xs text-bnb-muted">
                      {CATEGORY_LABEL[item.category] ?? item.category}
                    </span>
                  </div>
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-0.5 flex items-center gap-1 truncate text-xs text-brand-400 hover:underline"
                    >
                      <ExternalLink size={10} />
                      <span className="truncate">{item.url}</span>
                    </a>
                  )}
                  {item.last_crawled_at && (
                    <p className="mt-0.5 text-xs text-bnb-muted">
                      마지막 크롤링: {formatTs(item.last_crawled_at)}
                    </p>
                  )}
                  {item.error_message && (
                    <p className="mt-0.5 text-xs text-bnb-red">{item.error_message}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
