import { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, CaretDown } from '@phosphor-icons/react';
import { fmtEx } from '../../../lib/exchangeNames';
import { formatFeeKrw, formatPercent } from '../../../lib/formatBtc';
import { SPRING_FAST, SPRING_SLOW } from '../constants';
import { useExplorer } from '../ExplorerContext';
import type { CheapestPathEntry } from '../../../types';

const PAGE_SIZE = 10;

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="w-6 h-6 rounded-full bg-acc-amber/20 flex items-center justify-center flex-shrink-0">
        <span className="text-[11px] font-bold text-acc-amber">1</span>
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className="w-6 h-6 rounded-full bg-fill-tertiary flex items-center justify-center flex-shrink-0">
        <span className="text-[11px] font-bold text-label-secondary">2</span>
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className="w-6 h-6 rounded-full bg-fill-tertiary flex items-center justify-center flex-shrink-0">
        <span className="text-[11px] font-bold text-label-tertiary">3</span>
      </div>
    );
  }
  return (
    <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
      <span className="text-[11px] text-label-quaternary">{rank}</span>
    </div>
  );
}

function RouteText({ p }: { p: CheapestPathEntry & { _g: string } }) {
  const isUsdt = p.transfer_coin === 'USDT';
  const isViaGlobal = p.route_variant?.endsWith('via_global') ?? false;
  const isLightning = p.path_type === 'lightning_exit';

  const networkLabel = isLightning ? 'Lightning' : (p.network ?? '');

  const sep = <span className="text-label-quaternary mx-0.5">›</span>;

  return (
    <p className="text-[12px] text-label-secondary leading-relaxed">
      <span className="font-semibold text-label-primary">{fmtEx(p.korean_exchange)}</span>
      {sep}
      <span>{p.transfer_coin}</span>
      {(isUsdt || isViaGlobal) && (
        <>
          {sep}
          <span className="font-medium text-label-primary">{fmtEx(p._g)}</span>
        </>
      )}
      {sep}
      <span className={isLightning ? 'text-acc-amber font-medium' : ''}>{networkLabel}</span>
      {sep}
      <span className="text-label-tertiary">내 지갑</span>
    </p>
  );
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

      <div className="space-y-2">
        {visible.map((p, i) => (
          <motion.div
            key={`${p.korean_exchange}|${p.route_variant ?? ''}|${p._g}|${p.network}|${p.path_type ?? ''}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING_SLOW, delay: Math.min(i, 4) * 0.04 }}
            className="ios-card rounded-2xl px-4 py-3.5"
          >
            <div className="flex items-start gap-3">
              <RankBadge rank={i + 1} />

              <div className="flex-1 min-w-0">
                <RouteText p={p} />
              </div>

              <div className="text-right flex-shrink-0">
                <p className="text-xs font-bold text-acc-red num">-{formatFeeKrw(p.total_fee_krw)}</p>
                <p className="text-[10px] text-label-tertiary num">{formatPercent(p.fee_pct)}</p>
              </div>
            </div>

            <div className="flex justify-end mt-2">
              <button
                onClick={() => handleSelectRecommendedPath(p)}
                className="text-[11px] font-semibold text-acc-amber flex items-center gap-0.5 hover:opacity-70 transition-opacity cursor-pointer"
              >
                자세히 보기 <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </motion.div>
        ))}
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
