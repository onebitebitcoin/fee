import type {
  AccessStats,
  CheapestPathResponse,
  CrawlRun,
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
};
