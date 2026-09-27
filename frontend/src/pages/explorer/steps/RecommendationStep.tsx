import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { CaretRight, Funnel, Wrench, X, WarningCircle } from '@phosphor-icons/react';
import { buildReportQuery } from '../../board/reportTemplate';
import { fmtEx } from '../../../lib/exchangeNames';
import { formatFeeKrw, formatPercent } from '../../../lib/formatBtc';
import { fmtKst } from '../constants';
import { SPRING_FAST, SPRING_SLOW } from '../constants';
import { useExplorer } from '../ExplorerContext';
import { ExFavicon } from '../ui';
import type { PathMode } from '../../../types';
import { isLightningPath } from '../pathMode';
import { usdtNetworkKeys, USDT_NETWORK_LABEL } from '../recommend';
import { routeStops } from '../routeStops';
import { activeGates, gateSeverity, isPathDemoted, GATE_BADGE, GATE_BADGE_CLASS } from '../depositGate';

// 추천 목록에 보여줄 경로 수. 사람들은 위쪽 몇 개만 보고 고르므로 상위 5개로 충분하다.
// 다른 거래소 조합을 찾고 싶으면 필터로 좁힌다.
const TOP_N = 5;

type PresetKey = 'no_disabled' | 'no_kyc_lightning' | 'no_lightning' |
  'bithumb_binance' | 'bithumb_okx' | 'upbit_binance' | 'upbit_okx';

// 거래소 짝 프리셋은 자금이 흐르는 순서대로 읽힌다. 살 때는 국내 거래소에서 해외 거래소로
// 나가고, 팔 때는 해외 거래소에서 국내 거래소로 들어오므로 화살표 방향이 뒤집힌다.
const PRESET_PAIRS: { key: PresetKey; korean: string; global: string }[] = [
  { key: 'bithumb_binance', korean: '빗썸', global: '바이낸스' },
  { key: 'bithumb_okx',    korean: '빗썸', global: 'OKX' },
  { key: 'upbit_binance',  korean: '업비트', global: '바이낸스' },
  { key: 'upbit_okx',      korean: '업비트', global: 'OKX' },
];

