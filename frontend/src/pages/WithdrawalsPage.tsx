import { AlertTriangle, CheckCircle, Globe, Server, XCircle } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { fmtEx } from '../lib/exchangeNames';

import { PageErrorMessage } from '../components/PageErrorMessage';
import { PageSkeletonBlocks } from '../components/PageSkeletonBlocks';
import { useAsyncData } from '../hooks/useAsyncData';
import { api } from '../lib/api';
import type { CrawlErrorRow, LightningSwapFeeRow, WithdrawalRow } from '../types';

type WithdrawalsPageData = {
  items: WithdrawalRow[];
  errors: CrawlErrorRow[];
  latestScrapingTime: string | null;
};

type NodeGroup = {
  nodeId: string;
  nodeLabel: string;
  type: 'exchange' | 'lightning';
  rows: Array<
    | { kind: 'withdrawal'; data: WithdrawalRow }
    | { kind: 'lightning'; data: LightningSwapFeeRow }
  >;
};

const SATS_PER_BTC = 100_000_000;

function formatNumber(value: number, maximumFractionDigits = 8) {
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits }).format(value);
}

function formatWithdrawalFee(item: WithdrawalRow) {
  if (item.fee == null) return '-';
  if (item.coin.toUpperCase() === 'BTC') {
    return `${formatNumber(Math.round(item.fee * SATS_PER_BTC), 0)} sats`;
  }
  return formatNumber(item.fee);
}

function formatLightningFee(item: LightningSwapFeeRow) {
  const parts: string[] = [];
  if (item.fee_pct != null) parts.push(`${item.fee_pct}%`);
  if (item.fee_fixed_sat != null) parts.push(`+${formatNumber(item.fee_fixed_sat, 0)} sats`);
  return parts.length > 0 ? parts.join(' ') : '-';
}

function SourceIcon({ source }: { source: string }) {
  if (source === 'realtime_api') {
    return <Server size={13} className="text-bnb-green" />;
  }
  return <Globe size={13} className="text-bnb-muted" />;
}

