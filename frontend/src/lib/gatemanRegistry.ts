export type GateLevel = 'required' | 'conditional' | 'info';

export interface GateItem {
  label: string;
  desc: string;
  level: GateLevel;
  condition?: string;
  source?: string;
}

// ── 국내 거래소 ────────────────────────────────────────────────────────────────

const DOMESTIC: Record<string, GateItem[]> = {
  upbit: [
    { label: '출금 주소 사전 등록 필수', desc: 'My Wallet에 출금 주소를 미리 등록해야 합니다.', level: 'required', source: '업비트 고객센터 / 금융정보분석원(FIU) 가이드라인' },
    { label: '본인 명의 지갑만 허용', desc: '타인 명의 거래소 주소 또는 서비스 주소로 출금이 불가합니다.', level: 'required', source: '특금법 제7조 (자금세탁방지)' },
    { label: '출금 주소 심사 1~3일 소요', desc: '1:1 문의를 통한 출금 주소 등록 심사에 10시간~3일이 소요될 수 있습니다. 미신고 거래소 주소는 등록 불가합니다.', level: 'conditional', condition: '신규 주소 등록 시', source: '업비트 고객센터 정책' },
    { label: '원화 입금 후 출금 지연', desc: '첫 원화 입금 시 72시간, 이후 각 입금마다 24시간 동안 해당 금액 상당의 가상자산 출금이 제한됩니다.', level: 'conditional', condition: '원화 입금 시', source: '금융당국 보이스피싱 방지 지침' },
    { label: '고액 출금 시 자금 출처 증명', desc: '일정 금액 이상 출금 시 자금 출처 서류 제출이 요구될 수 있습니다.', level: 'conditional', condition: '대규모 출금 시', source: '특금법 제5조 (고객 확인 의무)' },
  ],
  bithumb: [
    { label: '출금 주소 사전 등록 필수', desc: '출금 주소를 주소록에 미리 등록해야 합니다. 2025년 4월부터 100만원 미만 출금도 주소 사전 등록이 필요합니다.', level: 'required', source: '빗썸 공지사항 2025.04 / 금융정보분석원 가이드라인' },
    { label: 'KYC 실명 인증 필수', desc: '본인 인증이 완료된 계정에서만 출금 가능합니다.', level: 'required', source: '특금법 제5조 (고객 확인 의무)' },
    { label: '트래블룰', desc: '100만원 이상 출금 시 수신 지갑 소유자 정보를 입력해야 합니다.', level: 'conditional', condition: '100만원 이상 출금 시', source: '특금법 제7조 / FATF Recommendation 16' },
    { label: '고액 출금 자금 출처 증명', desc: '고액 출금 시 자금 출처 서류 제출이 요구될 수 있습니다.', level: 'conditional', condition: '고액 출금 시', source: '특금법 제5조 / 자금세탁방지법' },
  ],
  korbit: [
    { label: '출금 주소 사전 등록 필수', desc: '100만원 이상 개인지갑 출금 시 주소를 미리 등록해야 합니다. 100만원 미만은 자유 출금 가능합니다.', level: 'required', source: '코빗 고객센터 / 금융정보분석원 가이드라인' },
    { label: 'KYC 실명 인증 필수', desc: '본인 인증 완료 필요합니다.', level: 'required', source: '특금법 제5조 (고객 확인 의무)' },
    { label: '원화 입금 후 출금 지연', desc: '신규 고객은 첫 원화 입금 후 72시간, 기존 고객은 각 원화 입금 후 24시간 해당 금액 상당의 가상자산 출금이 제한됩니다.', level: 'conditional', condition: '원화 입금 시', source: '금융당국 보이스피싱 방지 지침' },
    { label: '트래블룰', desc: '100만원 이상 출금 시 수신자 정보 제출이 필요합니다.', level: 'conditional', condition: '100만원 이상 출금 시', source: '특금법 제7조 / FATF Recommendation 16' },
  ],
  coinone: [
    { label: '출금 주소 사전 등록 필수', desc: '안심 주소록에 출금 주소를 등록해야 합니다. 담당자 심사 후 승인되며 수일이 소요될 수 있습니다.', level: 'required', source: '코인원 고객센터 / 금융정보분석원 가이드라인' },
    { label: '최초 원화 입금 후 72시간 출금 금지', desc: '가입 후 첫 원화 입금 시 입금 시점부터 72시간 동안 가상자산 출금이 불가합니다. 이후 매 원화 입금마다 24시간 출금 제한이 적용됩니다.', level: 'conditional', condition: '최초 원화 입금 시', source: '금융당국 보이스피싱 방지 지침 / 코인원 72시간 출금지연제' },
    { label: '자금 출처 증명', desc: '고액 출금 시 자금 출처 서류 제출이 필요합니다.', level: 'conditional', condition: '고액 출금 시', source: '특금법 제5조 (고객 확인 의무)' },
  ],
  gopax: [
    { label: '출금 주소 사전 등록 필수', desc: '출금 주소를 미리 등록해야 합니다. 관리자 증빙 심사 후 승인됩니다.', level: 'required', source: '고팍스 고객센터 / 금융정보분석원 가이드라인' },
    { label: 'KYC 실명 인증 필수', desc: '본인 인증이 완료된 계정에서만 출금 가능합니다.', level: 'required', source: '특금법 제5조 (고객 확인 의무)' },
    { label: '트래블룰', desc: '100만원 이상 출금 시 수신자 정보 입력이 필요합니다.', level: 'conditional', condition: '100만원 이상 출금 시', source: '특금법 제7조 / FATF Recommendation 16' },
  ],
};

