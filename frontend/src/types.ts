export type CrawlRun = {
  id: number;
  trigger: string;
  status: string;
  message: string | null;
  usd_krw_rate?: number | null;
  started_at: string | null;
  completed_at: string | null;
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
  recorded_at?: string | null;
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
  checked_at?: string | null;
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
  korean_exchange: string;
  transfer_coin: string;
  network: string;
  path_type?: 'lightning_exit' | null;
  swap_service?: string | null;
  btc_received: number;
  btc_received_usd?: number | null;
  total_fee_krw: number;
  fee_pct: number;
  lightning_swap_fee_krw?: number | null;
  global_withdrawal_fee_krw?: number | null;
  breakdown?: CheapestPathBreakdown | null;
};

export type DisabledCheapestPathEntry = {
  korean_exchange: string;
  transfer_coin: string;
  network: string;
  reason?: string | null;
};

export type CheapestPathResponse = {
  amount_krw: number;
  global_exchange: string;
  global_btc_price_usd: number;
  usd_krw_rate: number;
  total_paths_evaluated: number;
  best_path: CheapestPathEntry | null;
  top5: CheapestPathEntry[];
  all_paths: CheapestPathEntry[];
  disabled_paths: DisabledCheapestPathEntry[];
  maintenance_checked_at?: string | null;
  data_source?: string;
  latest_scraping_time?: string | null;
  last_run?: CrawlRun | null;
  errors?: CrawlErrorRow[];
  error?: string;
};
