const EXCHANGE_NAMES: Record<string, string> = {
  bithumb: '빗썸',
  upbit: '업비트',
  korbit: '코빗',
  coinone: '코인원',
  gopax: '고팍스',
  binance: '바이낸스',
  okx: 'OKX',
  coinbase: '코인베이스',
  kraken: '크라켄',
  bitget: '비트겟',
};

const EXCHANGE_DOMAINS: Record<string, string> = {
  bithumb: 'bithumb.com',
  upbit: 'upbit.com',
  korbit: 'korbit.co.kr',
  coinone: 'coinone.co.kr',
  gopax: 'gopax.co.kr',
  binance: 'binance.com',
  okx: 'okx.com',
  coinbase: 'coinbase.com',
  kraken: 'kraken.com',
  bitget: 'bitget.com',
};

export function fmtEx(name: string): string {
  return EXCHANGE_NAMES[name.toLowerCase()] ?? name;
}

export function getExchangeDomain(id: string): string | null {
  return EXCHANGE_DOMAINS[id.toLowerCase()] ?? null;
}
