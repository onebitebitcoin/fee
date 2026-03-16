export type KycStatus = 'kyc' | 'non_kyc' | 'mixed' | null;
export type PathMode = 'buy' | 'sell';

export type CrawlRun = {
  id: number;
  trigger: string;
  status: string;
  message: string | null;
  usd_krw_rate?: number | null;
  started_at: number | null;
  completed_at: number | null;
};

export type TickerRow = {
  exchange: string;
  pair: string;
  market_type: string;
  currency: string;
  price: number;
  high_24h?: number | null;
  low_24h?: number | null;
  volume_24h_btc?: number | null;
  maker_fee_pct?: number | null;
  taker_fee_pct?: number | null;
  maker_fee_usd?: number | null;
  maker_fee_krw?: number | null;
  taker_fee_usd?: number | null;
  taker_fee_krw?: number | null;
  usd_krw_rate?: number | null;
};

export type WithdrawalRow = {
  exchange: string;
  coin: string;
  source: string;
  source_url?: string | null;
  network_label: string;
  fee?: number | null;
  fee_usd?: number | null;
  fee_krw?: number | null;
  enabled: boolean;
  note?: string | null;
  kyc_status?: KycStatus;
  recorded_at?: number | null;
};

export type CrawlErrorRow = {
  exchange?: string | null;
  coin?: string | null;
  stage: string;
  error_message: string;
  created_at?: string | null;
};

export type SuspendedNetwork = {
  coin?: string | null;
  network?: string | null;
  status: string;
  reason?: string | null;
  source_url?: string | null;
  detected_at?: string | null;
};

export type NetworkStatusMap = Record<string, {
  status: string;
  suspended_networks: SuspendedNetwork[];
  checked_at?: number | null;
}>;

export type CheapestPathFeeComponent = {
  label: string;
  amount_krw: number;
  rate_pct?: number | null;
  amount_text?: string | null;
  source_url?: string | null;
};

export type CheapestPathBreakdown = {
  components: CheapestPathFeeComponent[];
  total_fee_krw: number;
};

export type CheapestPathEntry = {
  path_id: string;
  route_variant?: 'btc_direct' | 'usdt_via_global' | 'lightning_direct' | 'lightning_via_global';
  korean_exchange: string;
  transfer_coin: string;
  network: string;
  domestic_withdrawal_network: string;
  global_exit_mode: 'onchain' | 'lightning';
  global_exit_network: string;
  lightning_exit_provider?: string | null;
  path_type?: 'lightning_exit' | null;
  swap_service?: string | null;
  btc_received?: number;
  btc_received_usd?: number | null;
  krw_received?: number;
  total_fee_krw: number;
  fee_pct: number;
  lightning_swap_fee_krw?: number | null;
  global_withdrawal_fee_krw?: number | null;
  breakdown?: CheapestPathBreakdown | null;
  domestic_kyc_status?: KycStatus;
  global_kyc_status?: KycStatus;
  exit_service_kyc_status?: KycStatus;
  wallet_kyc_status?: KycStatus;
};

export type DisabledCheapestPathEntry = {
  korean_exchange: string;
  transfer_coin: string;
  network: string;
  reason?: string | null;
};

export type CheapestPathResponse = {
  mode: PathMode;
  amount_krw?: number;
  amount_btc?: number;
  global_exchange: string;
  global_btc_price_usd: number;
  usd_krw_rate: number;
  total_paths_evaluated: number;
  best_path: CheapestPathEntry | null;
  top5: CheapestPathEntry[];
  all_paths: CheapestPathEntry[];
  disabled_paths: DisabledCheapestPathEntry[];
  available_filters: {
    domestic_withdrawal_networks: string[];
    global_exit_options: Array<{ mode: 'onchain' | 'lightning'; network: string }>;
    lightning_exit_providers: string[];
  };
  maintenance_checked_at?: number | null;
  data_source?: string;
  latest_scraping_time?: number | null;
  last_run?: CrawlRun | null;
  lightning_swap_services?: string[];
  errors?: CrawlErrorRow[];
  error?: string;
};

export type AccessStats = {
  total: number;
  today: number;
};

export type ScrapedPageStatus = {
  label: string;
  url: string;
  category: 'network_status' | 'withdrawal' | 'lightning';
  status: 'ok' | 'error';
  last_crawled_at: number | null;
  error_message: string | null;
};

export type ScrapeStatusResponse = {
  last_run: { id: number; status: string; completed_at: number | null } | null;
  items: ScrapedPageStatus[];
};

export type LightningSwapFeeRow = {
  service_name: string;
  fee_pct: number | null;
  fee_fixed_sat: number | null;
  min_amount_sat: number | null;
  max_amount_sat: number | null;
  enabled: boolean;
  source_url: string | null;
  error_message: string | null;
  recorded_at: number | null;
};

export type ExchangeStatusWithdrawalRow = {
  coin: string;
  network_label: string;
  fee?: number | null;
  fee_krw?: number | null;
  fee_pct?: number | null;
  fee_fixed_sat?: number | null;
  min_amount_sat?: number | null;
  max_amount_sat?: number | null;
  enabled: boolean;
  source: string;
  note?: string | null;
  kyc_status?: KycStatus;
};

export type ExchangeStatusNode = {
  exchange: string;
  type: 'exchange' | 'lightning';
  direction?: 'onchain_to_ln' | 'ln_to_onchain' | null;
  withdrawal_rows: ExchangeStatusWithdrawalRow[];
  network_status: {
    status: string;
    suspended_networks: SuspendedNetwork[];
    checked_at?: number | null;
  };
  scrape_status: {
    url: string;
    status: 'ok' | 'error';
    last_crawled_at: number | null;
    error_message: string | null;
  } | null;
  kyc_status?: KycStatus;
  notices: Array<{
    title: string;
    url: string | null;
    published_at: number | null;
  }>;
};

export type ExchangeStatusResponse = {
  exchanges: ExchangeStatusNode[];
  lightning_services: ExchangeStatusNode[];
  latest_notices: ExchangeNoticeItem[];
};

export type ExchangeNoticeItem = {
  exchange: string;
  title: string;
  url: string | null;
  published_at: number | null;
  noticed_at: number | null;
};
