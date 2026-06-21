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
  bitfreezer: 'BitFreezer',
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
  bitfreezer: 'bitfreezer.vercel.app',
  walletofsatoshi: 'walletofsatoshi.com',
  strike: 'strike.me',
  oksusu: 'team.oksu.su',
};

// Google favicon API가 인식 못하는 사이트는 직접 URL 지정
const FAVICON_URL_OVERRIDES: Record<string, string> = {
  oksusu: 'https://team.oksu.su/corn-logo.png',
  // BitFreezer 사이트(bitfreezer.vercel.app)는 봇 차단(403)으로 favicon을 가져올 수 없어,
  // 실제 브랜드(눈송이 / 색 #3399ff)에 맞춘 인라인 SVG 아이콘을 사용한다.
  bitfreezer:
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%233399ff' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cline x1='2' x2='22' y1='12' y2='12'/%3E%3Cline x1='12' x2='12' y1='2' y2='22'/%3E%3Cpath d='m20 16-4-4 4-4'/%3E%3Cpath d='m4 8 4 4-4 4'/%3E%3Cpath d='m16 4-4 4-4-4'/%3E%3Cpath d='m8 20 4-4 4 4'/%3E%3C/svg%3E",
};

export function getFaviconUrl(id: string, size: number): string | null {
  const key = id.toLowerCase();
  const override = FAVICON_URL_OVERRIDES[key];
  if (override) return override;
  const domain = EXCHANGE_DOMAINS[key];
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?sz=${size * 2}&domain=${domain}`;
}

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
  bitfreezer: {
    description: '라이트닝 BTC를 온체인 BTC 주소로 보내주는 한국 Lightning 노드 기반 스왑 서비스. 비수탁형으로 본인 인증이 필요 없습니다.',
    tags: ['비수탁형', 'KYC 불필요', '한국'],
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