const DOMESTIC_DEFAULT: GateItem[] = [
  { label: '출금 주소 사전 등록 필수', desc: '출금 주소를 미리 등록해야 합니다.', level: 'required', source: '금융정보분석원(FIU) 가이드라인' },
  { label: 'KYC 실명 인증 필수', desc: '본인 인증 완료 필요합니다.', level: 'required', source: '특금법 제5조 (고객 확인 의무)' },
  { label: '트래블룰', desc: '100만원 이상 출금 시 수신자 정보 제출이 필요할 수 있습니다.', level: 'conditional', condition: '100만원 이상 출금 시', source: '특금법 제7조 / FATF Recommendation 16' },
];

// ── 해외 거래소 ────────────────────────────────────────────────────────────────

const GLOBAL: Record<string, GateItem[]> = {
  binance: [
    { label: 'KYC 인증 (Level 1 이상)', desc: '신분증 인증이 완료되어야 입출금이 가능합니다. 미인증 시 출금 불가.', level: 'required', source: 'Binance Terms of Service / FATF 권고안' },
    { label: '일일 출금 한도', desc: '미인증: 0.06 BTC/day, Basic 인증(Level 1): 0.6 BTC/day, 고급 인증(Level 2): 100 BTC/day', level: 'info', source: 'Binance Help Center — Updates to Daily Withdrawal Limits' },
    { label: '트래블룰', desc: '한국 이용자의 경우 특정 거래소로 출금 시 수신자 정보 입력이 필요합니다.', level: 'conditional', condition: '한국 KYC 완료 사용자', source: 'FATF Recommendation 16 / 특금법 제7조' },
  ],
  okx: [
    { label: 'KYC 인증 필수', desc: '개인 신원 인증 완료 필요합니다.', level: 'required', source: 'OKX Terms of Service / FATF 권고안' },
    { label: '일일 출금 한도', desc: 'KYC1(기본·이메일 인증): $5,000/day, KYC2(신분증+얼굴 인증): $500,000/day, KYC3(고급): 무제한', level: 'info', source: 'OKX Help Center — KYC Requirements Guide (2025)' },
    { label: '신규 주소 24시간 지연', desc: '새로 등록한 주소는 24시간 후 출금이 가능합니다.', level: 'conditional', condition: '신규 주소 등록 시', source: 'OKX 보안 정책' },
  ],
  bybit: [
    { label: 'KYC 인증 필수', desc: '거주 국가 및 신분 인증 필요합니다.', level: 'required', source: 'Bybit Terms of Service / FATF 권고안' },
    { label: '신규 주소 24시간 지연', desc: '새로 등록한 주소는 24시간 후 사용 가능합니다.', level: 'conditional', condition: '신규 주소 등록 시', source: 'Bybit Help Center — How to Manage Withdrawal Address Book' },
    { label: '일일 출금 한도', desc: '미인증: 2 BTC/day, Standard KYC(Level 1): 50 BTC/day, Advanced KYC(Level 2): 100 BTC/day', level: 'info', source: 'Bybit Help Center — FAQ Crypto Withdrawal' },
  ],
  bitget: [
    { label: 'KYC 인증 필수', desc: '신분증 인증이 필요합니다.', level: 'required', source: 'Bitget Terms of Service / FATF 권고안' },
    { label: '일일 출금 한도', desc: '미인증: $20,000/day, KYC 완료(VIP0): $3,000,000/day, 고급 VIP: 최대 $15,000,000/day', level: 'info', source: 'Bitget — Mandatory KYC and Withdrawal Limit Policy' },
    { label: '신규 주소 24시간 지연', desc: '새로 추가한 주소는 24시간 후 출금 가능합니다.', level: 'conditional', condition: '신규 주소 등록 시', source: 'Bitget 보안 정책' },
  ],
  kraken: [
    { label: 'KYC 인증 필수 (Intermediate 이상)', desc: '주소 및 신분 증명 완료 필요합니다.', level: 'required', source: 'Kraken — Verification levels and limits / FATF 권고안' },
    { label: '일일 출금 한도', desc: 'Intermediate: $500,000/day, Pro: 무제한', level: 'info', source: 'Kraken Help Center — Deposit and Withdrawal Limits' },
  ],
  coinbase: [
    { label: 'KYC 인증 필수', desc: '신분 인증 및 거주지 인증 완료 필요합니다.', level: 'required', source: 'Coinbase Terms of Service / FinCEN 규정' },
    { label: '한국 법정화폐 서비스 미제공', desc: 'Coinbase는 한국 거주자에게 법정화폐 입출금 서비스를 제공하지 않습니다. 크립토 간 거래는 제한적으로 가능합니다.', level: 'required', source: 'Coinbase 지역 서비스 정책' },
    { label: '일일 출금 한도', desc: '계정 등급에 따라 한도 상이', level: 'info', source: 'Coinbase Help Center' },
  ],
  gate: [
    { label: 'KYC 인증 필수', desc: '신분증 인증이 필요합니다. KYC 미완료 시 출금 불가.', level: 'required', source: 'Gate.io Terms of Service / FATF 권고안' },
    { label: '트래블룰 지원 (VerifyVASP·CODE)', desc: 'Gate.io는 VerifyVASP 및 CODE 트래블룰 솔루션을 지원합니다. 국내 거래소와의 이전이 가능합니다.', level: 'info', source: 'FATF Recommendation 16 / Gate.io 공식 발표' },
    { label: '신규 주소 24시간 지연', desc: '새로 추가한 출금 주소는 24시간 후 사용 가능합니다.', level: 'conditional', condition: '신규 주소 등록 시', source: 'Gate.io 보안 정책' },
    { label: '일일 출금 한도', desc: 'KYC Lv1: $2,000,000/day, Lv2: $5,000,000/day', level: 'info', source: 'Gate.io Help Center — Withdrawal Limits' },
  ],
};

