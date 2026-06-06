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
  bybit: '바이빗',
  // lightning swap services
  boltz: 'Boltz',
  coinos: 'Coinos',
  bitflower: 'BitFlower',
  walletofsatoshi: 'Wallet of Satoshi',
  strike: 'Strike',
  oksusu: 'Oksusu',
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
  bybit: 'bybit.com',
  // lightning swap services
  boltz: 'boltz.exchange',
  coinos: 'coinos.io',
  bitflower: 'bitflower.com',
  walletofsatoshi: 'walletofsatoshi.com',
  strike: 'strike.me',
  oksusu: 'oksu.su',
};

export function fmtEx(name: string): string {
  return EXCHANGE_NAMES[name.toLowerCase()] ?? name;
}

export function getExchangeDomain(id: string): string | null {
  return EXCHANGE_DOMAINS[id.toLowerCase()] ?? null;
}
