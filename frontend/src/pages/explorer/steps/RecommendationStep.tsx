import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CaretDown, Funnel, Wrench, X } from '@phosphor-icons/react';
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
  const isDirect = p.lightning_exit_provider === '__direct__';
  const provider = p.lightning_exit_provider;
  const parts: string[] = [fmtEx(p.korean_exchange)];

  if (isUsdt) {
    parts.push('USDT');
    parts.push(p.network ?? '');
    // __direct__: 글로벌 거래소 자체 LN 출금 → "바이낸스 LN"으로 합침
    parts.push(isLightning && isDirect ? fmtEx(p._g) + ' LN' : fmtEx(p._g));
  } else if (isViaGlobal) {
    parts.push('BTC');
    parts.push(isLightning && isDirect ? fmtEx(p._g) + ' LN' : fmtEx(p._g));
    if (!isLightning) parts.push(p.network ?? '');
  } else {
    parts.push('BTC');
    if (!isLightning) parts.push(p.network ?? '');
  }

  if (isLightning && !isDirect) {
    parts.push(provider ? fmtEx(provider) : 'Lightning');
  } else if (isLightning && isDirect && !isViaGlobal && !isUsdt) {
    // 국내 거래소 직접 LN 출금 (글로벌 미경유)
    parts.push(fmtEx(p.korean_exchange) + ' LN');
  }

  parts.push('지갑');
  return parts.join(' › ');
}

function ToggleChip({
  label, active, onClick,
}: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={[
        'flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors cursor-pointer',
        active
          ? 'bg-acc-red/15 text-acc-red'
          : 'bg-fill-secondary text-label-secondary hover:bg-fill-primary',
      ].join(' ')}
    >
      {active && <X className="w-2.5 h-2.5 flex-shrink-0" />}
      {label}
    </button>
  );
}

