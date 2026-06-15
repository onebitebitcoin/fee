import { useState } from 'react';
import { motion } from 'motion/react';
import { CaretDown } from '@phosphor-icons/react';
import { fmtEx } from '../../../lib/exchangeNames';
import { formatFeeKrw, formatPercent } from '../../../lib/formatBtc';
import { SPRING_FAST, SPRING_SLOW } from '../constants';
import { useExplorer } from '../ExplorerContext';
import type { CheapestPathEntry } from '../../../types';

const PAGE_SIZE = 15;

function routeText(p: CheapestPathEntry & { _g: string }): string {
  const isUsdt = p.transfer_coin === 'USDT';
  const isViaGlobal = p.route_variant?.endsWith('via_global') ?? false;
  const isLightning = p.path_type === 'lightning_exit';

  const parts: string[] = [fmtEx(p.korean_exchange)];
  if (isUsdt || isViaGlobal) parts.push(fmtEx(p._g));

  if (isLightning) {
    const provider = p.lightning_exit_provider;
    const svcName = provider && provider !== '__direct__' ? fmtEx(provider) : null;
    parts.push(svcName ? `LN via ${svcName}` : 'Lightning');
  } else {
    parts.push(p.network ?? '');
  }

  return parts.join(' › ');
}

export function RecommendationStep() {
  const {
    amountKrw, topRecommendedPaths, handleSelectRecommendedPath, handleBack,
  } = useExplorer();

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const visible = topRecommendedPaths.slice(0, visibleCount);
  const hasMore = topRecommendedPaths.length > visibleCount;

  return (
    <>
      <div>
        <p className="text-xs text-label-tertiary uppercase tracking-wider mb-1">
          ₩{amountKrw.toLocaleString('ko-KR')} 기준
        </p>
        <h1 className="text-2xl font-bold text-label-primary tracking-tight">추천 경로</h1>
        <p className="text-sm text-label-secondary mt-1">수수료가 가장 낮은 경로 순으로 보여드려요</p>
      </div>

      {/* Table */}
      <div className="ios-card rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[28px_1fr_auto] gap-x-3 px-4 py-2 border-b border-white/6">
          <span className="text-[10px] font-semibold text-label-quaternary uppercase tracking-wider">#</span>
          <span className="text-[10px] font-semibold text-label-quaternary uppercase tracking-wider">경로</span>
          <span className="text-[10px] font-semibold text-label-quaternary uppercase tracking-wider text-right">수수료</span>
        </div>

        {/* Rows */}
        <div>
          {visible.map((p, i) => {
            const isLightning = p.path_type === 'lightning_exit';
            return (
              <motion.button
                key={`${p.korean_exchange}|${p.route_variant ?? ''}|${p._g}|${p.network}|${p.path_type ?? ''}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ ...SPRING_SLOW, delay: Math.min(i, 6) * 0.03 }}
                onClick={() => handleSelectRecommendedPath(p)}
                className={[
                  'w-full grid grid-cols-[28px_1fr_auto] gap-x-3 px-4 py-3 text-left transition-colors',
                  'hover:bg-white/4 active:bg-white/6',
                  i < visible.length - 1 ? 'border-b border-white/4' : '',
                ].join(' ')}
              >
                {/* Rank */}
                <span className={[
                  'text-xs font-bold self-center',
                  i === 0 ? 'text-acc-amber' : i === 1 ? 'text-label-secondary' : i === 2 ? 'text-label-tertiary' : 'text-label-quaternary',
                ].join(' ')}>
                  {i + 1}
                </span>

                {/* Route — 넘치면 가로 스크롤 */}
                <div className="min-w-0 self-center overflow-x-auto scrollbar-none">
                  <p className="text-[12px] font-medium text-label-primary whitespace-nowrap">
                    {routeText(p)}
                  </p>
                </div>

                {/* Fee */}
                <div className="text-right self-center flex-shrink-0">
                  <p className="text-[12px] font-bold text-acc-red num">-{formatFeeKrw(p.total_fee_krw)}</p>
                  <p className="text-[10px] text-label-tertiary num">{formatPercent(p.fee_pct)}</p>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      {topRecommendedPaths.length === 0 && (
        <div className="ios-card rounded-2xl p-6 text-center">
          <p className="text-sm text-label-secondary">추천 경로를 불러오지 못했어요</p>
        </div>
      )}

      {hasMore && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={SPRING_FAST}
          onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
          className="w-full py-3 rounded-2xl text-sm font-semibold text-label-secondary bg-fill-secondary border border-white/8 flex items-center justify-center gap-1.5 hover:bg-fill-primary transition-colors cursor-pointer"
        >
          더보기 <CaretDown className="w-3.5 h-3.5" />
          <span className="text-label-tertiary text-xs">({topRecommendedPaths.length - visibleCount}개 남음)</span>
        </motion.button>
      )}

      <button onClick={handleBack} className="w-full py-2 text-sm text-label-tertiary hover:text-label-secondary transition-colors">
        처음으로
      </button>
    </>
  );
}
