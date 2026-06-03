/**
 * 어드민 설정 — 거래소 노드 및 출금 엣지 속성.
 * 기본값은 공개 정보 기준 추정치. 실제 값은 어드민 페이지에서 수정 후 localStorage 저장.
 */

export interface KoreanExchangeNode {
  id: string;
  name: string;
  takerFeePct: number;
  /** 1회 KRW 출금 한도 (개인 지갑, null=제한 없음) */
  perTxKrwLimit: number | null;
  dailyBtcLimitVerified: number | null;
  personalWalletNote: string;
  notes: string;
}

export interface GlobalExchangeNode {
  id: string;
  name: string;
  country: string;
  carfYear: number | null;
  takerFeePct: number;
  fatca: boolean;
  notes: string;
}

export interface WithdrawalEdge {
  id: string;
  fromExchange: string;
  coin: 'BTC' | 'USDT';
  network: string;
  feeAmount: number;
  feeUnit: string;
  perTxKrwLimit: number | null;
  requiresPreRegistration: boolean;
  notes: string;
}

export interface AdminSettings {
  koreanNodes: KoreanExchangeNode[];
  globalNodes: GlobalExchangeNode[];
}

const DEFAULT_KOREAN_NODES: KoreanExchangeNode[] = [
  {
    id: 'upbit', name: '업비트',
    takerFeePct: 0.05,
    perTxKrwLimit: 1_000_000,
    dailyBtcLimitVerified: 100,
    personalWalletNote: '앱 → 출금관리 → 외부지갑 등록 (화이트리스트)',
    notes: '국내 1위, 유동성 최고',
  },
  {
    id: 'bithumb', name: '빗썸',
    takerFeePct: 0.04,
    perTxKrwLimit: 1_000_000,
    dailyBtcLimitVerified: 100,
    personalWalletNote: '앱 → 출금 → 개인지갑 사전 등록',
    notes: '2026.02 BTC 오배포 사고 이력',
  },
  {
    id: 'coinone', name: '코인원',
    takerFeePct: 0.07,
    perTxKrwLimit: 1_000_000,
    dailyBtcLimitVerified: 50,
    personalWalletNote: '앱 → 자산 → 출금 → 주소록 등록',
    notes: '',
  },
  {
    id: 'korbit', name: '코빗',
    takerFeePct: 0.05,
    perTxKrwLimit: null,
    dailyBtcLimitVerified: 10,
    personalWalletNote: 'KYC 완료 후 지갑 등록',
    notes: 'NXC 계열 — 1회 출금 KRW 제한 여부 확인 필요',
  },
  {
    id: 'gopax', name: '고팍스',
    takerFeePct: 0.05,
    perTxKrwLimit: 1_000_000,
    dailyBtcLimitVerified: 5,
    personalWalletNote: '고객센터 확인 필요',
    notes: '⚠️ 고파이 사태 진행 중, 사용 주의',
  },
];

const DEFAULT_GLOBAL_NODES: GlobalExchangeNode[] = [
  { id: 'binance', name: 'Binance', country: '케이맨제도', carfYear: 2027, takerFeePct: 0.10, fatca: false, notes: '세계 1위' },
  { id: 'okx',     name: 'OKX',     country: '세이셸',     carfYear: 2027, takerFeePct: 0.10, fatca: false, notes: '' },
  { id: 'bybit',   name: 'Bybit',   country: '두바이',     carfYear: 2027, takerFeePct: 0.10, fatca: false, notes: '' },
  { id: 'bitget',  name: 'Bitget',  country: '세이셸',     carfYear: 2027, takerFeePct: 0.10, fatca: false, notes: '' },
  { id: 'kraken',  name: 'Kraken',  country: '미국',       carfYear: 2026, takerFeePct: 0.16, fatca: true,  notes: 'FATCA 대상' },
  { id: 'coinbase', name: 'Coinbase', country: '미국',     carfYear: 2026, takerFeePct: 0.12, fatca: true,  notes: 'FATCA 대상' },
];

const LS_KEY = 'exchange_fee_admin_settings';

export function loadAdminSettings(): AdminSettings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AdminSettings>;
      return {
        koreanNodes: parsed.koreanNodes ?? DEFAULT_KOREAN_NODES,
        globalNodes: parsed.globalNodes ?? DEFAULT_GLOBAL_NODES,
      };
    }
  } catch {
    // ignore
  }
  return { koreanNodes: DEFAULT_KOREAN_NODES, globalNodes: DEFAULT_GLOBAL_NODES };
}

export function saveAdminSettings(settings: AdminSettings): void {
  localStorage.setItem(LS_KEY, JSON.stringify(settings));
}

export function resetAdminSettings(): AdminSettings {
  localStorage.removeItem(LS_KEY);
  return { koreanNodes: DEFAULT_KOREAN_NODES, globalNodes: DEFAULT_GLOBAL_NODES };
}

export function getKoreanNode(id: string): KoreanExchangeNode | undefined {
  return loadAdminSettings().koreanNodes.find(n => n.id === id);
}
