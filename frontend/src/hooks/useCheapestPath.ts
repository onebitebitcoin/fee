import { useCallback, useState } from 'react';

import { api } from '../lib/api';
import type { CheapestPathResponse, PathMode } from '../types';

type LoadParams = {
  mode: PathMode;
  amountKrw?: number;
  amountBtc?: number;
  walletUtxoCount?: number;
  globalExchange: string;
};

export function useCheapestPath() {
  const [data, setData] = useState<CheapestPathResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (requestParams: LoadParams) => {
    try {
      setError(null);
      setLoading(true);
      const response = await api.getCheapestPath(requestParams);
      if (response.error) {
        setData(response);
        setError(response.error);
        return;
      }
      setData(response);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : '최적 경로 조회에 실패했습니다.');
    } finally {
      setLoading(false);
      setSubmitting(false);
    }
  }, []);

  return { data, loading, submitting, setSubmitting, error, load };
}
