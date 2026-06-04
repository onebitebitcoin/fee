export type GateLevel = 'required' | 'conditional' | 'info';

export interface GateItem {
  label: string;
  desc: string;
  level: GateLevel;
  condition?: string;
}

// ── 국내 거래소 ────────────────────────────────────────────────────────────────

const DOMESTIC: Record<string, GateItem[]> = {
  upbit: [
    { label: '출금 주소 사전 등록 필수', desc: 'My Wallet에 출금 주소를 미리 등록해야 합니다.', level: 'required' },
    { label: '본인 명의 지갑만 허용', desc: '타인 명의 거래소 주소 또는 서비스 주소로 출금이 불가합니다.', level: 'required' },
    { label: '신규 주소 24시간 지연', desc: '처음 등록한 주소는 24시간 이후에 출금이 가능합니다.', level: 'conditional', condition: '신규 주소 등록 시' },
    { label: '고액 출금 시 자금 출처 증명', desc: '일정 금액 이상 출금 시 자금 출처 서류 제출이 요구될 수 있습니다.', level: 'conditional', condition: '대규모 출금 시' },
  ],
  bithumb: [
    { label: '출금 주소 사전 등록 필수', desc: '출금 주소를 주소록에 미리 등록해야 합니다.', level: 'required' },
    { label: 'KYC 실명 인증 필수', desc: '본인 인증이 완료된 계정에서만 출금 가능합니다.', level: 'required' },
    { label: 'Travel Rule (여행규칙)', desc: '100만원 이상 출금 시 수신 지갑 소유자 정보를 입력해야 합니다.', level: 'conditional', condition: '100만원 이상 출금 시' },
    { label: '고액 출금 자금 출처 증명', desc: '고액 출금 시 자금 출처 서류 제출이 요구될 수 있습니다.', level: 'conditional', condition: '고액 출금 시' },
  ],
  korbit: [
    { label: '출금 주소 사전 등록 필수', desc: '출금 주소를 미리 등록해야 합니다.', level: 'required' },
    { label: 'KYC 실명 인증 필수', desc: '본인 인증 완료 필요합니다.', level: 'required' },
    { label: 'Travel Rule (여행규칙)', desc: '100만원 이상 출금 시 수신자 정보 제출이 필요합니다.', level: 'conditional', condition: '100만원 이상 출금 시' },
  ],
  coinone: [
    { label: '출금 주소 사전 등록 필수', desc: '안심 주소록에 출금 주소를 등록해야 합니다.', level: 'required' },
    { label: '신규 주소 72시간 지연', desc: '새로 등록한 주소는 72시간 이후에 출금이 가능합니다.', level: 'conditional', condition: '신규 주소 등록 시' },
    { label: '자금 출처 증명', desc: '고액 출금 시 자금 출처 서류 제출이 필요합니다.', level: 'conditional', condition: '고액 출금 시' },
  ],
  gopax: [
    { label: '출금 주소 사전 등록 필수', desc: '출금 주소를 미리 등록해야 합니다.', level: 'required' },
    { label: 'KYC 실명 인증 필수', desc: '본인 인증이 완료된 계정에서만 출금 가능합니다.', level: 'required' },
    { label: 'Travel Rule (여행규칙)', desc: '100만원 이상 출금 시 수신자 정보 입력이 필요합니다.', level: 'conditional', condition: '100만원 이상 출금 시' },
  ],
};

const DOMESTIC_DEFAULT: GateItem[] = [
  { label: '출금 주소 사전 등록 필수', desc: '출금 주소를 미리 등록해야 합니다.', level: 'required' },
  { label: 'KYC 실명 인증 필수', desc: '본인 인증 완료 필요합니다.', level: 'required' },
  { label: 'Travel Rule (여행규칙)', desc: '100만원 이상 출금 시 수신자 정보 제출이 필요할 수 있습니다.', level: 'conditional', condition: '100만원 이상 출금 시' },
];

// ── 해외 거래소 ────────────────────────────────────────────────────────────────

