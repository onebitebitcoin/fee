export type CarfGroup = '2027' | '2028' | '2029' | 'not_member' | 'unclear';
export type KoreaImpact = 'high' | 'medium' | 'low' | 'none';

export interface ExchangeCarfInfo {
  id: string;
  name: string;
  shortName: string;
  type: 'korean' | 'global';
  registeredCountry: string;
  carfGroup: CarfGroup;
  carfFirstExchange: string | null;
  koreaService: boolean;
  koreaBlocked: boolean;
  koreaImpact: KoreaImpact;
  impactDetail: string;
}

export const KOREAN_EXCHANGES: ExchangeCarfInfo[] = [
  {
    id: 'upbit',
    name: '업비트',
    shortName: '업비트',
    type: 'korean',
    registeredCountry: '대한민국',
    carfGroup: '2027',
    carfFirstExchange: '2027',
    koreaService: true,
    koreaBlocked: false,
    koreaImpact: 'high',
    impactDetail: '한국 법인, 한국 거주자 데이터 → 2027년 상호 정보교환 대상',
  },
  {
    id: 'bithumb',
    name: '빗썸',
    shortName: '빗썸',
    type: 'korean',
    registeredCountry: '대한민국',
    carfGroup: '2027',
    carfFirstExchange: '2027',
    koreaService: true,
    koreaBlocked: false,
    koreaImpact: 'high',
    impactDetail: '한국 법인, VASP 갱신 심사 중. CARF 보고 2026년 시작',
  },
  {
    id: 'coinone',
    name: '코인원',
    shortName: '코인원',
    type: 'korean',
    registeredCountry: '대한민국',
    carfGroup: '2027',
    carfFirstExchange: '2027',
    koreaService: true,
    koreaBlocked: false,
    koreaImpact: 'high',
    impactDetail: '한국 법인, FIU 제재 심의 중이나 CARF 의무 적용',
  },
  {
    id: 'korbit',
    name: '코빗',
    shortName: '코빗',
    type: 'korean',
    registeredCountry: '대한민국',
    carfGroup: '2027',
    carfFirstExchange: '2027',
    koreaService: true,
    koreaBlocked: false,
    koreaImpact: 'high',
    impactDetail: '한국 법인, VASP 갱신 승인 완료',
  },
  {
    id: 'gopax',
    name: '고팍스',
    shortName: '고팍스',
    type: 'korean',
    registeredCountry: '대한민국',
    carfGroup: '2027',
    carfFirstExchange: '2027',
    koreaService: true,
    koreaBlocked: false,
    koreaImpact: 'high',
    impactDetail: '한국 법인, Binance 지분 이슈로 VASP 갱신 불확실',
  },
];

