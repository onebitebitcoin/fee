import { CheckCircle, XCircle } from 'lucide-react';
import { useCallback } from 'react';

import { PageErrorMessage } from '../components/PageErrorMessage';
import { PageSkeletonBlocks } from '../components/PageSkeletonBlocks';
import { StatusBadge } from '../components/StatusBadge';
import { useAsyncData } from '../hooks/useAsyncData';
import { api } from '../lib/api';
import type { NetworkStatusMap } from '../types';

export function NetworkStatusPage() {
  const loadNetworkStatus = useCallback(async (): Promise<NetworkStatusMap> => {
    const response = await api.getNetworkStatus();
    return response.exchanges;
  }, []);
  const { data: items, error, loading } = useAsyncData(loadNetworkStatus, {
    initialData: {},
  });

  if (error) return <PageErrorMessage message={error} />;
  if (loading) return <PageSkeletonBlocks blocks={4} className="h-40 bg-dark-300" containerClassName="grid gap-4 md:grid-cols-2" />;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-bnb-text">네트워크 상태</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {Object.entries(items).map(([exchange, value]) => (
          <div key={exchange} className="border border-dark-200 bg-dark-300 p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-bnb-text">{exchange}</h3>
              <StatusBadge status={value.status} />
            </div>
            {value.checked_at && (
              <p className="mt-1 text-xs text-bnb-muted">확인 시각: {value.checked_at}</p>
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
                        {item.coin} / {item.network}
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
  );
}
