export type CarfGroup = '2027' | '2028' | '2029' | 'not_member' | 'unclear';
export type KoreaImpact = 'high' | 'medium' | 'low' | 'none';
export type TravelRuleStatus = 'compatible' | 'partial' | 'none';

export interface ExchangeMapLocation {
  label: string;
  latitude: number;
  longitude: number;
  focusLabel: string;
  note?: string;
}

export interface ExchangeCarfInfo {
  id: string;
  name: string;
  shortName: string;
  type: 'korean' | 'global';
  registeredCountry: string;
  mapLocation: ExchangeMapLocation;
  carfGroup: CarfGroup;
  carfDataCollectionStart: string | null;
  carfFirstExchange: string | null;
  koreaService: boolean;
  koreaBlocked: boolean;
  koreaImpact: KoreaImpact;
  impactDetail: string;
  travelRuleKorea?: TravelRuleStatus;
  travelRuleNote?: string;
  koreaUserJurisdiction?: string;
  koreaUserJurisdictionNote?: string;
}

export const KOREAN_EXCHANGES: ExchangeCarfInfo[] = [
  {
    id: 'upbit',
    name: '업비트',
    shortName: '업비트',
    type: 'korean',
    registeredCountry: '대한민국',
    mapLocation: {
      label: '서울 중구, 대한민국',
      latitude: 37.5665,
      longitude: 126.978,
      focusLabel: '국내 서비스 본사',
    },
    carfGroup: '2027',
    carfDataCollectionStart: '2026-01-01',
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
    mapLocation: {
      label: '서울 강남구, 대한민국',
      latitude: 37.4979,
      longitude: 127.0276,
      focusLabel: '국내 서비스 본사',
    },
    carfGroup: '2027',
    carfDataCollectionStart: '2026-01-01',
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
    mapLocation: {
      label: '서울 성동구, 대한민국',
      latitude: 37.5446,
      longitude: 127.0557,
      focusLabel: '국내 서비스 본사',
    },
    carfGroup: '2027',
    carfDataCollectionStart: '2026-01-01',
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
    mapLocation: {
      label: '서울 강남구, 대한민국',
      latitude: 37.5183,
      longitude: 127.047,
      focusLabel: '국내 서비스 본사',
    },
    carfGroup: '2027',
    carfDataCollectionStart: '2026-01-01',
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
    mapLocation: {
      label: '서울 마포구, 대한민국',
      latitude: 37.5563,
      longitude: 126.9236,
      focusLabel: '국내 서비스 본사',
    },
    carfGroup: '2027',
    carfDataCollectionStart: '2026-01-01',
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
    mapLocation: {
      label: '아부다비, UAE',
      latitude: 24.4539,
      longitude: 54.3773,
      focusLabel: '글로벌 규제 허브',
      note: '최신 운영·규제 허브는 Abu Dhabi ADGM 기준으로 표시하고, CARF 관할 표기는 기존 정책 데이터(케이맨)를 유지했습니다.',
    },
    carfGroup: '2027',
    carfDataCollectionStart: '2026-01-01',
    carfFirstExchange: '2027',
    koreaService: false,
    koreaBlocked: true,
    koreaImpact: 'medium',
    impactDetail: '한국 FIU 미등록, 앱 차단. 케이맨 CARF 2027 적용.',
    travelRuleKorea: 'compatible',
    travelRuleNote: 'VerifyVASP 참여 — 한국 거래소와 트래블룰 정보 교환 가능',
    koreaUserJurisdiction: '케이맨 제도',
    koreaUserJurisdictionNote: '한국 FIU 미등록, 한국 사용자는 Binance Holdings Ltd.(케이맨) 약관 적용',
  },
  {
    id: 'okx',
    name: 'OKX',
    shortName: 'OKX',
    type: 'global',
    registeredCountry: '세이셸',
    mapLocation: {
      label: '빅토리아, 세이셸',
      latitude: -4.6191,
      longitude: 55.4513,
      focusLabel: '약관 법인 관할',
    },
    carfGroup: '2028',
    carfDataCollectionStart: '2027-01-01',
    carfFirstExchange: '2028',
    koreaService: false,
    koreaBlocked: true,
    koreaImpact: 'low',
    impactDetail: '한국 앱 차단. 세이셸 CARF 2028.',
    travelRuleKorea: 'partial',
    travelRuleNote: 'TRISA·VerifyVASP 일부 지원, 한국 차단으로 실질 미적용',
    koreaUserJurisdiction: '세이셸',
    koreaUserJurisdictionNote: 'Aux Cayes FinTech Co. Ltd.(세이셸) 약관 적용, EU 이용자는 OKX EU(몰타) 별도',
  },
  {
    id: 'bybit',
    name: 'Bybit',
    shortName: 'Bybit',
    type: 'global',
    registeredCountry: 'BVI',
    mapLocation: {
      label: '두바이, UAE',
      latitude: 25.2048,
      longitude: 55.2708,
      focusLabel: '운영 허브',
      note: '약관상 관할은 BVI지만, 시각 위치는 사용자 인지성이 높은 두바이 운영 허브로 표시합니다.',
    },
    carfGroup: '2028',
    carfDataCollectionStart: '2027-01-01',
    carfFirstExchange: '2028',
    koreaService: false,
    koreaBlocked: true,
    koreaImpact: 'low',
    impactDetail: '한국 앱 차단. BVI CARF 2028.',
    travelRuleKorea: 'partial',
    travelRuleNote: '자체 Travel Rule 솔루션 보유, 한국 VerifyVASP 네트워크 미참여',
    koreaUserJurisdiction: 'BVI',
    koreaUserJurisdictionNote: 'Bybit Fintech Limited(BVI) 약관 적용, 실질 HQ는 UAE 두바이',
  },
  {
    id: 'bitget',
    name: 'Bitget',
    shortName: 'Bitget',
    type: 'global',
    registeredCountry: '세이셸',
    mapLocation: {
      label: '빅토리아, 세이셸',
      latitude: -4.6191,
      longitude: 55.4513,
      focusLabel: '약관 법인 관할',
    },
    carfGroup: '2028',
    carfDataCollectionStart: '2027-01-01',
    carfFirstExchange: '2028',
    koreaService: false,
    koreaBlocked: true,
    koreaImpact: 'low',
    impactDetail: '한국 앱스토어 차단. 세이셸 CARF 2028.',
    travelRuleKorea: 'compatible',
    travelRuleNote: 'VerifyVASP 참여 — 한국 거래소와 트래블룰 정보 교환 가능',
    koreaUserJurisdiction: '세이셸',
    koreaUserJurisdictionNote: 'Bitget Limited(세이셸) 약관 적용',
  },
  {
    id: 'kraken',
    name: 'Kraken',
    shortName: 'Kraken',
    type: 'global',
    registeredCountry: '미국 (와이오밍)',
    mapLocation: {
      label: '샤이엔, 미국',
      latitude: 41.14,
      longitude: -104.8202,
      focusLabel: '주요 법인 관할',
    },
    carfGroup: '2029',
    carfDataCollectionStart: null,
    carfFirstExchange: '2029',
    koreaService: false,
    koreaBlocked: false,
    koreaImpact: 'low',
    impactDetail: '미국 CARF 2029. 한국 공식 서비스 미제공.',
    travelRuleKorea: 'partial',
    travelRuleNote: 'Travel Rule Protocol(TRP) 지원, 한국 VerifyVASP 네트워크 미참여',
    koreaUserJurisdiction: '미국 (와이오밍)',
    koreaUserJurisdictionNote: 'Payward Inc.(미국) 약관 적용, 한국 공식 서비스 미제공',
  },
  {
    id: 'coinbase',
    name: 'Coinbase',
    shortName: 'Coinbase',
    type: 'global',
    registeredCountry: '미국 (텍사스)',
    mapLocation: {
      label: '오스틴, 미국',
      latitude: 30.2672,
      longitude: -97.7431,
      focusLabel: '주요 법인 관할',
    },
    carfGroup: '2029',
    carfDataCollectionStart: null,
    carfFirstExchange: '2029',
    koreaService: false,
    koreaBlocked: false,
    koreaImpact: 'low',
    impactDetail: '미국 CARF 2029. 한국 공식 서비스 미제공.',
    travelRuleKorea: 'partial',
    travelRuleNote: 'Travel Rule Protocol(TRP) 지원, 한국 VerifyVASP 네트워크 미참여',
    koreaUserJurisdiction: '미국 (텍사스)',
    koreaUserJurisdictionNote: 'Coinbase Global, Inc.(미국) 약관 적용, 한국 공식 서비스 미제공',
  },
  {
    id: 'bitfinex',
    name: 'Bitfinex',
    shortName: 'Bitfinex',
    type: 'global',
    registeredCountry: 'BVI',
    mapLocation: {
      label: '로드타운, BVI',
      latitude: 18.4286,
      longitude: -64.6185,
      focusLabel: '약관 법인 관할',
    },
    carfGroup: '2028',
    carfDataCollectionStart: '2027-01-01',
    carfFirstExchange: '2028',
    koreaService: false,
    koreaBlocked: false,
    koreaImpact: 'low',
    impactDetail: 'BVI CARF 2028. 한국 공식 서비스 없음.',
    travelRuleKorea: 'none',
    travelRuleNote: '트래블룰 지원 미확인, CFTC 제재 이력으로 규제 리스크 높음',
    koreaUserJurisdiction: 'BVI',
    koreaUserJurisdictionNote: 'iFinex Inc.(BVI) 약관 적용',
  },
  {
    id: 'kucoin',
    name: 'KuCoin',
    shortName: 'KuCoin',
    type: 'global',
    registeredCountry: '터크스케이커스',
    mapLocation: {
      label: '프로비덴시알레스, 터크스케이커스',
      latitude: 21.7833,
      longitude: -72.2833,
      focusLabel: '약관 법인 관할',
    },
    carfGroup: 'not_member',
    carfDataCollectionStart: null,
    carfFirstExchange: null,
    koreaService: false,
    koreaBlocked: true,
    koreaImpact: 'none',
    impactDetail: '터크스케이커스 CARF 미가입. 한국 앱스토어 차단. CARF 사각지대.',
    travelRuleKorea: 'none',
    travelRuleNote: '트래블룰 미지원, DOJ $297M 합의 이력. 규제 회피 이전 이력',
    koreaUserJurisdiction: '터크스케이커스',
    koreaUserJurisdictionNote: 'Peken Global Ltd.(터크스케이커스) 약관 적용, CARF·트래블룰 모두 사각지대',
  },
  {
    id: 'gate',
    name: 'Gate.io',
    shortName: 'Gate.io',
    type: 'global',
    registeredCountry: '케이맨 제도',
    mapLocation: {
      label: '조지타운, 케이맨 제도',
      latitude: 19.2866,
      longitude: -81.3674,
      focusLabel: 'CARF 법인 관할',
      note: '서울 오피스가 있지만, 지구본에서는 CARF 적용과 직접 연결되는 케이맨 법인 위치를 우선 표시합니다.',
    },
    carfGroup: '2027',
    carfDataCollectionStart: '2026-01-01',
    carfFirstExchange: '2027',
    koreaService: true,
    koreaBlocked: false,
    koreaImpact: 'high',
    impactDetail: '한국 공식 서비스(서울 오피스). 케이맨 CARF 2027 적용.',
    travelRuleKorea: 'compatible',
    travelRuleNote: 'VerifyVASP 참여, 한국 공식 서비스 제공 — 트래블룰 완전 적용',
    koreaUserJurisdiction: '케이맨 제도 / 대한민국',
    koreaUserJurisdictionNote: '서울 오피스 운영, 한국 사용자는 한국 법 및 케이맨 약관 이중 적용 가능',
  },
  {
    id: 'htx',
    name: 'HTX (Huobi)',
    shortName: 'HTX',
    type: 'global',
    registeredCountry: '세이셸 (법인 말소)',
    mapLocation: {
      label: '빅토리아, 세이셸',
      latitude: -4.6191,
      longitude: 55.4513,
      focusLabel: '과거 법인 관할',
    },
    carfGroup: 'unclear',
    carfDataCollectionStart: null,
    carfFirstExchange: null,
    koreaService: false,
    koreaBlocked: false,
    koreaImpact: 'none',
    impactDetail: '세이셸 법인 말소 상태. 규제 공백. CARF 사각지대.',
    travelRuleKorea: 'none',
    travelRuleNote: '법인 말소로 트래블룰 준수 불가, 규제 공백 상태',
    koreaUserJurisdiction: '불명확',
    koreaUserJurisdictionNote: '세이셸 법인 말소로 적용 가능한 관할권 불명확, 리스크 최고',
  },
];

export const ALL_EXCHANGES = [...KOREAN_EXCHANGES, ...GLOBAL_EXCHANGES];

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