const GLOBAL: Record<string, GateItem[]> = {
  binance: [
    { label: 'KYC 인증 (Level 1 이상)', desc: '신분증 인증이 완료되어야 입출금이 가능합니다.', level: 'required' },
    { label: '일일 출금 한도', desc: 'KYC Level 1: $8M/day, 미인증: 출금 불가', level: 'info' },
    { label: 'Travel Rule', desc: '한국 이용자의 경우 특정 거래소로 출금 시 수신자 정보 입력이 필요합니다.', level: 'conditional', condition: '한국 KYC 완료 사용자' },
  ],
  okx: [
    { label: 'KYC 인증 필수', desc: '개인 신원 인증 완료 필요합니다.', level: 'required' },
    { label: '일일 출금 한도', desc: 'Level 1: $1,000/day, Level 2: $100,000/day, Level 3: 무제한', level: 'info' },
    { label: '신규 주소 24시간 지연', desc: '새로 등록한 주소는 24시간 후 출금이 가능합니다.', level: 'conditional', condition: '신규 주소 등록 시' },
  ],
  bybit: [
    { label: 'KYC 인증 필수', desc: '거주 국가 및 신분 인증 필요합니다.', level: 'required' },
    { label: '신규 주소 24시간 지연', desc: '새로 등록한 주소는 24시간 후 사용 가능합니다.', level: 'conditional', condition: '신규 주소 등록 시' },
    { label: '일일 출금 한도', desc: 'KYC 완료 시 최대 $1,000,000/day', level: 'info' },
  ],
  bitget: [
    { label: 'KYC 인증 필수', desc: '신분증 인증이 필요합니다.', level: 'required' },
    { label: '일일 출금 한도', desc: 'KYC Level별 한도 상이. 미인증 시 출금 불가.', level: 'info' },
    { label: '신규 주소 24시간 지연', desc: '새로 추가한 주소는 24시간 후 출금 가능합니다.', level: 'conditional', condition: '신규 주소 등록 시' },
  ],
  kraken: [
    { label: 'KYC 인증 필수 (Intermediate 이상)', desc: '주소 및 신분 증명 완료 필요합니다.', level: 'required' },
    { label: '일일 출금 한도', desc: 'Intermediate: $500,000/day, Pro: 무제한', level: 'info' },
  ],
  coinbase: [
    { label: 'KYC 인증 필수', desc: '신분 인증 및 거주지 인증 완료 필요합니다.', level: 'required' },
    { label: '한국 서비스 제한', desc: 'Coinbase는 한국 거주자에게 서비스를 제공하지 않을 수 있습니다.', level: 'required' },
    { label: '일일 출금 한도', desc: '계정 등급에 따라 한도 상이', level: 'info' },
  ],
};

const GLOBAL_DEFAULT: GateItem[] = [
  { label: 'KYC 인증 필수', desc: '신원 인증이 완료되어야 입출금이 가능합니다.', level: 'required' },
  { label: '일일 출금 한도', desc: 'KYC 등급에 따라 출금 한도가 상이합니다.', level: 'info' },
];

// ── 온체인 공통 ────────────────────────────────────────────────────────────────

export const ONCHAIN_GATES: GateItem[] = [
  { label: '주소 오입력 시 복구 불가', desc: 'Bitcoin 블록체인 트랜잭션은 한번 전송되면 취소하거나 되돌릴 수 없습니다. 반드시 주소를 확인하세요.', level: 'required' },
  { label: '채굴 수수료(Mining Fee) 발생', desc: '네트워크 혼잡도에 따라 채굴 수수료가 변동됩니다. 혼잡 시 수수료가 높아질 수 있습니다.', level: 'info' },
  { label: '입금 확인 시간 소요', desc: '1 블록 확인에 약 10분, 거래소 입금 반영까지 1~6 블록(10분~1시간) 소요됩니다.', level: 'info' },
];

// ── 조회 함수 ─────────────────────────────────────────────────────────────────

export function getDomesticGates(exchangeId: string): GateItem[] {
  return DOMESTIC[exchangeId.toLowerCase()] ?? DOMESTIC_DEFAULT;
}

export function getGlobalGates(exchangeId: string): GateItem[] {
  return GLOBAL[exchangeId.toLowerCase()] ?? GLOBAL_DEFAULT;
}