function presetsFor(mode: PathMode): { key: PresetKey; label: string }[] {
  const pairs = PRESET_PAIRS.map(({ key, korean, global }) => ({
    key,
    label: mode === 'sell' ? `${global} → ${korean}` : `${korean} → ${global}`,
  }));
  return [
    { key: 'no_kyc_lightning', label: 'KYC 라이트닝 제외' },
    { key: 'no_lightning',    label: '라이트닝 제외' },
    ...pairs,
  ];
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
  const navigate = useNavigate();
  const {
    mode, amountBtc, walletRegistered,
    amountKrw,
    allPaths,
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
    excludeNetworks,        setExcludeNetworks,
    destinationFilter,      setDestinationFilter,
  } = useExplorer();

  const presets = useMemo(() => presetsFor(mode), [mode]);

  const [filterOpen, setFilterOpen] = useState(false);

  const visible = topRecommendedPaths.slice(0, TOP_N);

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
  const kycServices = useMemo(() =>
    [...new Set(allRecommendedPaths
      .filter(p => p.exit_service_kyc_status === 'kyc' && p.lightning_exit_provider && p.lightning_exit_provider !== '__direct__')
      .map(p => p.lightning_exit_provider!))],
    [allRecommendedPaths],
  );
  // 팔 때 USDT 입금망 칩. dedup 전 전체 경로에서 뽑아야 제외한 망의 칩이 사라지지 않는다.
  const availableNetworkKeys = useMemo(() =>
    mode === 'sell' ? usdtNetworkKeys(allPaths) : [],
    [allPaths, mode],
  );
  const hasLightningPaths = allRecommendedPaths.some(p => isLightningPath(p, mode));
  const hasOnchainPaths   = allRecommendedPaths.some(p => !isLightningPath(p, mode));
  const hasDisabledPaths  = allRecommendedPaths.some(p => p.disabled);
  // 종착지 토글: 라이트닝 지갑 종착 경로가 존재할 때만 노출
  const hasLightningWalletPaths = allRecommendedPaths.some(p => p.destination === 'lightning_wallet');

  const activeFilterCount =
    excludeExchanges.size + excludeGlobalExchanges.size + excludeServices.size + excludeNetworks.size +
    (excludeOnchain ? 1 : 0) + (excludeLightning ? 1 : 0) + (excludeDisabled ? 1 : 0);

  function toggleExchange(id: string) {
    setExcludeExchanges(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleGlobalExchange(id: string) {
    setExcludeGlobalExchanges(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleService(id: string) {
    setExcludeServices(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleNetwork(key: string) {
    setExcludeNetworks(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function clearFilters() {
    setExcludeExchanges(new Set());
    setExcludeGlobalExchanges(new Set());
    setExcludeServices(new Set());
    setExcludeNetworks(new Set());
    setExcludeOnchain(false);
    setExcludeLightning(false);
    setExcludeDisabled(false);
  }

  function isPresetActive(key: PresetKey): boolean {
    switch (key) {
      case 'no_disabled': return excludeDisabled;
      case 'no_kyc_lightning':
        return kycServices.length > 0 && kycServices.every(s => excludeServices.has(s));
      case 'no_lightning': return excludeLightning;
      case 'bithumb_binance': {
        const nonBithumb = availableExchanges.filter(e => e !== 'bithumb');
        const nonBinance = availableGlobalExchanges.filter(e => e !== 'binance');
        return nonBithumb.length > 0 && nonBithumb.every(e => excludeExchanges.has(e)) &&
               nonBinance.length > 0 && nonBinance.every(e => excludeGlobalExchanges.has(e));
      }
      case 'bithumb_okx': {
        const nonBithumb = availableExchanges.filter(e => e !== 'bithumb');
        const nonOkx = availableGlobalExchanges.filter(e => e !== 'okx');
        return nonBithumb.length > 0 && nonBithumb.every(e => excludeExchanges.has(e)) &&
               nonOkx.length > 0 && nonOkx.every(e => excludeGlobalExchanges.has(e));
      }
      case 'upbit_binance': {
        const nonUpbit = availableExchanges.filter(e => e !== 'upbit');
        const nonBinance = availableGlobalExchanges.filter(e => e !== 'binance');
        return nonUpbit.length > 0 && nonUpbit.every(e => excludeExchanges.has(e)) &&
               nonBinance.length > 0 && nonBinance.every(e => excludeGlobalExchanges.has(e));
      }
      case 'upbit_okx': {
        const nonUpbit = availableExchanges.filter(e => e !== 'upbit');
        const nonOkx = availableGlobalExchanges.filter(e => e !== 'okx');
        return nonUpbit.length > 0 && nonUpbit.every(e => excludeExchanges.has(e)) &&
               nonOkx.length > 0 && nonOkx.every(e => excludeGlobalExchanges.has(e));
      }
      default: return false;
    }
  }

  function applyPreset(key: PresetKey) {
    if (isPresetActive(key)) {
      clearFilters();
      return;
    }
    setExcludeExchanges(new Set());
    setExcludeGlobalExchanges(new Set());
    setExcludeServices(new Set());
    setExcludeNetworks(new Set());
    setExcludeOnchain(false);
    setExcludeLightning(false);
    setExcludeDisabled(false);
    switch (key) {
      case 'no_disabled':
        setExcludeDisabled(true);
        break;
      case 'no_kyc_lightning':
        setExcludeServices(new Set(kycServices));
        break;
      case 'no_lightning':
        setExcludeLightning(true);
        break;
      case 'bithumb_binance':
        setExcludeExchanges(new Set(availableExchanges.filter(e => e !== 'bithumb')));
        setExcludeGlobalExchanges(new Set(availableGlobalExchanges.filter(e => e !== 'binance')));
        break;
      case 'bithumb_okx':
        setExcludeExchanges(new Set(availableExchanges.filter(e => e !== 'bithumb')));
        setExcludeGlobalExchanges(new Set(availableGlobalExchanges.filter(e => e !== 'okx')));
        break;
      case 'upbit_binance':
        setExcludeExchanges(new Set(availableExchanges.filter(e => e !== 'upbit')));
        setExcludeGlobalExchanges(new Set(availableGlobalExchanges.filter(e => e !== 'binance')));
        break;
      case 'upbit_okx':
        setExcludeExchanges(new Set(availableExchanges.filter(e => e !== 'upbit')));
        setExcludeGlobalExchanges(new Set(availableGlobalExchanges.filter(e => e !== 'okx')));
        break;
    }
  }

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-label-tertiary uppercase tracking-wider mb-1">
            {mode === 'sell'
              ? `${amountBtc} BTC 판매 기준`
              : `₩${amountKrw.toLocaleString('ko-KR')} 기준`}
          </p>
          <h1 className="text-2xl font-bold text-label-primary tracking-tight">추천 경로</h1>
          <p className="text-sm text-label-secondary mt-1">수수료가 가장 낮은 경로 순으로 보여드려요</p>
        </div>
        <button
          onClick={() => setFilterOpen(o => !o)}
          className={[
            'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer mt-1 flex-shrink-0',
            filterOpen || activeFilterCount > 0
              ? 'bg-acc-brand/15 text-acc-brand'
              : 'bg-fill-secondary text-label-secondary hover:bg-fill-primary',
          ].join(' ')}
        >
          <Funnel className="w-3.5 h-3.5" weight={activeFilterCount > 0 ? 'fill' : 'regular'} />
          필터
          {activeFilterCount > 0 && (
            <span className="bg-acc-brand text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
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
              {/* 빠른 필터 */}
              <div>
                <p className="text-[10px] font-semibold text-label-quaternary uppercase tracking-wider mb-2">빠른 필터</p>
                <div className="flex flex-wrap gap-1.5">
                  {presets.map(({ key, label }) => {
                    const active = isPresetActive(key);
                    return (
                      <button
                        key={key}
                        onClick={() => applyPreset(key)}
                        className={[
                          'px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap',
                          active
                            ? 'bg-acc-brand/15 text-acc-brand'
                            : 'bg-fill-secondary text-label-secondary hover:bg-fill-primary',
                        ].join(' ')}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
              {/* 종착지 (라이트닝 지갑 경로가 있을 때만) */}
              {hasLightningWalletPaths && (
                <div>
                  <p className="text-[10px] font-semibold text-label-quaternary uppercase tracking-wider mb-2">종착지</p>
                  <div className="flex gap-1.5">
                    {(['personal', 'lightning_wallet'] as const).map(d => (
                      <button
                        key={d}
                        onClick={() => { setDestinationFilter(d); }}
                        className={[
                          'flex-1 px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-colors cursor-pointer',
                          destinationFilter === d
                            ? 'bg-acc-brand/15 text-acc-brand'
                            : 'bg-fill-secondary text-label-secondary hover:bg-fill-primary',
                        ].join(' ')}
                      >
                        {d === 'personal' ? '개인지갑' : '라이트닝 지갑'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 비활성화 경로 */}
              {hasDisabledPaths && (
                <div>
                  <p className="text-[10px] font-semibold text-label-quaternary uppercase tracking-wider mb-2">비활성화 경로</p>
                  <div className="flex flex-wrap gap-1.5">
                    <ToggleChip label="비활성화 제외" active={excludeDisabled} onClick={() => { setExcludeDisabled((o: boolean) => !o); }} />
                  </div>
                </div>
              )}

              {/* 출금/전송 방식. 팔 때는 국내 거래소에서 나가는 게 아니라 내 지갑에서 보내는 방식이다. */}
              {(hasOnchainPaths || hasLightningPaths) && (
                <div>
                  <p className="text-[10px] font-semibold text-label-quaternary uppercase tracking-wider mb-2">
                    {mode === 'sell' ? '전송 방식 제외' : '출금 방식 제외'}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {hasOnchainPaths && (
                      <ToggleChip label="온체인" active={excludeOnchain} onClick={() => { setExcludeOnchain(o => !o); }} />
                    )}
                    {hasLightningPaths && (
                      <ToggleChip label="라이트닝" active={excludeLightning} onClick={() => { setExcludeLightning(o => !o); }} />
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

              {/* USDT 입금망 (팔 때). 목록에는 조합당 가장 싼 망만 보이므로, 쓰기 꺼려지는 망을 빼면
                  다음으로 싼 망이 그 자리에 올라온다. */}
              {availableNetworkKeys.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-label-quaternary uppercase tracking-wider mb-2">USDT 입금망 제외</p>
                  <div className="flex flex-wrap gap-1.5">
                    {availableNetworkKeys.map(key => (
                      <ToggleChip key={key} label={USDT_NETWORK_LABEL[key] ?? key} active={excludeNetworks.has(key)} onClick={() => toggleNetwork(key)} />
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

      {/* 추천 경로 카드 (상위 TOP_N 개) */}
      <div className="space-y-2">
        {(() => {
          // '최저' 배지는 실제로 실행할 수 있는 경로에만 붙인다.
          // 입금이 막힌 경로에 최저 배지를 달면 못 쓰는 경로를 권하는 셈이 된다.
          const firstEnabledIdx = visible.findIndex(
            p => !p.disabled && gateSeverity(activeGates(p, walletRegistered)) !== 'blocked',
          );
          const cheapestFee = firstEnabledIdx >= 0 ? visible[firstEnabledIdx].total_fee_krw : null;
          return visible.map((p, i) => {
            const level = gateSeverity(activeGates(p, walletRegistered));
            const isBest = i === firstEnabledIdx;
            // 최저 대비 차액. 관문 때문에 아래로 내려간 경로는 수수료 순서가 아니므로
            // 차액을 붙이면 음수가 '+'로 찍혀 더 싼 것처럼 읽힌다. 그래서 생략한다.
            const diff = cheapestFee != null ? Math.round(p.total_fee_krw - cheapestFee) : 0;
            const showDiff = !p.disabled && i > firstEnabledIdx && diff >= 1
              && !isPathDemoted(p, walletRegistered);
            return (
              <motion.button
                key={`${p.korean_exchange}|${p.route_variant ?? ''}|${p._g}|${p.network}|${p.path_type ?? ''}|${p.lightning_exit_provider ?? ''}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: p.disabled ? 0.4 : 1, y: 0 }}
                transition={{ ...SPRING_SLOW, delay: i * 0.04 }}
                onClick={() => handleSelectRecommendedPath(p)}
                className={[
                  'w-full ios-card rounded-2xl px-4 py-3.5 text-left transition-colors space-y-2.5',
                  isBest ? 'ring-1 ring-acc-brand/40' : '',
                  p.disabled ? '' : 'hover:bg-white/4 active:bg-white/6',
                ].join(' ')}
              >
                {/* 윗줄: 순위 · 배지 · 수수료 */}
                <div className="flex items-center gap-2">
                  <span className={[
                    'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0',
                    p.disabled
                      ? 'bg-fill-secondary text-label-quaternary'
                      : isBest ? 'bg-acc-brand text-white' : 'bg-fill-secondary text-label-secondary',
                  ].join(' ')}>
                    {p.disabled ? <Wrench weight="regular" className="w-3 h-3" /> : i + 1}
                  </span>
                  {isBest && (
                    <span className="text-[10px] font-bold bg-acc-green/15 text-acc-green px-1.5 py-0.5 rounded-full">최저</span>
                  )}
                  {level && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${GATE_BADGE_CLASS[level]}`}>
                      {GATE_BADGE[level]}
                    </span>
                  )}
                  <div className="ml-auto text-right flex-shrink-0">
                    <span className={[
                      'text-sm font-bold num',
                      p.disabled ? 'text-label-quaternary' : 'text-acc-red',
                    ].join(' ')}>-{formatFeeKrw(p.total_fee_krw)}</span>
                    <span className="ml-1.5 text-[10px] text-label-tertiary num">{formatPercent(p.fee_pct)}</span>
                  </div>
                </div>

                {/* 아랫줄: 전체 경로 (줄바꿈해서 한눈에). 화살표를 정거장 뒤에 붙여
                    줄이 바뀌어도 새 줄이 화살표가 아니라 정거장 이름으로 시작하게 한다. */}
                <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5">
                  {(() => {
                    const stops = routeStops(p, mode);
                    return stops.map((stop, si) => (
                      <span key={si} className="flex items-center gap-1">
                        {stop.iconId && <ExFavicon id={stop.iconId} size={14} />}
                        <span className={[
                          'text-[12px] whitespace-nowrap',
                          p.disabled ? 'text-label-quaternary'
                            : stop.iconId ? 'font-semibold text-label-primary' : 'text-label-secondary',
                        ].join(' ')}>{stop.label}</span>
                        {si < stops.length - 1 && <CaretRight className="w-2.5 h-2.5 text-label-quaternary flex-shrink-0" weight="bold" />}
                      </span>
                    ));
                  })()}
                </div>

                {showDiff && (
                  <p className="text-[10px] text-label-tertiary num">최저보다 +{formatFeeKrw(diff)}</p>
                )}
              </motion.button>
            );
          });
        })()}

        {topRecommendedPaths.length === 0 && (
          <div className="ios-card rounded-2xl px-4 py-6 text-center">
            <p className="text-sm text-label-tertiary">필터 조건에 맞는 경로가 없어요</p>
            <button onClick={clearFilters} className="mt-2 text-xs text-acc-brand cursor-pointer">필터 초기화</button>
          </div>
        )}

        {topRecommendedPaths.length > TOP_N && (
          <p className="text-[11px] text-label-tertiary text-center pt-1">
            전체 {topRecommendedPaths.length}개 중 상위 {TOP_N}개예요. 다른 조합은 필터로 찾아보세요.
          </p>
        )}
      </div>

      <button onClick={handleBack} className="w-full py-2 text-sm text-label-tertiary hover:text-label-secondary transition-colors">
        처음으로
      </button>

      {/* 제보하기: 게시판 제보 템플릿으로 이동 (금액 자동첨부) */}
      <button
        onClick={() => navigate(`/board/new?${buildReportQuery({ amountKrw })}`)}
        className="w-full py-2 text-xs text-label-tertiary hover:text-acc-blue transition-colors flex items-center justify-center gap-1.5"
      >
        <WarningCircle className="w-3.5 h-3.5" /> 문제점·의견 제보하기
      </button>
    </>
  );
}
