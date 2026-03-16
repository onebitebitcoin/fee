import { AlertTriangle, Building2, CheckCircle, ChevronDown, ChevronUp, ExternalLink, Globe, Megaphone, Search, Server, XCircle, Zap } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { PageErrorMessage } from '../components/PageErrorMessage';
import { KycBadge } from '../components/KycBadge';
import { PageSkeletonBlocks } from '../components/PageSkeletonBlocks';
import { StatusBadge } from '../components/StatusBadge';
import { useAsyncData } from '../hooks/useAsyncData';
import { api } from '../lib/api';
import { fmtEx } from '../lib/exchangeNames';
import { formatTs } from '../lib/formatTs';
import { localizeUiLabel } from '../lib/localizeUi';
import type { ExchangeNoticeItem, ExchangeStatusNode, ExchangeStatusWithdrawalRow, SuspendedNetwork } from '../types';

const DOMESTIC_EXCHANGES = new Set(['upbit', 'bithumb', 'coinone', 'korbit', 'gopax']);

const SATS_PER_BTC = 100_000_000;

function formatNumber(value: number, maximumFractionDigits = 8) {
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits }).format(value);
}

function formatFee(row: ExchangeStatusWithdrawalRow): string {
  // 라이트닝 스왑 행
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
      <div className="divide-y divide-dark-200">
        {visible.map((row, idx) => (
          <div key={idx} className="px-4 py-2.5 hover:bg-dark-400 transition-colors">
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <SourceIcon source={row.source} />
                {row.enabled ? (
                  <CheckCircle size={11} className="text-bnb-green shrink-0" />
                ) : (
                  <XCircle size={11} className="text-bnb-red shrink-0" />
                )}
                <span className="min-w-0 break-all text-sm text-bnb-muted">
                  {row.coin} · {localizeUiLabel(row.network_label)}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 sm:shrink-0">
                <span className="font-data text-sm font-semibold text-brand-400">{formatFee(row)}</span>
                <span className="font-data text-xs text-bnb-muted">{formatFeeKrw(row)}</span>
              </div>
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

function NodeLogo({ exchange, type }: { exchange: string; type: 'exchange' | 'lightning' }) {
  const [imgError, setImgError] = useState(false);
  const logoName = exchange.toLowerCase().replace(/\s+/g, '');

  if (!imgError) {
    return (
      <img
        src={`/logos/${logoName}.png`}
        alt={exchange}
        width={24}
        height={24}
        className="h-6 w-6 rounded shrink-0"
        onError={() => setImgError(true)}
      />
    );
  }

  if (type === 'lightning') {
    return <Zap size={14} className="text-brand-400 shrink-0" />;
  }
  return <Building2 size={14} className="text-bnb-muted shrink-0" />;
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
    <div className="border border-dark-200 bg-dark-300 transition-colors hover:border-dark-100">
      {/* 노드 헤더 */}
      <div className="flex flex-col gap-1.5 border-b border-dark-200 bg-dark-400 px-4 py-3">
        {/* 1행: 로고 + 이름 + 상태 */}
        <div className="flex items-center gap-2">
          <NodeLogo exchange={node.exchange} type={node.type} />
          <span className="min-w-0 flex-1 truncate font-semibold text-bnb-text">{label}</span>
          <div className="flex shrink-0 items-center gap-2">
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
        {/* 2행: 속성 태그 */}
        {(node.type === 'lightning' || node.kyc_status) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {node.type === 'lightning' && (
              <span className="inline-flex items-center gap-1 border border-brand-500/40 bg-brand-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-400">
                <Zap size={9} />
                LN
              </span>
            )}
            {node.direction === 'onchain_to_ln' && (
              <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold border border-dark-100 text-bnb-muted">
                온체인 → LN
              </span>
            )}
            {node.direction === 'ln_to_onchain' && (
              <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold border border-dark-100 text-bnb-muted">
                LN → 온체인
              </span>
            )}
            <KycBadge status={node.kyc_status} />
          </div>
        )}
      </div>

      {/* 점검 중인 네트워크 */}
      {hasNetworkIssues && (
        <div className="border-b border-dark-200 px-4 py-2 space-y-1">
          {node.network_status.suspended_networks.map((sn: SuspendedNetwork, idx: number) => (
            <div key={idx} className="flex items-start gap-2 text-xs text-bnb-red">
              <XCircle size={12} className="mt-0.5 shrink-0" />
              <span>{sn.coin} / {localizeUiLabel(sn.network)}: {sn.reason ?? sn.status}</span>
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
                  {notice.published_at && (
                    <p className="mt-0.5 text-[10px] text-bnb-muted">{formatTs(notice.published_at)}</p>
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

  const loadNotices = useCallback(async () => api.getLatestNotices(), []);
  const { data: noticesData } = useAsyncData(loadNotices, { initialData: { items: [] } });

  const { domestic, global: globalExchanges } = useMemo(() => {
    const domestic: typeof data.exchanges = [];
    const global: typeof data.exchanges = [];
    for (const node of data.exchanges) {
      if (DOMESTIC_EXCHANGES.has(node.exchange.toLowerCase())) {
        domestic.push(node);
      } else {
        global.push(node);
      }
    }
    return { domestic, global };
  }, [data]);

  const filterNodes = useCallback(
    (nodes: ExchangeStatusNode[]) => {
      if (!nameFilter.trim()) return nodes;
      const q = nameFilter.toLowerCase();
      return nodes.filter(node => {
        const label = node.type === 'exchange' ? fmtEx(node.exchange) : node.exchange;
        return label.toLowerCase().includes(q) || node.exchange.toLowerCase().includes(q);
      });
    },
    [nameFilter],
  );

  const filteredDomestic = useMemo(() => filterNodes(domestic), [domestic, filterNodes]);
  const filteredGlobal = useMemo(() => filterNodes(globalExchanges), [globalExchanges, filterNodes]);
  const filteredLightning = useMemo(() => filterNodes(data.lightning_services), [data.lightning_services, filterNodes]);

  const totalCount = filteredDomestic.length + filteredGlobal.length + filteredLightning.length;

  if (error) return <PageErrorMessage message={error} />;
  if (loading) return <PageSkeletonBlocks blocks={4} className="h-40 bg-dark-300" containerClassName="grid gap-4 md:grid-cols-2" />;

  return (
    <div className="space-y-6">
      {/* 최신 공지사항 */}
      {noticesData.items.length > 0 && (
        <section className="border border-dark-200 bg-dark-300">
          <div className="flex items-center gap-2 border-b border-dark-200 bg-dark-400 px-4 py-3">
            <Megaphone size={14} className="text-brand-400 shrink-0" />
            <h3 className="text-sm font-semibold text-bnb-text">최신 공지사항</h3>
            <span className="ml-auto font-data text-xs text-bnb-muted">{noticesData.items.length}건</span>
          </div>
          <ul className="divide-y divide-dark-200">
            {noticesData.items.map((notice: ExchangeNoticeItem, idx: number) => (
              <li key={idx} className="flex items-center gap-2 px-4 py-2.5">
                <span className="shrink-0 rounded bg-dark-400 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-bnb-muted">
                  {fmtEx(notice.exchange)}
                </span>
                {notice.url ? (
                  <a
                    href={notice.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-w-0 flex-1 items-center gap-1 text-xs text-brand-400 hover:underline"
                  >
                    <ExternalLink size={10} className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{notice.title}</span>
                  </a>
                ) : (
                  <span className="min-w-0 flex-1 truncate text-xs text-bnb-text">{notice.title}</span>
                )}
                {(notice.published_at ?? notice.noticed_at) && (
                  <span className="shrink-0 text-[10px] text-bnb-muted">
                    {formatTs(notice.published_at ?? notice.noticed_at!)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="section-label">거래소 · 네트워크</p>
          <h2 className="mt-1 text-xl font-bold text-bnb-text font-display">현황</h2>
        </div>
        <span className="font-data text-xs text-bnb-muted">{totalCount}개 노드</span>
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-bnb-muted pointer-events-none" />
        <input
          type="text"
          value={nameFilter}
          onChange={e => setNameFilter(e.target.value)}
          placeholder="거래소 / 서비스 이름 필터..."
          className="w-full border border-dark-200 bg-dark-400 pl-9 pr-3 py-2 text-sm text-bnb-text placeholder-bnb-muted focus:border-brand-400/50 focus:outline-none sm:w-72 transition-colors"
        />
      </div>

      {filteredDomestic.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <h3 className="section-label">국내 거래소</h3>
            <span className="rounded-full bg-dark-200 px-2 py-0.5 text-[10px] font-data text-bnb-muted">
              {filteredDomestic.length}
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {filteredDomestic.map(node => (
              <NodeCard key={`exchange-${node.exchange}`} node={node} />
            ))}
          </div>
        </section>
      )}

      {filteredGlobal.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <h3 className="section-label">해외 거래소</h3>
            <span className="rounded-full bg-dark-200 px-2 py-0.5 text-[10px] font-data text-bnb-muted">
              {filteredGlobal.length}
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {filteredGlobal.map(node => (
              <NodeCard key={`exchange-${node.exchange}`} node={node} />
            ))}
          </div>
        </section>
      )}

      {filteredLightning.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <h3 className="section-label">라이트닝 스왑</h3>
            <span className="rounded-full bg-dark-200 px-2 py-0.5 text-[10px] font-data text-bnb-muted">
              {filteredLightning.length}
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {filteredLightning.map(node => (
              <NodeCard key={`lightning-${node.exchange}`} node={node} />
            ))}
          </div>
        </section>
      )}

      {totalCount === 0 && nameFilter && (
        <p className="py-8 text-center text-sm text-bnb-muted">
          '{nameFilter}'에 해당하는 노드가 없습니다.
        </p>
      )}
    </div>
  );
}
