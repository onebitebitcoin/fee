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

  getLiveKimp: (): Promise<LiveKimpResponse> =>
    request('/api/v1/market/kimp/live'),

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

  getCrawlStatus: (): Promise<{
    running: boolean;
    last_run: {
      id: number; status: string; trigger: string; message: string | null;
      started_at: number | null; completed_at: number | null; usd_krw_rate: number | null;
    } | null;
    exchanges: Array<{
      exchange: string;
      group: 'korea' | 'global';
      ticker: 'pass' | 'error' | 'missing';
      btc_wd: 'pass' | 'error' | 'missing';
      usdt_wd: 'pass' | 'error' | 'missing';
      errors: string[];
    }>;
    data_gaps: Array<{
      exchange: string;
      coin: string;
      network_label: string | null;
      issue: string;
    }>;
  }> => request('/api/v1/market/crawl-status'),

  triggerCrawl: (adminKey: string): Promise<{ id: number; status: string; message: string | null }> =>
    request('/api/v1/crawl-runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': adminKey },
    }),

  getGatemanRegistry: (): Promise<{
    data: Record<string, unknown>;
    updated_at: string;
    updated_source: string;
  }> => request('/api/v1/admin/registry'),

  updateGatemanRegistry: (data: Record<string, unknown>): Promise<{ ok: boolean; updated_at: string }> =>
    request('/api/v1/admin/registry', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Password': '0000' },
      body: JSON.stringify(data),
    }),

  refreshGatemanRegistry: (): Promise<{
    ok: boolean; crawl_id: number; crawl_status: string; updated_at: string;
  }> =>
    request('/api/v1/admin/registry/refresh', {
      method: 'POST',
      headers: { 'X-Admin-Password': '0000' },
    }),

  getAdminNotices: (limit = 50): Promise<{
    items: Array<{
      id: number; exchange: string; title: string; url: string | null;
      published_at: string | null; noticed_at: string | null;
    }>;
  }> => request(`/api/v1/admin/notices?limit=${limit}`),
};
