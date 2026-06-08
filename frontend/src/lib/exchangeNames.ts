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
  gate: 'Gate.io',
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
  gate: 'gate.io',
  // lightning swap services
  boltz: 'boltz.exchange',
  coinos: 'coinos.io',
  bitflower: 'bitflower.com',
  walletofsatoshi: 'walletofsatoshi.com',
  strike: 'strike.me',
  oksusu: 'oksu.su',
};

export interface LightningServiceInfo {
  description: string;
  tags: string[];
}

const LIGHTNING_SERVICE_INFO: Record<string, LightningServiceInfo> = {
  boltz: {
    description: '비수탁형(Non-custodial) Lightning ↔ On-chain 스왑 오픈소스 프로토콜. 개인키를 서버에 맡기지 않으므로 자금 보관 위험이 없습니다.',
    tags: ['비수탁형', '오픈소스', 'KYC 불필요'],
  },
  coinos: {
    description: '무료 Lightning 지갑 및 스왑 서비스. Lightning 결제 인보이스를 생성해 On-chain BTC로 수령할 수 있습니다.',
    tags: ['무료 지갑', 'KYC 불필요'],
  },
  bitflower: {
    description: 'Lightning 채널 자동 관리 및 On-chain 스왑 서비스. 기업·개인 모두 이용 가능합니다.',
    tags: ['기업·개인'],
  },
  walletofsatoshi: {
    description: '간편한 UX의 호주산 Lightning 지갑. 초보자도 쉽게 Lightning을 사용할 수 있으며, On-chain 출금(스왑)을 지원합니다.',
    tags: ['초보자 친화', '관리형 지갑'],
  },
  strike: {
    description: '글로벌 결제 인프라 기반 Lightning 서비스. 미국 라이센스 보유, 일부 국가에서 본인 인증이 필요할 수 있습니다.',
    tags: ['규제 준수', '미국 라이센스'],
  },
  oksusu: {
    description: '한국 사용자를 위한 Lightning Network 스왑 서비스. 한국어 지원 및 원화 기준 수수료 안내를 제공합니다.',
    tags: ['한국어 지원', 'KYC 불필요'],
  },
};

export function fmtEx(name: string): string {
  return EXCHANGE_NAMES[name.toLowerCase()] ?? name;
}

export function getExchangeDomain(id: string): string | null {
  return EXCHANGE_DOMAINS[id.toLowerCase()] ?? null;
}

export function getLightningServiceInfo(id: string): LightningServiceInfo | null {
  return LIGHTNING_SERVICE_INFO[id.toLowerCase()] ?? null;
}
