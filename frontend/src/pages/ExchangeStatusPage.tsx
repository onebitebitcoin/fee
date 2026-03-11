import { AlertTriangle, Building2, CheckCircle, ChevronDown, ChevronUp, ExternalLink, Globe, Megaphone, Server, XCircle, Zap } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { PageErrorMessage } from '../components/PageErrorMessage';
import { PageSkeletonBlocks } from '../components/PageSkeletonBlocks';
import { StatusBadge } from '../components/StatusBadge';
import { useAsyncData } from '../hooks/useAsyncData';
import { api } from '../lib/api';
import { fmtEx } from '../lib/exchangeNames';
import type { ExchangeStatusNode, ExchangeStatusWithdrawalRow, SuspendedNetwork } from '../types';

const SATS_PER_BTC = 100_000_000;

function formatNumber(value: number, maximumFractionDigits = 8) {
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits }).format(value);
}

function formatFee(row: ExchangeStatusWithdrawalRow): string {
  // Lightning swap row
  if (row.fee_pct != null || row.fee_fixed_sat != null) {
    const parts: string[] = [];
    if (row.fee_pct != null) parts.push(`${row.fee_pct}%`);
    if (row.fee_fixed_sat != null) parts.push(`+${formatNumber(row.fee_fixed_sat, 0)} sats`);
    return parts.join(' ') || '-';
  }
  if (row.fee == null) return '-';
  if (row.coin.toUpperCase() === 'BTC') {
    return `${formatNumber(Math.round(row.fee * SATS_PER_BTC), 0)} sats`;
  }
  return formatNumber(row.fee);
}

function formatFeeKrw(row: ExchangeStatusWithdrawalRow): string {
  if (row.fee_krw == null) return '-';
  return `₩${formatNumber(Math.round(row.fee_krw), 0)}`;
}

function SourceIcon({ source }: { source: string }) {
  if (source === 'realtime_api') return <Server size={13} className="text-bnb-green" />;
  return <Globe size={13} className="text-bnb-muted" />;
}

type NetworkRowsProps = {
  rows: ExchangeStatusWithdrawalRow[];
};

function NetworkRows({ rows }: NetworkRowsProps) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.slice(0, 3);
  const hasMore = rows.length > 3;

  return (
    <div>
      <div className="space-y-0">
        {visible.map((row, idx) => (
          <div key={idx} className="flex items-center justify-between border-t border-dark-200 px-4 py-2 first:border-t-0 hover:bg-dark-400 transition-colors">
            <div className="flex items-center gap-2 min-w-0">
              <SourceIcon source={row.source} />
              {row.enabled ? (
                <CheckCircle size={12} className="text-bnb-green shrink-0" />
              ) : (
                <XCircle size={12} className="text-bnb-red shrink-0" />
              )}
              <span className="text-sm text-bnb-muted truncate">
                {row.coin} · {row.network_label}
              </span>
            </div>
            <div className="flex items-center gap-3 shrink-0 ml-2">
              <span className="text-sm font-semibold text-brand-500">{formatFee(row)}</span>
              <span className="text-xs text-bnb-muted">{formatFeeKrw(row)}</span>
            </div>
          </div>
        ))}
      </div>
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center justify-center gap-1 border-t border-dark-200 py-2 text-xs text-bnb-muted hover:text-bnb-text transition-colors"
        >
          {expanded ? (
            <><ChevronUp size={12} />접기</>
          ) : (
            <><ChevronDown size={12} />{rows.length - 3}개 더 보기</>
          )}
        </button>
      )}
    </div>
  );
}

type NodeCardProps = {
  node: ExchangeStatusNode;
};

