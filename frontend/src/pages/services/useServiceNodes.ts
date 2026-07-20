import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { buildServiceNodes, type ServiceNode } from './serviceDirectory';

interface State {
  nodes: ServiceNode[];
  loading: boolean;
  error: string | null;
}

/** 목록/상세 페이지 공용 — 공개 API 5종을 병렬 fetch해 서비스 노드 목록 구성. */
export function useServiceNodes(): State {
  const [state, setState] = useState<State>({ nodes: [], loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [status, caps, swaps, caution, carf] = await Promise.all([
          api.getExchangeStatus(),
          api.getExchangeCapabilities().catch(() => ({ last_run: null, items: [] })),
          api.getLightningSwapFees().catch(() => ({ last_run: null, items: [] })),
          api.getCaution().catch(() => ({})),
          api.getCarfExchanges().catch(() => ({ exchanges: [] })),
        ]);
        if (cancelled) return;
        const nodes = buildServiceNodes({
          statusExchanges: status.exchanges,
          statusLightning: status.lightning_services,
          capabilities: caps.items,
          swapFees: swaps.items,
          caution,
          carf: carf.exchanges,
        });
        setState({ nodes, loading: false, error: null });
      } catch (e) {
        if (cancelled) return;
        setState({ nodes: [], loading: false, error: e instanceof Error ? e.message : '데이터를 불러오지 못했어요' });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return state;
}
