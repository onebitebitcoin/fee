// ── useExchangeMetadata ───────────────────────────────────────────────────────
// 거래소 메타데이터(게이트맨 레지스트리/유의 플래그/CARF 연도/출금 한도)를 마운트 시 1회 fetch.
// 나머지 탐색 상태와 결합 없음 — 각자 자기 상태를 소유하고 read-only로 노출한다.

import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { LiveRegistry } from '../../lib/gatemanRegistry';

export interface WithdrawalLimitInfo {
  krw_per_tx_limit: number | null;
  btc_per_tx_max: number | null;
  btc_daily_verified: number | null;
  krw_daily_verified_digital: number | null;
  source: string;
  scraped_at: number | null;
}

export interface ExchangeMetadata {
  liveRegistry: LiveRegistry | null;
  cautionMap: Record<string, { caution: boolean; reason: string | null }>;
  // CARF 첫 정보교환 연도 (DB 권위 소스, id→연도). 미수신 시 정적 constants(info.carf) fallback.
  carfMap: Record<string, number>;
  withdrawalLimits: Record<string, WithdrawalLimitInfo>;
}

export function useExchangeMetadata(): ExchangeMetadata {
  const [liveRegistry, setLiveRegistry] = useState<LiveRegistry | null>(null);
  const [cautionMap, setCautionMap] = useState<Record<string, { caution: boolean; reason: string | null }>>({});
  const [carfMap, setCarfMap] = useState<Record<string, number>>({});
  const [withdrawalLimits, setWithdrawalLimits] = useState<Record<string, WithdrawalLimitInfo>>({});

  useEffect(() => {
    api.getGatemanRegistry().then(res => {
      setLiveRegistry(res.data as unknown as LiveRegistry);
    }).catch(() => { /* use static defaults */ });
  }, []);

  useEffect(() => {
    api.getWithdrawalLimits().then(res => {
      setWithdrawalLimits(res.limits);
    }).catch(() => { /* keep static DOMESTIC_INFO fallback */ });
  }, []);

  useEffect(() => {
    api.getCaution().then(setCautionMap).catch(() => { /* keep empty */ });
  }, []);

  useEffect(() => {
    api.getCarfExchanges().then(res => {
      const m: Record<string, number> = {};
      for (const e of res.exchanges) {
        const year = e.carfFirstExchange ? parseInt(e.carfFirstExchange, 10) : NaN;
        if (!Number.isNaN(year)) m[e.id] = year;
      }
      setCarfMap(m);
    }).catch(() => { /* keep static constants fallback */ });
  }, []);

  return { liveRegistry, cautionMap, carfMap, withdrawalLimits };
}