function NodeCard({ node }: NodeCardProps) {
  const [noticesOpen, setNoticesOpen] = useState(false);
  const label = node.type === 'exchange' ? fmtEx(node.exchange) : node.exchange;
  const hasNetworkIssues = node.network_status.suspended_networks.length > 0;
  const overallStatus = hasNetworkIssues ? 'error' : node.network_status.status;

  return (
    <div className="border border-dark-200 bg-dark-300">
      {/* 노드 헤더 */}
      <div className="flex items-center gap-2 border-b border-dark-200 bg-dark-400 px-4 py-3">
        {node.type === 'lightning' ? (
          <Zap size={14} className="text-brand-400 shrink-0" />
        ) : (
          <Building2 size={14} className="text-bnb-muted shrink-0" />
        )}
        <span className="font-semibold text-bnb-text">{label}</span>
        {node.type === 'lightning' && (
          <span className="rounded bg-brand-400/20 px-1.5 py-0.5 text-xs text-brand-400">LN</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <StatusBadge status={overallStatus} />
          {node.scrape_status && (
            <a
              href={node.scrape_status.url}
              target="_blank"
              rel="noopener noreferrer"
              title={node.scrape_status.status === 'error' ? node.scrape_status.error_message ?? '스크래핑 오류' : '스크래핑 페이지'}
              className="flex items-center gap-1 text-xs text-bnb-muted hover:text-brand-400 transition-colors"
            >
              {node.scrape_status.status === 'error' ? (
                <AlertTriangle size={12} className="text-bnb-red" />
              ) : (
                <ExternalLink size={12} />
              )}
            </a>
          )}
        </div>
      </div>

      {/* 점검 중인 네트워크 */}
      {hasNetworkIssues && (
        <div className="border-b border-dark-200 px-4 py-2 space-y-1">
          {node.network_status.suspended_networks.map((sn: SuspendedNetwork, idx: number) => (
            <div key={idx} className="flex items-start gap-2 text-xs text-bnb-red">
              <XCircle size={12} className="mt-0.5 shrink-0" />
              <span>{sn.coin} / {sn.network}: {sn.reason ?? sn.status}</span>
            </div>
          ))}
        </div>
      )}

      {/* 출금 네트워크 목록 */}
      {node.withdrawal_rows.length > 0 ? (
        <NetworkRows rows={node.withdrawal_rows} />
      ) : (
        <p className="px-4 py-3 text-sm text-bnb-muted">출금 수수료 데이터 없음</p>
      )}

      {/* 공지사항 */}
      {node.notices.length > 0 && (
        <div className="border-t border-dark-200">
          <button
            onClick={() => setNoticesOpen(!noticesOpen)}
            className="flex w-full items-center gap-2 px-4 py-2 text-xs text-bnb-muted hover:text-bnb-text transition-colors"
          >
            <Megaphone size={12} />
            <span>최신 공지 {node.notices.length}건</span>
            <span className="ml-auto">{noticesOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</span>
          </button>
          {noticesOpen && (
            <ul className="border-t border-dark-200 divide-y divide-dark-200">
              {node.notices.map((notice, idx) => (
                <li key={idx} className="px-4 py-2">
                  {notice.url ? (
                    <a
                      href={notice.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-1.5 text-xs text-brand-400 hover:underline"
                    >
                      <ExternalLink size={10} className="mt-0.5 shrink-0" />
                      <span>{notice.title}</span>
                    </a>
                  ) : (
                    <p className="text-xs text-bnb-text">{notice.title}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function ExchangeStatusPage() {
  const [nameFilter, setNameFilter] = useState('');

  const loadData = useCallback(async () => {
    return api.getExchangeStatus();
  }, []);

  const { data, error, loading } = useAsyncData(loadData, {
    initialData: { exchanges: [], lightning_services: [] },
  });

  const allNodes = useMemo(() => {
    return [...data.exchanges, ...data.lightning_services];
  }, [data]);

  const filteredNodes = useMemo(() => {
    if (!nameFilter.trim()) return allNodes;
    const q = nameFilter.toLowerCase();
    return allNodes.filter(node => {
      const label = node.type === 'exchange' ? fmtEx(node.exchange) : node.exchange;
      return label.toLowerCase().includes(q) || node.exchange.toLowerCase().includes(q);
    });
  }, [allNodes, nameFilter]);

  if (error) return <PageErrorMessage message={error} />;
  if (loading) return <PageSkeletonBlocks blocks={4} className="h-40 bg-dark-300" containerClassName="grid gap-4 md:grid-cols-2" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-bnb-text">거래소 현황</h2>
        <span className="text-sm text-bnb-muted">{filteredNodes.length}개 노드</span>
      </div>

      <input
        type="text"
        value={nameFilter}
        onChange={e => setNameFilter(e.target.value)}
        placeholder="거래소 / 서비스 이름 필터..."
        className="w-full border border-dark-200 bg-dark-400 px-3 py-2 text-sm text-bnb-text placeholder-bnb-muted focus:border-brand-400 focus:outline-none sm:w-64"
      />

      <div className="grid gap-4 md:grid-cols-2">
        {filteredNodes.map(node => (
          <NodeCard key={`${node.type}-${node.exchange}`} node={node} />
        ))}
        {filteredNodes.length === 0 && (
          <p className="col-span-2 py-8 text-center text-sm text-bnb-muted">
            '{nameFilter}'에 해당하는 노드가 없습니다.
          </p>
        )}
      </div>
    </div>
  );
}
