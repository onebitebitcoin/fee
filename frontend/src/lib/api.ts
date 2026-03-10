import type {
  CheapestPathResponse,
  CrawlErrorRow,
  CrawlRun,
  NetworkStatusMap,
  TickerRow,
  WithdrawalRow,
} from '../types';

export type OverviewResponse = {
  last_run: CrawlRun | null;
  counts: {
    tickers: number;
    withdrawal_rows: number;
    suspended_networks: number;
  };
  usd_krw_rate: number | null;
  ticker_highlights: {
    krw_lowest?: { exchange: string; price: number } | null;
    krw_highest?: { exchange: string; price: number } | null;
    usd_lowest?: { exchange: string; price: number } | null;
    usd_highest?: { exchange: string; price: number } | null;
  };
  available_exchanges?: {
    korea?: string[];
    global?: string[];
  };
};

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
  getOverview: (): Promise<OverviewResponse> => request('/api/v1/market/overview'),
  getTickers: (): Promise<{ last_run: CrawlRun | null; items: TickerRow[] }> => request('/api/v1/market/tickers/latest'),
  getWithdrawals: (): Promise<{ last_run: CrawlRun | null; latest_scraping_time?: string | null; items: WithdrawalRow[]; errors?: CrawlErrorRow[] }> =>
    request('/api/v1/market/withdrawal-fees/latest'),
  getNetworkStatus: (): Promise<{ last_run: CrawlRun | null; exchanges: NetworkStatusMap; total_suspended: number }> => request('/api/v1/market/network-status/latest'),
  getRuns: (): Promise<{ items: CrawlRun[] }> => request('/api/v1/crawl-runs'),
  getCheapestPath: (params: { amountKrw: number; globalExchange: string }): Promise<CheapestPathResponse> =>
    request(`/api/v1/market/path-finder/cheapest?amount_krw=${params.amountKrw}&global_exchange=${params.globalExchange}`),
  triggerCrawl: (): Promise<CrawlRun> => request('/api/v1/crawl-runs', { method: 'POST' }),
};
