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

export const CARF_GROUP_LABELS: Record<CarfGroup, string> = {
  '2027': '2027년 첫 교환',
  '2028': '2028년 첫 교환',
  '2029': '2029년 첫 교환',
  not_member: 'CARF 미가입',
  unclear: '불명확',
};