export function RecommendationStep() {
  const {
    amountKrw,
    allRecommendedPaths,
    topRecommendedPaths,
    handleSelectRecommendedPath,
    handleBack,
    excludeExchanges,       setExcludeExchanges,
    excludeGlobalExchanges, setExcludeGlobalExchanges,
    excludeServices,        setExcludeServices,
    excludeOnchain,         setExcludeOnchain,
    excludeLightning,       setExcludeLightning,
    excludeDisabled,        setExcludeDisabled,
  } = useExplorer();

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [filterOpen, setFilterOpen] = useState(false);

  const visible = topRecommendedPaths.slice(0, visibleCount);
  const hasMore = topRecommendedPaths.length > visibleCount;

  // 필터 옵션: allRecommendedPaths 기준 (필터 전 전체)
  const availableExchanges = useMemo(() =>
    [...new Set(allRecommendedPaths.map(p => p.korean_exchange))].sort(),
    [allRecommendedPaths],
  );
  const availableGlobalExchanges = useMemo(() =>
    [...new Set(allRecommendedPaths
      .filter(p => p.transfer_coin === 'USDT' || (p.route_variant?.endsWith('via_global') ?? false))
      .map(p => p._g))].sort(),
    [allRecommendedPaths],
  );
  const availableServices = useMemo(() =>
    [...new Set(allRecommendedPaths
      .filter(p => p.path_type === 'lightning_exit' && p.lightning_exit_provider && p.lightning_exit_provider !== '__direct__')
      .map(p => p.lightning_exit_provider!))].sort(),
    [allRecommendedPaths],
  );
  const hasLightningPaths = allRecommendedPaths.some(p => p.path_type === 'lightning_exit');
  const hasOnchainPaths   = allRecommendedPaths.some(p => p.path_type !== 'lightning_exit');
  const hasDisabledPaths  = allRecommendedPaths.some(p => p.disabled);

  const activeFilterCount =
    excludeExchanges.size + excludeGlobalExchanges.size + excludeServices.size +
    (excludeOnchain ? 1 : 0) + (excludeLightning ? 1 : 0) + (excludeDisabled ? 1 : 0);

  function toggleExchange(id: string) {
    setExcludeExchanges(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setVisibleCount(PAGE_SIZE);
  }

  function toggleGlobalExchange(id: string) {
    setExcludeGlobalExchanges(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setVisibleCount(PAGE_SIZE);
  }

  function toggleService(id: string) {
    setExcludeServices(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setVisibleCount(PAGE_SIZE);
  }

  function clearFilters() {
    setExcludeExchanges(new Set());
    setExcludeGlobalExchanges(new Set());
    setExcludeServices(new Set());
    setExcludeOnchain(false);
    setExcludeLightning(false);
    setExcludeDisabled(false);
    setVisibleCount(PAGE_SIZE);
  }

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-label-tertiary uppercase tracking-wider mb-1">
            ₩{amountKrw.toLocaleString('ko-KR')} 기준
          </p>
          <h1 className="text-2xl font-bold text-label-primary tracking-tight">추천 경로</h1>
          <p className="text-sm text-label-secondary mt-1">수수료가 가장 낮은 경로 순으로 보여드려요</p>
        </div>
        <button
          onClick={() => setFilterOpen(o => !o)}
          className={[
            'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer mt-1 flex-shrink-0',
            filterOpen || activeFilterCount > 0
              ? 'bg-acc-amber/15 text-acc-amber'
              : 'bg-fill-secondary text-label-secondary hover:bg-fill-primary',
          ].join(' ')}
        >
          <Funnel className="w-3.5 h-3.5" weight={activeFilterCount > 0 ? 'fill' : 'regular'} />
          필터
          {activeFilterCount > 0 && (
            <span className="bg-acc-amber text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Filter panel */}
      <AnimatePresence>
        {filterOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={SPRING_FAST}
            className="overflow-hidden"
          >
            <div className="ios-card rounded-2xl p-4 space-y-4">
              {/* 비활성화 경로 */}
              {hasDisabledPaths && (
                <div>
                  <p className="text-[10px] font-semibold text-label-quaternary uppercase tracking-wider mb-2">비활성화 경로</p>
                  <div className="flex flex-wrap gap-1.5">
                    <ToggleChip label="비활성화 제외" active={excludeDisabled} onClick={() => { setExcludeDisabled((o: boolean) => !o); setVisibleCount(PAGE_SIZE); }} />
                  </div>
                </div>
              )}

              {/* 출금 방식 */}
              {(hasOnchainPaths || hasLightningPaths) && (
                <div>
                  <p className="text-[10px] font-semibold text-label-quaternary uppercase tracking-wider mb-2">출금 방식 제외</p>
                  <div className="flex flex-wrap gap-1.5">
                    {hasOnchainPaths && (
                      <ToggleChip label="온체인" active={excludeOnchain} onClick={() => { setExcludeOnchain(o => !o); setVisibleCount(PAGE_SIZE); }} />
                    )}
                    {hasLightningPaths && (
                      <ToggleChip label="라이트닝" active={excludeLightning} onClick={() => { setExcludeLightning(o => !o); setVisibleCount(PAGE_SIZE); }} />
                    )}
                  </div>
                </div>
              )}

              {/* 국내 거래소 */}
              <div>
                <p className="text-[10px] font-semibold text-label-quaternary uppercase tracking-wider mb-2">국내 거래소 제외</p>
                <div className="flex flex-wrap gap-1.5">
                  {availableExchanges.map(id => (
                    <ToggleChip key={id} label={fmtEx(id)} active={excludeExchanges.has(id)} onClick={() => toggleExchange(id)} />
                  ))}
                </div>
              </div>

              {/* 해외 거래소 */}
              {availableGlobalExchanges.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-label-quaternary uppercase tracking-wider mb-2">해외 거래소 제외</p>
                  <div className="flex flex-wrap gap-1.5">
                    {availableGlobalExchanges.map(id => (
                      <ToggleChip key={id} label={fmtEx(id)} active={excludeGlobalExchanges.has(id)} onClick={() => toggleGlobalExchange(id)} />
                    ))}
                  </div>
                </div>
              )}

              {/* 라이트닝 서비스 */}
              {availableServices.length > 0 && !excludeLightning && (
                <div>
                  <p className="text-[10px] font-semibold text-label-quaternary uppercase tracking-wider mb-2">라이트닝 서비스 제외</p>
                  <div className="flex flex-wrap gap-1.5">
                    {availableServices.map(id => (
                      <ToggleChip key={id} label={fmtEx(id)} active={excludeServices.has(id)} onClick={() => toggleService(id)} />
                    ))}
                  </div>
                </div>
              )}

              {activeFilterCount > 0 && (
                <button onClick={clearFilters} className="text-[11px] text-label-tertiary hover:text-label-secondary transition-colors cursor-pointer">
                  필터 초기화
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Table */}
      <div className="ios-card rounded-2xl overflow-hidden">
        <div className="grid grid-cols-[28px_1fr_auto] gap-x-3 px-4 py-2 border-b border-white/6">
          <span className="text-[10px] font-semibold text-label-quaternary uppercase tracking-wider">#</span>
          <span className="text-[10px] font-semibold text-label-quaternary uppercase tracking-wider">경로</span>
          <span className="text-[10px] font-semibold text-label-quaternary uppercase tracking-wider text-right">수수료</span>
        </div>

        <div>
          {visible.map((p, i) => (
            <motion.button
              key={`${p.korean_exchange}|${p.route_variant ?? ''}|${p._g}|${p.network}|${p.path_type ?? ''}|${p.lightning_exit_provider ?? ''}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ ...SPRING_SLOW, delay: Math.min(i, 6) * 0.03 }}
              onClick={() => handleSelectRecommendedPath(p)}
              className={[
                'w-full grid grid-cols-[28px_1fr_auto] gap-x-3 px-4 py-3 text-left transition-colors',
                p.disabled
                  ? 'bg-fill-secondary/60 opacity-60'
                  : 'hover:bg-white/4 active:bg-white/6',
                i < visible.length - 1 ? 'border-b border-white/4' : '',
              ].join(' ')}
            >
              <span className={[
                'text-xs font-bold self-center',
                p.disabled
                  ? 'text-label-quaternary'
                  : i === 0 ? 'text-acc-amber' : i === 1 ? 'text-label-secondary' : i === 2 ? 'text-label-tertiary' : 'text-label-quaternary',
              ].join(' ')}>
                {p.disabled
                  ? <Wrench weight="fill" className="w-3.5 h-3.5 text-acc-amber" />
                  : i + 1}
              </span>

              <div className="min-w-0 self-center overflow-x-auto scrollbar-none">
                <div className="flex items-center gap-1.5">
                  <p className={[
                    'text-[12px] font-medium whitespace-nowrap',
                    p.disabled ? 'text-label-quaternary' : 'text-label-primary',
                  ].join(' ')}>
                    {routeText(p)}
                  </p>
                </div>
              </div>

              <div className="text-right self-center flex-shrink-0">
                <p className={[
                  'text-[12px] font-bold num',
                  p.disabled ? 'text-label-quaternary' : 'text-acc-red',
                ].join(' ')}>-{formatFeeKrw(p.total_fee_krw)}</p>
                <p className="text-[10px] text-label-tertiary num">{formatPercent(p.fee_pct)}</p>
              </div>
            </motion.button>
          ))}

          {topRecommendedPaths.length === 0 && (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-label-tertiary">필터 조건에 맞는 경로가 없어요</p>
              <button onClick={clearFilters} className="mt-2 text-xs text-acc-amber cursor-pointer">필터 초기화</button>
            </div>
          )}
        </div>
      </div>

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
