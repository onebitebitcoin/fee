import { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, CaretDown, Lightning, Wallet } from '@phosphor-icons/react';
import { fmtEx } from '../../../lib/exchangeNames';
import { formatFeeKrw, formatPercent } from '../../../lib/formatBtc';
import { SPRING_FAST, SPRING_SLOW } from '../constants';
import { ExFavicon } from '../ui';
import { useExplorer } from '../ExplorerContext';

const MEDALS = ['🥇', '🥈', '🥉'];
const PAGE_SIZE = 10;

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
        {visible.map((p, i) => {
          const isUsdt = p.transfer_coin === 'USDT';
          const isViaGlobal = p.route_variant?.endsWith('via_global') ?? false;
          const isLightning = p.path_type === 'lightning_exit';
          const medal = MEDALS[i] ?? null;

          return (
            <motion.div
              key={`${p.korean_exchange}|${p.route_variant ?? ''}|${p._g}|${p.network}|${p.path_type ?? ''}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...SPRING_SLOW, delay: Math.min(i, 4) * 0.04 }}
              className="ios-card rounded-2xl px-4 py-3.5"
            >
              <div className="flex items-center justify-between gap-3">
                {/* Rank */}
                <div className="flex-shrink-0 w-7 text-center">
                  {medal
                    ? <span className="text-lg leading-none">{medal}</span>
                    : <span className="text-xs font-semibold text-label-tertiary">{i + 1}</span>
                  }
                </div>

                {/* Route */}
                <div className="flex items-center gap-1.5 flex-wrap min-w-0 flex-1">
                  <ExFavicon id={p.korean_exchange} size={18} />
                  <span className="text-xs font-semibold text-label-primary">{fmtEx(p.korean_exchange)}</span>

                  <ArrowRight className="w-3 h-3 text-label-quaternary flex-shrink-0" />
                  <span className="text-[11px] text-label-tertiary">{p.transfer_coin}</span>

                  {(isUsdt || isViaGlobal) && (
                    <>
                      <ArrowRight className="w-3 h-3 text-label-quaternary flex-shrink-0" />
                      <ExFavicon id={p._g} size={16} />
                      <span className="text-[11px] text-label-secondary font-medium">{fmtEx(p._g)}</span>
                    </>
                  )}

                  <ArrowRight className="w-3 h-3 text-label-quaternary flex-shrink-0" />
                  {isLightning ? (
                    <span className="flex items-center gap-0.5 text-[11px] text-acc-amber font-medium">
                      <Lightning className="w-3 h-3" weight="fill" /> LN
                    </span>
                  ) : (
                    <span className="text-[11px] text-label-tertiary">{p.network}</span>
                  )}

                  <ArrowRight className="w-3 h-3 text-label-quaternary flex-shrink-0" />
                  <div className="w-4 h-4 rounded-md bg-acc-green/15 flex items-center justify-center flex-shrink-0">
                    <Wallet weight="fill" className="w-2.5 h-2.5 text-acc-green" />
                  </div>
                </div>

                {/* Fee */}
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-bold text-acc-red num">-{formatFeeKrw(p.total_fee_krw)}</p>
                  <p className="text-[10px] text-label-tertiary num">{formatPercent(p.fee_pct)}</p>
                </div>
              </div>

              {/* Bottom row: tags + 자세히 보기 */}
              <div className="flex items-center justify-between mt-2.5 ml-7">
                <div className="flex items-center gap-1.5">
                  {isLightning && (
                    <span className="text-[10px] font-semibold bg-acc-blue/10 text-acc-blue px-1.5 py-0.5 rounded-full">
                      라이트닝 출금
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleSelectRecommendedPath(p)}
                  className="text-[11px] font-semibold text-acc-amber flex items-center gap-0.5 hover:opacity-70 transition-opacity cursor-pointer"
                >
                  자세히 보기 <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </motion.div>
          );
        })}
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