const GLOBAL_DEFAULT: GateItem[] = [
  { label: 'KYC 인증 필수', desc: '신원 인증이 완료되어야 입출금이 가능합니다.', level: 'required', source: 'FATF 권고안' },
  { label: '일일 출금 한도', desc: 'KYC 등급에 따라 출금 한도가 상이합니다.', level: 'info', source: '각 거래소 Help Center' },
];

// ── 온체인 공통 ────────────────────────────────────────────────────────────────

export const ONCHAIN_GATES: GateItem[] = [
  { label: '주소 오입력 시 복구 불가', desc: 'Bitcoin 블록체인 트랜잭션은 한번 전송되면 취소하거나 되돌릴 수 없습니다. 반드시 주소를 확인하세요.', level: 'required', source: 'Bitcoin 프로토콜 (블록체인 불변성)' },
  { label: '네트워크 수수료(Network Fee) 발생', desc: '네트워크 혼잡도에 따라 네트워크 수수료가 변동됩니다. 혼잡 시 수수료가 높아질 수 있습니다.', level: 'info', source: 'Bitcoin 블록체인 프로토콜' },
  { label: '입금 확인 시간 소요', desc: '1 블록 확인에 약 10분, 거래소 입금 반영까지 1~6 블록(10분~1시간) 소요됩니다.', level: 'info', source: 'Bitcoin 프로토콜 (평균 블록 생성 10분)' },
];

// ── 조회 함수 (정적 기본값 기준) ──────────────────────────────────────────────

export function getDomesticGates(
  exchangeId: string,
  live?: Record<string, GateItem[]>,
): GateItem[] {
  const id = exchangeId.toLowerCase();
  return live?.[id] ?? DOMESTIC[id] ?? DOMESTIC_DEFAULT;
}

export function getGlobalGates(
  exchangeId: string,
  live?: Record<string, GateItem[]>,
): GateItem[] {
  const id = exchangeId.toLowerCase();
  return live?.[id] ?? GLOBAL[id] ?? GLOBAL_DEFAULT;
}

// ── 타입 내보내기 ──────────────────────────────────────────────────────────────

export interface LiveRegistry {
  domestic: Record<string, GateItem[]>;
  global: Record<string, GateItem[]>;
  onchain: GateItem[];
  updated_at: string;
  updated_source: string;
}
