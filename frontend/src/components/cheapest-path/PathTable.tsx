import { ArrowRight, ChevronDown, ChevronsDown, Zap } from 'lucide-react';
import { Fragment, useEffect, useState } from 'react';

import { fmtEx } from '../../lib/exchangeNames';
import { formatCurrency, formatPercent, formatSats } from '../../lib/formatBtc';
import { localizeUiLabel } from '../../lib/localizeUi';
import { getFeeTone } from '../../lib/pathUtils';
import type { VisibleRankedPath } from '../../lib/pathUtils';
import type { PathMode } from '../../types';
import { PathTimeline } from './PathTimeline';
import { ServiceLabel, ServiceLogo } from './ServiceLabel';

type Props = {
  filteredPaths: VisibleRankedPath[];
  expandedPathId: string;
  globalExchange: string;
  mode: PathMode;
  onToggleExpand: (pathId: string) => void;
};

const PAGE_SIZE = 5;

export function PathTable({
  filteredPaths,
  expandedPathId,
  globalExchange,
  mode,
  onToggleExpand,
}: Props) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filteredPaths.length]);

  const visiblePaths = filteredPaths.slice(0, visibleCount);
  const remaining = filteredPaths.length - visibleCount;

  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-dark-200 bg-dark-400 text-left text-[11px] font-semibold uppercase tracking-[0.28em] text-bnb-muted">
            <th className="px-5 py-3">순위</th>
            <th className="px-5 py-3">출발지</th>
            <th className="px-5 py-3">경유지</th>
            <th className="px-5 py-3 text-right">수수료율</th>
            <th className="px-5 py-3 text-right">{mode === 'sell' ? 'KRW 수령' : '수령 sats'}</th>
            <th className="px-5 py-3 text-right">수수료(KRW)</th>
          </tr>
        </thead>
        <tbody>
          {visiblePaths.map((path) => {
            const isExpanded = expandedPathId === path.path_id;
            return (
              <Fragment key={path.path_id}>
                <tr
                  className={`cursor-pointer border-b border-dark-200 transition-colors ${isExpanded ? 'bg-dark-400' : 'bg-dark-500 hover:bg-dark-400'}`}
                  onClick={() => onToggleExpand(path.path_id)}
                >
                  <td className="px-5 py-3.5">
                    <span className={`font-mono text-xs ${path.visibleRank === 1 ? 'font-bold text-brand-400' : 'text-bnb-muted'}`}>
                      #{String(path.visibleRank).padStart(3, '0')}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <ServiceLabel
                      name={path.korean_exchange}
                      label={fmtEx(path.korean_exchange)}
                      variant="exchange"
                      textClassName={isExpanded ? 'font-semibold text-brand-400' : 'font-semibold text-bnb-text'}
                      logoClassName="h-5 w-5"
                    />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {mode === 'sell' ? (
                        <>
                          <span className="text-xs text-bnb-muted">지갑</span>
                          {path.lightning_exit_provider && (
                            <>
                              <ArrowRight size={10} className="text-dark-100 shrink-0" />
                              <ServiceLogo name={path.lightning_exit_provider} variant="lightning" className="h-4 w-4" />
                            </>
                          )}
                          {(path.route_variant === 'usdt_via_global' || path.route_variant === 'lightning_via_global') && (
                            <>
                              <ArrowRight size={10} className="text-dark-100 shrink-0" />
                              <ServiceLogo name={globalExchange} variant="exchange" className="h-4 w-4" />
                            </>
                          )}
                          <ArrowRight size={10} className="text-dark-100 shrink-0" />
                          <ServiceLogo name={path.korean_exchange} variant="exchange" className="h-4 w-4" />
                        </>
                      ) : (
                        <>
                          <ServiceLogo name={path.korean_exchange} variant="exchange" className="h-4 w-4" />
                          <ArrowRight size={10} className="text-dark-100 shrink-0" />
                          <span className="rounded border border-dark-100 px-1 py-0.5 text-[10px] font-medium text-bnb-muted">{path.transfer_coin}</span>
                          <ArrowRight size={10} className="text-dark-100 shrink-0" />
                          <ServiceLogo name={globalExchange} variant="exchange" className="h-4 w-4" />
                          {path.lightning_exit_provider && (
                            <>
                              <ArrowRight size={10} className="text-dark-100 shrink-0" />
                              <ServiceLogo name={path.lightning_exit_provider} variant="lightning" className="h-4 w-4" />
                            </>
                          )}
                          <ArrowRight size={10} className="text-dark-100 shrink-0" />
                          <span className="text-xs text-bnb-muted">지갑</span>
                        </>
                      )}
                    </div>
                  </td>
                  <td className={`px-5 py-3.5 text-right font-semibold font-data ${getFeeTone(path.fee_pct)}`}>
                    {formatPercent(path.fee_pct)}
                  </td>
                  <td className="px-5 py-3.5 text-right font-medium font-data text-bnb-text">
                    {mode === 'sell' ? formatCurrency(path.krw_received ?? 0) : formatSats(path.btc_received ?? 0)}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="font-semibold font-data text-brand-400">{formatCurrency(path.total_fee_krw)}</span>
                      <ChevronDown size={13} className={`shrink-0 text-bnb-muted transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>
                  </td>
                </tr>
                {isExpanded && (
                  <tr className="border-b border-dark-200 bg-dark-400/60">
                    <td colSpan={6} className="p-4">
                      <div className="space-y-3">
                        <div className="border border-dark-200 bg-dark-500/80 p-3">
                          <PathTimeline path={path} globalExchange={globalExchange} mode={mode} />
                        </div>
                        <div className="grid grid-cols-3 gap-px border border-dark-200 bg-dark-200">
                          <div className="bg-dark-500 p-3">
                            <p className="text-[11px] uppercase tracking-[0.24em] text-bnb-muted">{mode === 'sell' ? '예상 KRW 수령' : '수령 sats'}</p>
                            <p className="mt-1 font-semibold font-data text-bnb-text">{mode === 'sell' ? formatCurrency(path.krw_received ?? 0) : formatSats(path.btc_received ?? 0)}</p>
                          </div>
                          <div className="bg-dark-500 p-3">
                            <p className="text-[11px] uppercase tracking-[0.24em] text-bnb-muted">총 수수료</p>
                            <p className="mt-1 font-semibold font-data text-brand-400">{formatCurrency(path.total_fee_krw)}</p>
                          </div>
                          <div className="bg-dark-500 p-3">
                            <p className="text-[11px] uppercase tracking-[0.24em] text-bnb-muted">코인 / 네트워크</p>
                            <p className="mt-1 text-sm text-bnb-text">{path.transfer_coin} <span className="text-bnb-muted">{localizeUiLabel(path.domestic_withdrawal_network)}</span></p>
                            <p className="text-xs text-bnb-muted">{path.global_exit_mode === 'lightning' ? <><Zap size={10} className="inline mr-0.5" />라이트닝</> : '온체인'} · {localizeUiLabel(path.global_exit_network)}</p>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
          {filteredPaths.length === 0 && (
            <tr>
              <td colSpan={6} className="px-5 py-8 text-center text-sm text-bnb-muted">
                필터 조건에 해당하는 경로가 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {remaining > 0 && (
        <div className="border-t border-dark-200">
          <button
            type="button"
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            className="flex w-full items-center justify-center gap-1.5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-bnb-muted transition-colors hover:bg-dark-400 hover:text-bnb-text"
          >
            <ChevronsDown size={13} />
            더 불러오기 ({remaining}개 남음)
          </button>
        </div>
      )}
    </div>
  );
}
