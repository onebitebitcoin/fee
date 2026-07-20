import { describe, expect, it } from 'vitest';
import { buildServiceNodes, filterServiceNodes, type BuildInputs } from './serviceDirectory';
import type { ExchangeStatusNode } from '../../types';

function statusNode(over: Partial<ExchangeStatusNode>): ExchangeStatusNode {
  return {
    exchange: 'upbit',
    type: 'exchange',
    withdrawal_rows: [],
    network_status: { status: 'ok', suspended_networks: [] },
    scrape_status: null,
    notices: [],
    ...over,
  } as ExchangeStatusNode;
}

function inputs(over: Partial<BuildInputs> = {}): BuildInputs {
  return {
    statusExchanges: [
      statusNode({ exchange: 'upbit', kyc_status: 'kyc', notices: [{ title: 'n', url: null, published_at: null }] }),
      statusNode({ exchange: 'binance', kyc_status: 'kyc' }),
    ],
    statusLightning: [
      statusNode({ exchange: 'Strike', type: 'lightning', direction: 'ln_to_onchain', kyc_status: 'mixed' }),
    ],
    capabilities: [{ exchange: 'binance', supports_lightning_deposit: true, supports_lightning_withdrawal: true }],
    swapFees: [{
      service_name: 'Strike', fee_pct: 0.5, fee_fixed_sat: 0, min_amount_sat: 0,
      max_amount_sat: null, enabled: true, source_url: null, error_message: null, recorded_at: null,
    }],
    caution: { binance: { caution: true, reason: '테스트 사유' } },
    carf: [{
      id: 'binance', name: 'Binance', shortName: null, type: null, registeredCountry: 'UAE',
      carfGroup: null, carfDataCollectionStart: null, carfFirstExchange: '2028', koreaService: null,
      koreaBlocked: null, koreaImpact: null, impactDetail: null, travelRuleKorea: null,
      travelRuleNote: null, koreaUserJurisdiction: null, koreaUserJurisdictionNote: null,
      mapLocation: null, sources: null,
    }],
    ...over,
  };
}

describe('buildServiceNodes', () => {
  it('국내 → 해외 → 라이트닝 순으로 노드를 만들고 메타를 붙인다', () => {
    const nodes = buildServiceNodes(inputs());
    expect(nodes.map(n => n.id)).toEqual(['upbit', 'binance', 'strike']);
    const binance = nodes.find(n => n.id === 'binance')!;
    expect(binance.type).toBe('global');
    expect(binance.lightning).toBe(true);           // capabilities 기반
    expect(binance.caution).toBe(true);
    expect(binance.carf?.carfFirstExchange).toBe('2028');
    const upbit = nodes.find(n => n.id === 'upbit')!;
    expect(upbit.type).toBe('domestic');
    expect(upbit.noticeCount).toBe(1);
  });

  it('라이트닝 노드는 방향별 중복을 서비스당 1개로 dedup하고 스왑 수수료를 붙인다', () => {
    const nodes = buildServiceNodes(inputs({
      statusLightning: [
        statusNode({ exchange: 'Strike', type: 'lightning', direction: 'onchain_to_ln' }),
        statusNode({ exchange: 'Strike', type: 'lightning', direction: 'ln_to_onchain', kyc_status: 'mixed' }),
      ],
    }));
    const strikes = nodes.filter(n => n.id === 'strike');
    expect(strikes).toHaveLength(1);
    expect(strikes[0].statusNode?.direction).toBe('ln_to_onchain'); // exit 방향 우선
    expect(strikes[0].swapFee?.fee_pct).toBe(0.5);
  });

  it('capabilities가 없는 거래소는 정적 메타 lightning으로 폴백한다', () => {
    const nodes = buildServiceNodes(inputs({ capabilities: [] }));
    const binance = nodes.find(n => n.id === 'binance')!;
    expect(binance.lightning).toBe(true);           // GLOBAL_INFO.binance.lightning
    const upbit = nodes.find(n => n.id === 'upbit')!;
    expect(upbit.lightning).toBe(false);            // DOMESTIC_INFO.upbit.lightning
  });
});

describe('filterServiceNodes', () => {
  const nodes = buildServiceNodes(inputs());

  it('타입 필터가 해당 타입만 남긴다', () => {
    expect(filterServiceNodes(nodes, '', 'lightning').map(n => n.id)).toEqual(['strike']);
    expect(filterServiceNodes(nodes, '', 'domestic').map(n => n.id)).toEqual(['upbit']);
  });

  it('한글명/영문 id 부분일치로 검색한다', () => {
    expect(filterServiceNodes(nodes, '업비', 'all').map(n => n.id)).toEqual(['upbit']);
    expect(filterServiceNodes(nodes, 'bina', 'all').map(n => n.id)).toEqual(['binance']);
    expect(filterServiceNodes(nodes, '없는서비스', 'all')).toHaveLength(0);
  });

  it('빈 검색어 + 전체 필터는 전부 반환한다', () => {
    expect(filterServiceNodes(nodes, '', 'all')).toHaveLength(3);
  });
});