export const GLOBAL_EXCHANGES: ExchangeCarfInfo[] = [
  {
    id: 'binance',
    name: 'Binance',
    shortName: 'Binance',
    type: 'global',
    registeredCountry: '케이맨 제도',
    carfGroup: '2027',
    carfFirstExchange: '2027',
    koreaService: false,
    koreaBlocked: true,
    koreaImpact: 'medium',
    impactDetail: '한국 FIU 미등록, 앱 차단. 케이맨 CARF 2027 적용.',
  },
  {
    id: 'okx',
    name: 'OKX',
    shortName: 'OKX',
    type: 'global',
    registeredCountry: '세이셸',
    carfGroup: '2028',
    carfFirstExchange: '2028',
    koreaService: false,
    koreaBlocked: true,
    koreaImpact: 'low',
    impactDetail: '한국 앱 차단. 세이셸 CARF 2028.',
  },
  {
    id: 'bybit',
    name: 'Bybit',
    shortName: 'Bybit',
    type: 'global',
    registeredCountry: 'BVI',
    carfGroup: '2028',
    carfFirstExchange: '2028',
    koreaService: false,
    koreaBlocked: true,
    koreaImpact: 'low',
    impactDetail: '한국 앱 차단. BVI CARF 2028.',
  },
  {
    id: 'bitget',
    name: 'Bitget',
    shortName: 'Bitget',
    type: 'global',
    registeredCountry: '세이셸',
    carfGroup: '2028',
    carfFirstExchange: '2028',
    koreaService: false,
    koreaBlocked: true,
    koreaImpact: 'low',
    impactDetail: '한국 앱스토어 차단. 세이셸 CARF 2028.',
  },
  {
    id: 'kraken',
    name: 'Kraken',
    shortName: 'Kraken',
    type: 'global',
    registeredCountry: '미국 (와이오밍)',
    carfGroup: '2029',
    carfFirstExchange: '2029',
    koreaService: false,
    koreaBlocked: false,
    koreaImpact: 'low',
    impactDetail: '미국 CARF 2029. 한국 공식 서비스 미제공.',
  },
  {
    id: 'coinbase',
    name: 'Coinbase',
    shortName: 'Coinbase',
    type: 'global',
    registeredCountry: '미국 (텍사스)',
    carfGroup: '2029',
    carfFirstExchange: '2029',
    koreaService: false,
    koreaBlocked: false,
    koreaImpact: 'low',
    impactDetail: '미국 CARF 2029. 한국 공식 서비스 미제공.',
  },
  {
    id: 'bitfinex',
    name: 'Bitfinex',
    shortName: 'Bitfinex',
    type: 'global',
    registeredCountry: 'BVI',
    carfGroup: '2028',
    carfFirstExchange: '2028',
    koreaService: false,
    koreaBlocked: false,
    koreaImpact: 'low',
    impactDetail: 'BVI CARF 2028. 한국 공식 서비스 없음.',
  },
  {
    id: 'kucoin',
    name: 'KuCoin',
    shortName: 'KuCoin',
    type: 'global',
    registeredCountry: '터크스케이커스',
    carfGroup: 'not_member',
    carfFirstExchange: null,
    koreaService: false,
    koreaBlocked: true,
    koreaImpact: 'none',
    impactDetail: '터크스케이커스 CARF 미가입. 한국 앱스토어 차단. CARF 사각지대.',
  },
  {
    id: 'gate',
    name: 'Gate.io',
    shortName: 'Gate.io',
    type: 'global',
    registeredCountry: '케이맨 제도',
    carfGroup: '2027',
    carfFirstExchange: '2027',
    koreaService: true,
    koreaBlocked: false,
    koreaImpact: 'high',
    impactDetail: '한국 공식 서비스(서울 오피스). 케이맨 CARF 2027 적용.',
  },
  {
    id: 'htx',
    name: 'HTX (Huobi)',
    shortName: 'HTX',
    type: 'global',
    registeredCountry: '세이셸 (법인 말소)',
    carfGroup: 'unclear',
    carfFirstExchange: null,
    koreaService: false,
    koreaBlocked: false,
    koreaImpact: 'none',
    impactDetail: '세이셸 법인 말소 상태. 규제 공백. CARF 사각지대.',
  },
];

export const CARF_GROUP_LABELS: Record<CarfGroup, string> = {
  '2027': '2027년 교환',
  '2028': '2028년 교환',
  '2029': '2029년 교환',
  not_member: 'CARF 미가입',
  unclear: '불명확',
};

export const KEY_INSIGHTS = [
  '한국 5대 원화 거래소는 모두 2027년 CARF 첫 교환 대상',
  '2026년 1월 1일부터 데이터 수집 이미 시작 — 현재 모든 거래 기록 중',
  'Gate.io가 한국 공식 서비스 제공 유일 글로벌 거래소 + 케이맨 CARF 2027 적용',
  'KuCoin·HTX는 CARF 완전 사각지대 — 세금 추적 불가',
  '가상자산 과세(2027-01) + CARF 첫 교환(2027) 동시 시행 예정',
];

export interface SourceLink {
  label: string;
  url: string;
}

export const SOURCES: SourceLink[] = [
  {
    label: 'OECD CARF 가입국 목록 (공식 PDF)',
    url: 'https://www.oecd.org/content/dam/oecd/en/networks/global-forum-tax-transparency/commitments-carf.pdf',
  },
  {
    label: 'OECD CARF 2025 모니터링 업데이트',
    url: 'https://www.oecd.org/content/dam/oecd/en/networks/global-forum-tax-transparency/crypto-asset-reporting-framework-monitoring-implementation-update-2025.pdf',
  },
  {
    label: 'KDI: 한국 CARF MCAA 서명 (2024-11)',
    url: 'https://eiec.kdi.re.kr/policy/materialView.do?num=260337',
  },
  {
    label: '한국일보: 2027년부터 암호화자산 국가간 거래정보 교환',
    url: 'https://www.hankookilbo.com/News/Read/A2025102815210003392',
  },
  {
    label: '케이맨 제도 CARF 규정 시행 (2026-01)',
    url: 'https://www.loebsmith.com/insight/the-cayman-islands-implements-crypto-asset-reporting-framework/',
  },
  {
    label: '한국 거래소 VASP 갱신 현황 (디일렉)',
    url: 'https://www.thelec.kr/news/articleView.html?idxno=50127',
  },
  {
    label: '국세청: 가상자산 과세 안내',
    url: 'https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?mi=40370&cntntsId=238935',
  },
];
