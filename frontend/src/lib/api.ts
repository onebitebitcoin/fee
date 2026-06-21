import type {
  AccessStats,
  BoardComment,
  BoardListResponse,
  BoardPostDetail,
  CheapestPathResponse,
  CrawlRun,
  LiveKimpResponse,
  NetworkChangesResponse,
  TickerRow,
  WithdrawalRow,
} from '../types';

const adminHeader = (adminKey?: string): Record<string, string> =>
  adminKey ? { 'X-API-Key': adminKey } : {};

export interface WithdrawalFeesResponse {
  last_run: CrawlRun | null;
  latest_scraping_time: number | null;
  items: WithdrawalRow[];
}

export interface CheapestPathAllResponse {
  by_global: Record<string, CheapestPathResponse>;
  last_run: CrawlRun | null;
  latest_scraping_time: number | null;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const { headers, ...rest } = options ?? {};
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...headers },
    ...rest,
  });
  if (!response.ok) {
    let detail = '';
    try {
      detail = (await response.clone().json())?.detail ?? '';
    } catch {
      detail = '';
    }
    throw new Error(detail || `API 요청 실패: ${response.status}`);
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

  getCheapestPathAll: (params: {
    mode: 'buy' | 'sell';
    amountKrw?: number;
    amountBtc?: number;
    walletUtxoCount?: number;
  }): Promise<CheapestPathAllResponse> => {
    const qs = new URLSearchParams({ mode: params.mode });
    if (params.mode === 'sell') {
      qs.set('amount_btc', String(params.amountBtc ?? 0.01));
      qs.set('wallet_utxo_count', String(params.walletUtxoCount ?? 1));
    } else {
      qs.set('amount_krw', String(params.amountKrw ?? 1000000));
    }
    return request(`/api/v1/market/path-finder/cheapest-all?${qs.toString()}`);
  },

  getAccessCount: (): Promise<AccessStats> => request('/api/v1/stats/access-count'),

  getNetworkChanges: (): Promise<NetworkChangesResponse> =>
    request('/api/v1/market/network-changes/recent'),

  getWithdrawalFees: (): Promise<WithdrawalFeesResponse> =>
    request('/api/v1/market/withdrawal-fees/latest'),

  getLatestNotices: (limit = 10): Promise<{ items: import('../types').ExchangeNoticeItem[] }> =>
    request(`/api/v1/market/notices/latest?limit=${limit}`),

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

  getWithdrawalLimits: (): Promise<{
    limits: Record<string, {
      krw_per_tx_limit: number | null;
      btc_per_tx_max: number | null;
      btc_daily_verified: number | null;
      krw_daily_verified_digital: number | null;
      source: string;
      scraped_at: number | null;
    }>;
  }> => request('/api/v1/market/withdrawal-limits/latest'),

  getCaution: (): Promise<Record<string, { caution: boolean; reason: string | null }>> =>
    request('/api/v1/exchanges/caution'),

  getCarfExchanges: (): Promise<{
    exchanges: Array<{ id: string; carfFirstExchange: string | null; registeredCountry: string | null }>;
  }> => request('/api/v1/market/carf-exchanges'),

  updateCaution: (
    exchangeId: string,
    group: string,
    caution: boolean,
    reason: string | null,
    adminKey: string,
  ): Promise<{ exchange_id: string; caution: boolean; reason: string | null }> =>
    request(`/api/v1/exchanges/caution/${exchangeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': adminKey },
      body: JSON.stringify({ group, caution, reason }),
    }),

  // ── 게시판 ──────────────────────────────────────────────────────────────
  getBoardPosts: (params: {
    page?: number; size?: number; q?: string; category?: string;
  } = {}): Promise<BoardListResponse> => {
    const qs = new URLSearchParams();
    if (params.page) qs.set('page', String(params.page));
    if (params.size) qs.set('size', String(params.size));
    if (params.q) qs.set('q', params.q);
    if (params.category) qs.set('category', params.category);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request(`/api/v1/board/posts${suffix}`);
  },

  getBoardPost: (id: number): Promise<BoardPostDetail> =>
    request(`/api/v1/board/posts/${id}`),

  createBoardPost: (
    body: { category: string; title: string; content: string; nickname: string; password?: string },
    adminKey?: string,
  ): Promise<BoardPostDetail> =>
    request('/api/v1/board/posts', {
      method: 'POST',
      headers: adminHeader(adminKey),
      body: JSON.stringify(body),
    }),

  updateBoardPost: (
    id: number,
    body: { title: string; content: string; password?: string },
    adminKey?: string,
  ): Promise<BoardPostDetail> =>
    request(`/api/v1/board/posts/${id}`, {
      method: 'PUT',
      headers: adminHeader(adminKey),
      body: JSON.stringify(body),
    }),

  deleteBoardPost: (
    id: number,
    password?: string,
    adminKey?: string,
  ): Promise<{ ok: boolean }> =>
    request(`/api/v1/board/posts/${id}`, {
      method: 'DELETE',
      headers: adminHeader(adminKey),
      body: JSON.stringify({ password: password ?? null }),
    }),

  createBoardComment: (
    postId: number,
    body: { nickname: string; content: string; password: string },
  ): Promise<BoardComment> =>
    request(`/api/v1/board/posts/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateBoardComment: (
    id: number,
    body: { content: string; password: string },
  ): Promise<BoardComment> =>
    request(`/api/v1/board/comments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  deleteBoardComment: (id: number, password: string): Promise<{ ok: boolean }> =>
    request(`/api/v1/board/comments/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ password }),
    }),
};
