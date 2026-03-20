import { ArrowRight, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { fmtEx } from '../../lib/exchangeNames';
import type { PathMode } from '../../types';
import type { RankedPath } from '../../lib/pathUtils';
import { PathTimeline } from './PathTimeline';
import { ServiceLabel } from './ServiceLabel';

export function RouteDetailPopup({
  selectedRoute,
  globalExchange,
  mode,
  onClose,
}: {
  selectedRoute: { rank: number; path: RankedPath };
  globalExchange: string;
  mode: PathMode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const keyHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center sm:p-4">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="경로 상세 팝업"
        className="max-h-[85vh] w-full max-w-md overflow-y-auto border border-dark-200 bg-dark-400 shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-dark-200 px-4 py-3 sm:px-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-bnb-muted">경로 상세</p>
            <p className="mt-1 text-sm font-semibold text-bnb-text">{fmtEx(selectedRoute.path.korean_exchange)}</p>
          </div>
          <button type="button" onClick={onClose} className="text-bnb-muted hover:text-bnb-text">
            <X size={15} />
          </button>
        </div>
        <div className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="border border-dark-200 bg-dark-500 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-bnb-muted">
              {selectedRoute.rank}위
            </span>
            <ServiceLabel
              name={selectedRoute.path.korean_exchange}
              label={fmtEx(selectedRoute.path.korean_exchange)}
              variant="exchange"
              textClassName="text-base font-semibold text-bnb-text"
              logoClassName="h-6 w-6"
            />
            <ArrowRight size={14} className="text-bnb-muted" />
            <ServiceLabel
              name={globalExchange}
              label={fmtEx(globalExchange)}
              variant="exchange"
              textClassName="text-base font-semibold text-bnb-text"
              logoClassName="h-6 w-6"
            />
          </div>

          <PathTimeline path={selectedRoute.path} globalExchange={globalExchange} mode={mode} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
