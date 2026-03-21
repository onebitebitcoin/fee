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

export interface ExchangeSource {
  label: string;
  url: string;
  type: 'tos' | 'regulatory' | 'news' | 'official';
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
  sources?: ExchangeSource[];
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
    registeredCountry: 'UAE (ADGM)',
    mapLocation: {
      label: '아부다비, UAE',
      latitude: 24.4539,
      longitude: 54.3773,
      focusLabel: '글로벌 규제 허브 (ADGM)',
      note: '2026년 1월 5일부터 계약 법인이 케이맨 Nest Services Ltd.에서 UAE ADGM의 Nest Exchange Ltd.로 이전 완료.',
    },
    carfGroup: '2028',
    carfDataCollectionStart: '2027-01-01',
    carfFirstExchange: '2028',
    koreaService: false,
    koreaBlocked: true,
    koreaImpact: 'medium',
    impactDetail: '한국 FIU 미등록, 앱 차단. 2026년 1월 UAE ADGM 이전 완료 — UAE CARF 2028 적용.',
    travelRuleKorea: 'compatible',
    travelRuleNote: 'VerifyVASP 참여 — 한국 거래소와 트래블룰 정보 교환 가능',
    koreaUserJurisdiction: 'UAE (ADGM)',
    koreaUserJurisdictionNote: '2026-01-05부터 Nest Exchange Ltd.(UAE ADGM) 약관 적용. 케이맨 Binance Holdings Ltd.에서 novation 완료.',
    sources: [
      {
        label: 'Binance ADGM 전환 공식 발표 (2026-01-05)',
        url: 'https://www.binance.com/en/support/announcement/detail/f4f57a010f074dae9d34718635aba926',
        type: 'official',
      },
      {
        label: 'ADGM FSRA: Binance 라이선스 승인 발표',
        url: 'https://www.adgm.com/media/announcements/binance-becomes-first-crypto-exchange-to-secure-a-global-license-under-adgm-framework-setting-a-new-standard-in-digital-asset-regulation',
        type: 'regulatory',
      },
      {
        label: 'UAE CARF 서명 및 2028년 첫 교환 (Ministry of Finance)',
        url: 'https://mof.gov.ae/en/news/uae-signs-multilateral-competent-authority-agreement-on-the-automatic-exchange-of-information-under-the-crypto-asset-reporting-framework/',
        type: 'regulatory',
      },
      {
        label: 'Binance 2026 이용약관 (ADGM 법인 기준)',
        url: 'https://www.binance.com/en/terms',
        type: 'tos',
      },
    ],
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
    sources: [
      {
        label: 'OKX 이용약관 (Aux Cayes FinTech Co. Ltd., 세이셸)',
        url: 'https://www.okx.com/en/terms-of-service',
        type: 'tos',
      },
      {
        label: '세이셸 FSA: CARF 의무 준수 지침 (2028년 첫 교환)',
        url: 'https://fsaseychelles.sc/digital-assets',
        type: 'regulatory',
      },
      {
        label: 'OECD CARF 가입국 목록 — 세이셸 포함',
        url: 'https://www.oecd.org/content/dam/oecd/en/networks/global-forum-tax-transparency/commitments-carf.pdf',
        type: 'official',
      },
    ],
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
    koreaUserJurisdictionNote: 'Bybit Technology Limited(BVI) 약관 적용, 실질 HQ는 UAE 두바이. 구 법인 Bybit Fintech Limited는 2021년 말소.',
    sources: [
      {
        label: 'Bybit 이용약관 (Bybit Technology Limited, BVI)',
        url: 'https://www.bybit.com/en/terms-service/terms-of-service/',
        type: 'tos',
      },
      {
        label: 'BVI FSC: 가상자산 규제 및 CARF 2028 시행',
        url: 'https://www.bvifsc.vg/virtual-assets',
        type: 'regulatory',
      },
      {
        label: 'OECD CARF 가입국 목록 — BVI 포함',
        url: 'https://www.oecd.org/content/dam/oecd/en/networks/global-forum-tax-transparency/commitments-carf.pdf',
        type: 'official',
      },
    ],
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
    sources: [
      {
        label: 'Bitget 이용약관 (Bitget Limited, 세이셸)',
        url: 'https://www.bitget.com/en/support/articles/12560603794013',
        type: 'tos',
      },
      {
        label: '세이셸 FSA: CARF 의무 준수 지침 (2028년 첫 교환)',
        url: 'https://fsaseychelles.sc/digital-assets',
        type: 'regulatory',
      },
      {
        label: 'OECD CARF 가입국 목록 — 세이셸 포함',
        url: 'https://www.oecd.org/content/dam/oecd/en/networks/global-forum-tax-transparency/commitments-carf.pdf',
        type: 'official',
      },
    ],
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
    sources: [
      {
        label: 'Kraken 이용약관 (Payward Inc., 미국 캘리포니아)',
        url: 'https://www.kraken.com/legal/terms-of-service',
        type: 'tos',
      },
      {
        label: '미국 재무부: CARF 미채택 — OECD 동참 여부 미결정',
        url: 'https://home.treasury.gov/news/press-releases/jy1978',
        type: 'regulatory',
      },
      {
        label: 'OECD CARF 가입국 목록 — 미국 미포함',
        url: 'https://www.oecd.org/content/dam/oecd/en/networks/global-forum-tax-transparency/commitments-carf.pdf',
        type: 'official',
      },
    ],
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
    koreaUserJurisdictionNote: 'Coinbase Global, Inc.(미국 텍사스) 약관 적용. 2025-12-15 델라웨어→텍사스 재편입 완료. 한국 공식 서비스 미제공.',
    sources: [
      {
        label: 'Coinbase 이용약관 (미국 사용자 계약)',
        url: 'https://www.coinbase.com/legal/user_agreement/united_states',
        type: 'tos',
      },
      {
        label: 'Coinbase SEC 8-K: 텍사스 재편입 완료 (2025-12-15)',
        url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=COIN&type=8-K&dateb=&owner=include&count=10',
        type: 'official',
      },
      {
        label: 'OECD CARF 가입국 목록 — 미국 미포함',
        url: 'https://www.oecd.org/content/dam/oecd/en/networks/global-forum-tax-transparency/commitments-carf.pdf',
        type: 'official',
      },
    ],
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
    sources: [
      {
        label: 'Bitfinex 이용약관 (iFinex Inc., BVI)',
        url: 'https://www.bitfinex.com/legal/terms',
        type: 'tos',
      },
      {
        label: 'BVI FSC: 가상자산 규제 및 CARF 2028 시행',
        url: 'https://www.bvifsc.vg/virtual-assets',
        type: 'regulatory',
      },
      {
        label: 'OECD CARF 가입국 목록 — BVI 포함',
        url: 'https://www.oecd.org/content/dam/oecd/en/networks/global-forum-tax-transparency/commitments-carf.pdf',
        type: 'official',
      },
    ],
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
    sources: [
      {
        label: 'KuCoin 이용약관 (Peken Global Ltd., 터크스케이커스)',
        url: 'https://www.kucoin.com/legal/user-agreement',
        type: 'tos',
      },
      {
        label: 'OECD CARF 가입국 목록 — 터크스케이커스 미포함',
        url: 'https://www.oecd.org/content/dam/oecd/en/networks/global-forum-tax-transparency/commitments-carf.pdf',
        type: 'official',
      },
      {
        label: 'DOJ: KuCoin 자금세탁 기소 및 $297M 합의 (2024)',
        url: 'https://www.justice.gov/opa/pr/kucoin-and-its-founders-charged-money-laundering-and-operating-unlicensed-money-transmitting',
        type: 'news',
      },
    ],
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
    },
    carfGroup: '2027',
    carfDataCollectionStart: '2026-01-01',
    carfFirstExchange: '2027',
    koreaService: false,
    koreaBlocked: false,
    koreaImpact: 'high',
    impactDetail: '케이맨 CARF 2027 적용. 한국을 서비스 제한 지역으로 약관에 명시.',
    travelRuleKorea: 'partial',
    travelRuleNote: 'VerifyVASP 참여 여부 불확실, 한국 제한 지역으로 실질 연동 미검증',
    koreaUserJurisdiction: '케이맨 제도',
    koreaUserJurisdictionNote: '한국을 서비스 제한 지역으로 약관에 명시. Gate Technology Inc.(케이맨) 약관 적용.',
    sources: [
      {
        label: 'Gate.io 라이선스 및 법인 정보 (Gate Technology Inc., 케이맨)',
        url: 'https://www.gate.io/licenses',
        type: 'official',
      },
      {
        label: 'CIMA: Gate.io와의 관계 부인 공고 (2023)',
        url: 'https://www.cima.ky/news/cima-disclaimer-gate-technology-inc',
        type: 'regulatory',
      },
      {
        label: '케이맨 DITC: CARF 2027 시행 (Cayman 세금정보청)',
        url: 'https://www.ditc.ky/carf',
        type: 'regulatory',
      },
    ],
  },
  {
    id: 'htx',
    name: 'HTX (Huobi)',
    shortName: 'HTX',
    type: 'global',
    registeredCountry: '파나마',
    mapLocation: {
      label: '파나마시티, 파나마',
      latitude: 8.9936,
      longitude: -79.5197,
      focusLabel: '현 법인 관할',
      note: '구 세이셸 법인(Huobi Technology Co. Ltd.)은 2023년 말소. 현재 Huobi Global S.A.(파나마)로 운영 중.',
    },
    carfGroup: 'not_member',
    carfDataCollectionStart: null,
    carfFirstExchange: null,
    koreaService: false,
    koreaBlocked: false,
    koreaImpact: 'none',
    impactDetail: '구 세이셸 법인 2023년 말소 후 파나마 법인(Huobi Global S.A.)으로 전환. 파나마 CARF 미가입. 규제 공백 및 CARF 사각지대.',
    travelRuleKorea: 'none',
    travelRuleNote: '파나마 법인 전환 후 트래블룰 준수 불명확, 규제 공백 상태',
    koreaUserJurisdiction: '파나마',
    koreaUserJurisdictionNote: 'Huobi Global S.A.(파나마) 약관 적용. 세이셸 법인 말소로 전환. 파나마 CARF 미가입.',
    sources: [
      {
        label: 'FCA: HTX(Huobi Global) 경고 및 법인 현황',
        url: 'https://www.fca.org.uk/consumers/warning-list-retail-investments',
        type: 'regulatory',
      },
      {
        label: 'OECD CARF 가입국 목록 — 파나마 미포함',
        url: 'https://www.oecd.org/content/dam/oecd/en/networks/global-forum-tax-transparency/commitments-carf.pdf',
        type: 'official',
      },
    ],
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
  'Binance: 2026-01-05 UAE ADGM 이전 완료 → CARF 2028 적용 (케이맨 2027에서 변경)',
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
    label: 'Binance ADGM 전환 완료 — UAE CARF 2028 적용',
    url: 'https://www.binance.com/en/support/announcement/detail/f4f57a010f074dae9d34718635aba926',
  },
  {
    label: 'UAE CARF MCAA 서명 (UAE 재무부)',
    url: 'https://mof.gov.ae/en/news/uae-signs-multilateral-competent-authority-agreement-on-the-automatic-exchange-of-information-under-the-crypto-asset-reporting-framework/',
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