export function WithdrawalsPage() {
  const [nameFilter, setNameFilter] = useState('');

  const loadWithdrawals = useCallback(async (): Promise<WithdrawalsPageData> => {
    const response = await api.getWithdrawals();
    return {
      items: response.items,
      errors: response.errors ?? [],
      latestScrapingTime: response.latest_scraping_time ?? response.last_run?.completed_at ?? null,
    };
  }, []);
  const { data, error, loading } = useAsyncData(loadWithdrawals, {
    initialData: { items: [], errors: [], latestScrapingTime: null },
  });

  const loadLightning = useCallback(async () => {
    const response = await api.getLightningSwapFees();
    return response.items;
  }, []);
  const { data: lightningItems } = useAsyncData(loadLightning, { initialData: [] });

  const nodeGroups = useMemo<NodeGroup[]>(() => {
    const map = new Map<string, NodeGroup>();

    for (const item of data.items) {
      const key = `exchange:${item.exchange}`;
      if (!map.has(key)) {
        map.set(key, { nodeId: key, nodeLabel: fmtEx(item.exchange), type: 'exchange', rows: [] });
      }
      map.get(key)!.rows.push({ kind: 'withdrawal', data: item });
    }

    for (const item of lightningItems) {
      const key = `lightning:${item.service_name}`;
      if (!map.has(key)) {
        map.set(key, { nodeId: key, nodeLabel: item.service_name, type: 'lightning', rows: [] });
      }
      map.get(key)!.rows.push({ kind: 'lightning', data: item });
    }

    return Array.from(map.values());
  }, [data.items, lightningItems]);

  const filteredGroups = useMemo(() => {
    if (!nameFilter.trim()) return nodeGroups;
    const q = nameFilter.toLowerCase();
    return nodeGroups.filter(g => g.nodeLabel.toLowerCase().includes(q));
  }, [nodeGroups, nameFilter]);

  if (error) return <PageErrorMessage message={error} />;
  if (loading) return <PageSkeletonBlocks />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-bnb-text">출금 수수료 현황</h2>
          {data.latestScrapingTime && (
            <p className="mt-1 text-xs text-bnb-muted">최신 스크래핑: {data.latestScrapingTime}</p>
          )}
        </div>
        <span className="text-sm text-bnb-muted">{filteredGroups.length}개 노드</span>
      </div>

      {/* 이름 필터 */}
      <input
        type="text"
        value={nameFilter}
        onChange={e => setNameFilter(e.target.value)}
        placeholder="거래소 / 서비스 이름 필터..."
        className="w-full border border-dark-200 bg-dark-400 px-3 py-2 text-sm text-bnb-text placeholder-bnb-muted focus:border-brand-400 focus:outline-none sm:w-64"
      />

      {data.errors.length > 0 && (
        <div className="flex items-start gap-2 border border-bnb-red/30 bg-bnb-red/10 p-4">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-bnb-red" />
          <div className="text-sm text-bnb-red">
            <p className="font-semibold">스크래핑 오류 {data.errors.length}건</p>
            <ul className="mt-2 space-y-1">
              {data.errors.map((item, index) => (
                <li key={`${item.stage}-${item.exchange}-${item.coin}-${index}`} className="text-bnb-muted">
                  {[item.exchange ? fmtEx(item.exchange) : null, item.coin].filter(Boolean).join(' / ')}: {item.error_message}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* 노드 그룹 목록 */}
      <div className="space-y-4">
        {filteredGroups.map(group => (
          <div key={group.nodeId} className="border border-dark-200">
            {/* 노드 헤더 */}
            <div className="flex items-center gap-2 border-b border-dark-200 bg-dark-400 px-4 py-2">
              <span className="font-semibold text-bnb-text">{group.nodeLabel}</span>
              {group.type === 'lightning' && (
                <span className="rounded bg-brand-400/20 px-1.5 py-0.5 text-xs text-brand-400">⚡ Lightning</span>
              )}
              <span className="ml-auto text-xs text-bnb-muted">{group.rows.length}개 네트워크</span>
            </div>

            {/* 모바일: 카드 */}
            <div className="space-y-0 md:hidden">
              {group.rows.map((row, idx) => {
                if (row.kind === 'withdrawal') {
                  const item = row.data;
                  return (
                    <div key={`m-${idx}`} className="border-t border-dark-200 bg-dark-300 p-3 first:border-t-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-bnb-muted">{item.coin} · {item.network_label}</p>
                        <div className="flex items-center gap-2">
                          <SourceIcon source={item.source} />
                          {item.enabled ? <CheckCircle size={14} className="text-bnb-green" /> : <XCircle size={14} className="text-bnb-red" />}
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <p className="text-xs text-bnb-muted">수수료</p>
                          <p className="font-semibold text-brand-500">{formatWithdrawalFee(item)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-bnb-muted">USD</p>
                          <p className="text-bnb-text">{item.fee_usd != null ? `$${item.fee_usd}` : '-'}</p>
                        </div>
                      </div>
                    </div>
                  );
                } else {
                  const item = row.data;
                  return (
                    <div key={`m-${idx}`} className="border-t border-dark-200 bg-dark-300 p-3 first:border-t-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-bnb-muted">Lightning Swap</p>
                        <div className="flex items-center gap-2">
                          <Globe size={13} className="text-bnb-muted" />
                          {item.enabled ? <CheckCircle size={14} className="text-bnb-green" /> : <XCircle size={14} className="text-bnb-red" />}
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <p className="text-xs text-bnb-muted">수수료</p>
                          <p className="font-semibold text-brand-500">{formatLightningFee(item)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-bnb-muted">한도</p>
                          <p className="text-bnb-text text-xs">
                            {item.min_amount_sat != null ? `${formatNumber(item.min_amount_sat, 0)}~` : ''}
                            {item.max_amount_sat != null ? `${formatNumber(item.max_amount_sat, 0)} sats` : '-'}
                          </p>
                        </div>
                      </div>
                      {item.error_message && <p className="mt-1 text-xs text-bnb-red">{item.error_message}</p>}
                    </div>
                  );
                }
              })}
            </div>

            {/* PC: 테이블 */}
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-dark-200 bg-dark-400/50">
                  <tr>
                    <th className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-bnb-muted">네트워크</th>
                    <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-bnb-muted">수수료</th>
                    <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-bnb-muted">USD</th>
                    <th className="px-4 py-2 text-center text-xs font-medium uppercase tracking-wide text-bnb-muted">출처</th>
                    <th className="px-4 py-2 text-center text-xs font-medium uppercase tracking-wide text-bnb-muted">상태</th>
                  </tr>
                </thead>
                <tbody className="bg-dark-300">
                  {group.rows.map((row, idx) => {
                    if (row.kind === 'withdrawal') {
                      const item = row.data;
                      return (
                        <tr key={idx} className="border-t border-dark-200 hover:bg-dark-400 transition-colors">
                          <td className="px-4 py-2 text-bnb-muted">
                            {item.coin} · {item.network_label}
                            {item.source_url && (
                              <a href={item.source_url} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center text-brand-400 hover:text-brand-300">
                                <Globe size={11} />
                              </a>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right font-semibold text-brand-500">{formatWithdrawalFee(item)}</td>
                          <td className="px-4 py-2 text-right text-bnb-muted">{item.fee_usd != null ? `$${item.fee_usd}` : '-'}</td>
                          <td className="px-4 py-2 text-center"><SourceIcon source={item.source} /></td>
                          <td className="px-4 py-2 text-center">
                            {item.enabled ? <CheckCircle size={13} className="mx-auto text-bnb-green" /> : <XCircle size={13} className="mx-auto text-bnb-red" />}
                          </td>
                        </tr>
                      );
                    } else {
                      const item = row.data;
                      return (
                        <tr key={idx} className="border-t border-dark-200 hover:bg-dark-400 transition-colors">
                          <td className="px-4 py-2 text-bnb-muted">
                            Lightning Swap
                            {item.source_url && (
                              <a href={item.source_url} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center text-brand-400 hover:text-brand-300">
                                <Globe size={11} />
                              </a>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right font-semibold text-brand-500">{formatLightningFee(item)}</td>
                          <td className="px-4 py-2 text-right text-bnb-muted">
                            {item.min_amount_sat != null || item.max_amount_sat != null
                              ? `${item.min_amount_sat != null ? formatNumber(item.min_amount_sat, 0) : '0'}~${item.max_amount_sat != null ? formatNumber(item.max_amount_sat, 0) : '∞'} sats`
                              : '-'}
                          </td>
                          <td className="px-4 py-2 text-center"><Globe size={13} className="mx-auto text-bnb-muted" /></td>
                          <td className="px-4 py-2 text-center">
                            {item.enabled ? <CheckCircle size={13} className="mx-auto text-bnb-green" /> : <XCircle size={13} className="mx-auto text-bnb-red" />}
                          </td>
                        </tr>
                      );
                    }
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        {filteredGroups.length === 0 && (
          <p className="py-8 text-center text-sm text-bnb-muted">'{nameFilter}'에 해당하는 노드가 없습니다.</p>
        )}
      </div>
    </div>
  );
}
