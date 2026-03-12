import type {
  AccessStats,
  CheapestPathResponse,
  CrawlErrorRow,
  CrawlRun,
  ExchangeStatusResponse,
  LightningSwapFeeRow,
  NetworkStatusMap,
  ScrapeStatusResponse,
  TickerRow,
  WithdrawalRow,
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
  getTickers: (): Promise<{ last_run: CrawlRun | null; items: TickerRow[] }> => request('/api/v1/market/tickers/latest'),
  getWithdrawals: (): Promise<{ last_run: CrawlRun | null; latest_scraping_time?: number | null; items: WithdrawalRow[]; errors?: CrawlErrorRow[] }> =>
    request('/api/v1/market/withdrawal-fees/latest'),
  getNetworkStatus: (): Promise<{ last_run: CrawlRun | null; exchanges: NetworkStatusMap; total_suspended: number }> => request('/api/v1/market/network-status/latest'),
  getRuns: (): Promise<{ items: CrawlRun[] }> => request('/api/v1/crawl-runs'),
  getCheapestPath: (params: { mode: 'buy' | 'sell'; amountKrw?: number; amountBtc?: number; globalExchange: string }): Promise<CheapestPathResponse> => {
    const qs = new URLSearchParams({
      mode: params.mode,
      global_exchange: params.globalExchange,
    });
    if (params.mode === 'sell') {
      qs.set('amount_btc', String(params.amountBtc ?? 0.01));
    } else {
      qs.set('amount_krw', String(params.amountKrw ?? 1000000));
    }
    return request(`/api/v1/market/path-finder/cheapest?${qs.toString()}`);
  },
  triggerCrawl: (): Promise<CrawlRun> => request('/api/v1/crawl-runs', { method: 'POST' }),
  getAccessCount: (): Promise<AccessStats> => request('/api/v1/stats/access-count'),
  getScrapeStatus: (): Promise<ScrapeStatusResponse> => request('/api/v1/market/scrape-status'),
  getLightningSwapFees: (): Promise<{ last_run: CrawlRun | null; items: LightningSwapFeeRow[] }> =>
    request('/api/v1/market/lightning-swap-fees/latest'),
  getExchangeStatus: (): Promise<ExchangeStatusResponse> => request('/api/v1/market/status'),
};
