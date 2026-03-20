import { fmtEx } from '../../lib/exchangeNames';
import { formatCurrency, formatPercent, formatSats } from '../../lib/formatBtc';
import { localizeUiLabel } from '../../lib/localizeUi';
import { getFeeTone } from '../../lib/pathUtils';
import type { VisibleRankedPath } from '../../lib/pathUtils';
import type { PathMode } from '../../types';
import { ServiceLabel } from './ServiceLabel';

type Props = {
  filteredPaths: VisibleRankedPath[];
  selectedPathId: string;
  globalExchange: string;
  mode: PathMode;
  carfBlackbox: boolean;
  isCarfAffected: (koreanExchange: string) => boolean;
  onSelectPath: (pathId: string) => void;
  onOpenDetail: (pathId: string) => void;
};

export function PathMobileList({
  filteredPaths,
  selectedPathId,
  mode,
  carfBlackbox,
  isCarfAffected,
  onSelectPath,
  onOpenDetail,
}: Props) {
  return (
    <div className="divide-y divide-dark-200 md:hidden">
      {filteredPaths.map((path) => {
        const isHighlighted = selectedPathId === path.path_id;
        const dimmed = carfBlackbox && isCarfAffected(path.korean_exchange);
        return (
          <article
            key={`mobile-${path.path_id}`}
            className={`space-y-2.5 p-3 ${isHighlighted ? 'bg-brand-500/10' : 'bg-dark-500'} ${dimmed ? 'opacity-30 grayscale pointer-events-none' : ''}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className={`font-mono text-xs ${path.visibleRank === 1 ? 'font-bold text-brand-400' : 'text-bnb-muted'}`}>
                  #{String(path.visibleRank).padStart(3, '0')}
                </span>
                <button
                  type="button"
                  onClick={() => onSelectPath(path.path_id)}
                  className="min-w-0 text-left text-sm font-semibold text-bnb-text"
                  aria-label={`${fmtEx(path.korean_exchange)} 경로 선택`}
                >
                  <ServiceLabel
                    name={path.korean_exchange}
                    label={fmtEx(path.korean_exchange)}
                    variant="exchange"
                    textClassName="text-sm font-semibold text-bnb-text"
                    logoClassName="h-5 w-5"
                  />
                </button>
              </div>
              <p className="shrink-0 text-sm font-semibold text-brand-400">{formatCurrency(path.total_fee_krw)}</p>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-bnb-muted">
              <p className="col-span-2">{path.transfer_coin} · {localizeUiLabel(path.domestic_withdrawal_network)}</p>
              <p>{mode === 'sell' ? 'KRW 수령' : '수령'} <span className="text-bnb-text">{mode === 'sell' ? formatCurrency(path.krw_received ?? 0) : formatSats(path.btc_received ?? 0)}</span></p>
              <p>수수료율 <span className={getFeeTone(path.fee_pct)}>{formatPercent(path.fee_pct)}</span></p>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => onOpenDetail(path.path_id)}
                className="inline-flex items-center justify-center border border-brand-500/40 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-400 transition-colors hover:bg-brand-500/10"
                aria-label={`${fmtEx(path.korean_exchange)} 경로 상세 열기`}
              >
                경로 상세
              </button>
            </div>
          </article>
        );
      })}
      {filteredPaths.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-bnb-muted">필터 조건에 해당하는 경로가 없습니다.</div>
      ) : null}
    </div>
  );
}
