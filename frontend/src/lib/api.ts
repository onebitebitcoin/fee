import type {
  AccessStats,
  CheapestPathResponse,
  CrawlRun,
  LiveKimpResponse,
  TickerRow,
} from '../types';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!response.ok) {
    throw new Error(`API 요청 실패: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  getTickers: (): Promise<{ last_run: CrawlRun | null; items: TickerRow[] }> =>
    request('/api/v1/market/tickers/latest'),

  getCheapestPath: (params: {
    mode: 'buy' | 'sell';
    amountKrw?: number;
    amountBtc?: number;
    walletUtxoCount?: number;
    globalExchange: string;
  }): Promise<CheapestPathResponse> => {
    const qs = new URLSearchParams({
      mode: params.mode,
      global_exchange: params.globalExchange,
    });
    if (params.mode === 'sell') {
      qs.set('amount_btc', String(params.amountBtc ?? 0.01));
      qs.set('wallet_utxo_count', String(params.walletUtxoCount ?? 1));
    } else {
      qs.set('amount_krw', String(params.amountKrw ?? 1000000));
    }
    return request(`/api/v1/market/path-finder/cheapest?${qs.toString()}`);
  },

  getAccessCount: (): Promise<AccessStats> => request('/api/v1/stats/access-count'),

  getLiveKimp: (forceRefresh = false): Promise<LiveKimpResponse> => {
    const url = forceRefresh
      ? '/api/v1/market/kimp/live?force_refresh=true'
      : '/api/v1/market/kimp/live';
    return request(url);
  },

  getExchangeVolumes: (): Promise<{
    volumes: Record<string, {
      volume_24h_btc: number | null;
      volume_24h_usd: number | null;
      volume_7d_usd:  number | null;
      volume_30d_usd: number | null;
      trust_score:    number | null;
      trust_rank:     number | null;
      recorded_at:    number | null;
    }>;
  }> => request('/api/v1/market/exchange-volumes'),
};
