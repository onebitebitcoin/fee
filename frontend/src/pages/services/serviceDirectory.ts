// ── 서비스 디렉토리 순수 로직 ──────────────────────────────────────────────────
// API 응답 + 정적 메타를 합쳐 서비스 노드 목록을 만들고, 검색/타입 필터를 적용한다.
// 부수효과·React 의존 없음 → 단위 테스트 가능 (serviceDirectory.test.ts).

import type {
  CarfExchangeInfo,
  ExchangeCapabilityRow,
  ExchangeStatusNode,
  KycStatus,
  LightningSwapFeeRow,
} from '../../types';
import { fmtEx } from '../../lib/exchangeNames';
import { DOMESTIC_INFO, GLOBAL_INFO } from '../explorer/constants';

export type ServiceType = 'domestic' | 'global' | 'lightning';
export type ServiceTypeFilter = ServiceType | 'all';

export interface ServiceNode {
  id: string;
  name: string;              // 한글 표시명 (fmtEx)
  type: ServiceType;
  kycStatus: KycStatus;
  lightning: boolean;        // 거래소=LN 출금 지원 / 스왑 서비스=항상 true
  caution: boolean;
  cautionReason: string | null;
  noticeCount: number;
  swapFee: LightningSwapFeeRow | null;   // 라이트닝 서비스만
  statusNode: ExchangeStatusNode | null; // /market/status 원본 노드
  carf: CarfExchangeInfo | null;
}

export const SERVICE_TYPE_LABEL: Record<ServiceType, string> = {
  domestic: '국내 거래소',
  global: '해외 거래소',
  lightning: '라이트닝',
};

export interface BuildInputs {
  statusExchanges: ExchangeStatusNode[];
  statusLightning: ExchangeStatusNode[];
  capabilities: ExchangeCapabilityRow[];
  swapFees: LightningSwapFeeRow[];
  caution: Record<string, { caution: boolean; reason: string | null }>;
  carf: CarfExchangeInfo[];
}

const DOMESTIC_IDS = new Set(Object.keys(DOMESTIC_INFO));
const GLOBAL_IDS = new Set(Object.keys(GLOBAL_INFO));

function exchangeType(id: string): ServiceType {
  if (DOMESTIC_IDS.has(id)) return 'domestic';
  if (GLOBAL_IDS.has(id)) return 'global';
  return 'global';
}

/** API 응답들을 합쳐 서비스 노드 목록 생성. 국내 → 해외 → 라이트닝 순. */
export function buildServiceNodes(inputs: BuildInputs): ServiceNode[] {
  const capByEx = new Map(inputs.capabilities.map(c => [c.exchange.toLowerCase(), c]));
  const carfById = new Map(inputs.carf.map(c => [c.id.toLowerCase(), c]));
  const swapByName = new Map(inputs.swapFees.map(s => [s.service_name.toLowerCase(), s]));

  const exchanges: ServiceNode[] = inputs.statusExchanges.map(node => {
    const id = node.exchange.toLowerCase();
    const cap = capByEx.get(id);
    const type = exchangeType(id);
    const staticLn = type === 'domestic'
      ? DOMESTIC_INFO[id]?.lightning ?? false
      : GLOBAL_INFO[id]?.lightning ?? false;
    return {
      id,
      name: fmtEx(id),
      type,
      kycStatus: node.kyc_status ?? null,
      lightning: cap ? cap.supports_lightning_withdrawal : staticLn,
      caution: inputs.caution[id]?.caution ?? false,
      cautionReason: inputs.caution[id]?.reason ?? null,
      noticeCount: node.notices?.length ?? 0,
      swapFee: null,
      statusNode: node,
      carf: carfById.get(id) ?? null,
    };
  });

  // 라이트닝 노드는 (서비스, direction)별로 중복 — 서비스당 1개로 dedup,
  // ln_to_onchain(매수 경로 exit 방향) 노드 우선.
  const lnById = new Map<string, ExchangeStatusNode>();
  for (const node of inputs.statusLightning) {
    const id = node.exchange.toLowerCase();
    const cur = lnById.get(id);
    if (!cur || (cur.direction !== 'ln_to_onchain' && node.direction === 'ln_to_onchain')) {
      lnById.set(id, node);
    }
  }
  const lightning: ServiceNode[] = [...lnById.entries()].map(([id, node]) => ({
    id,
    name: fmtEx(id),
    type: 'lightning' as const,
    kycStatus: node.kyc_status ?? null,
    lightning: true,
    caution: inputs.caution[id]?.caution ?? false,
    cautionReason: inputs.caution[id]?.reason ?? null,
    noticeCount: node.notices?.length ?? 0,
    swapFee: swapByName.get(id) ?? null,
    statusNode: node,
    carf: null,
  }));

  const order: Record<ServiceType, number> = { domestic: 0, global: 1, lightning: 2 };
  return [...exchanges, ...lightning].sort(
    (a, b) => order[a.type] - order[b.type] || a.name.localeCompare(b.name, 'ko'),
  );
}

/** 이름(한글/영문 id) 부분일치 검색 + 타입 필터. */
export function filterServiceNodes(
  nodes: ServiceNode[],
  query: string,
  typeFilter: ServiceTypeFilter,
): ServiceNode[] {
  const q = query.trim().toLowerCase();
  return nodes.filter(n => {
    if (typeFilter !== 'all' && n.type !== typeFilter) return false;
    if (!q) return true;
    return n.id.includes(q) || n.name.toLowerCase().includes(q);
  });
}
