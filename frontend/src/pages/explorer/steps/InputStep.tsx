import { motion } from 'motion/react';
import { ArrowRight, CircleNotch, MagnifyingGlass, Warning } from '@phosphor-icons/react';
import { SPRING_FAST, fmtKst } from '../constants';
import { ExFavicon } from '../ui';
import { fmtEx } from '../../../lib/exchangeNames';
import { useExplorer } from '../ExplorerContext';

const EXCHANGES = [
  'upbit', 'bithumb', 'coinone', 'korbit', 'gopax',
  'binance', 'okx', 'bybit', 'bitget', 'kraken', 'coinbase', 'gate',
];

function ExchangeMarquee() {
  const items = [...EXCHANGES, ...EXCHANGES]; // 두 번 반복 → 끊김 없는 루프
  return (
    <div className="overflow-hidden -mx-4 relative">
      {/* 좌우 fade */}
      <div className="absolute left-0 top-0 bottom-0 w-10 z-10 pointer-events-none"
        style={{ background: 'linear-gradient(to right, var(--color-bg-primary), transparent)' }} />
      <div className="absolute right-0 top-0 bottom-0 w-10 z-10 pointer-events-none"
        style={{ background: 'linear-gradient(to left, var(--color-bg-primary), transparent)' }} />
      <div className="marquee-track py-1">
        {items.map((id, i) => (
          <div key={i} className="flex items-center gap-2 px-3 py-1.5">
            <ExFavicon id={id} size={20} />
            <span className="text-[11px] font-medium text-label-tertiary whitespace-nowrap">{fmtEx(id)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function InputStep() {
  const {
    amount, setAmount, unit, setUnit, amountKrw, allData, error, btcPrice, handleSearch,
    isSearching,
  } = useExplorer();

  const kimp = btcPrice?.kimchiPremium;
  const kimpColor = kimp == null
    ? 'text-label-tertiary'
    : kimp > 2 ? 'text-acc-red' : kimp > 0 ? 'text-acc-amber' : 'text-acc-green';

  return (
    <>
              {/* 지원 거래소 마퀴 */}
              <ExchangeMarquee />

              {/* BTC 시세 상단 패널 */}
              {btcPrice && (
                <div className="ios-card rounded-2xl px-4 py-3 flex items-center">
                  <div className="flex-1 text-center">
                    <p className="text-[10px] text-label-tertiary mb-0.5">Binance</p>
                    <p className="text-[13px] font-bold text-label-primary num">
                      ${btcPrice.usd.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                  <div className="w-px self-stretch bg-separator mx-1" />
                  <div className="flex-1 text-center">
                    <p className="text-[10px] text-label-tertiary mb-0.5">Upbit</p>
                    <p className="text-[13px] font-bold text-label-primary num">
                      ₩{(btcPrice.upbitKrw ?? btcPrice.krw).toLocaleString('ko-KR')}
                    </p>
                  </div>
                  <div className="w-px self-stretch bg-separator mx-1" />
                  <div className="flex-1 text-center">
                    <p className="text-[10px] text-label-tertiary mb-0.5">김치 프리미엄</p>
                    <p className={`text-[13px] font-bold num ${kimpColor}`}>
                      {kimp != null ? `${kimp >= 0 ? '+' : ''}${kimp.toFixed(2)}%` : '—'}
                    </p>
                  </div>
                </div>
              )}

              {/* Hero amount input */}
              <div className="ios-card rounded-3xl p-6">
                <p className="text-xs font-semibold text-label-tertiary uppercase tracking-wider mb-5">
                  구매 금액
                </p>

                <div className="flex items-baseline gap-2">
                  <span className="text-acc-amber text-3xl font-semibold">₩</span>
                  <input
                    type="number"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    disabled={isSearching}
                    className="flex-1 min-w-0 bg-transparent text-5xl font-bold text-label-primary outline-none
                      [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
                      tracking-tight disabled:opacity-40"
                    placeholder="100"
                    min="1"
                  />
                  {/* Unit toggle */}
                  <div className="seg-ctrl inline-flex flex-shrink-0">
                    {(['만원', '억원'] as const).map(u => (
                      <motion.button
                        key={u}
                        onClick={() => setUnit(u)}
                        disabled={isSearching}
                        className={`relative px-4 py-1.5 text-xs font-semibold rounded-[8px] transition-colors ${
                          unit === u ? 'text-label-primary' : 'text-label-secondary'
                        }`}
                      >
                        {unit === u && (
                          <motion.div
                            layoutId="seg-active"
                            className="absolute inset-0 bg-fill-primary rounded-[8px]"
                            transition={SPRING_FAST}
                          />
                        )}
                        <span className="relative z-10">{u}</span>
                      </motion.button>
                    ))}
                  </div>
                </div>
                <p className="text-sm text-label-tertiary mt-2 num">
                  = ₩{(amountKrw || 0).toLocaleString('ko-KR')}
                </p>
              </div>

              {error && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="flex items-center gap-2 p-3 rounded-xl bg-acc-red/10 text-acc-red text-sm">
                  <Warning className="w-4 h-4 flex-shrink-0" />
                  {error}
                </motion.div>
              )}

              {/* CTA — 두 버튼 나란히 */}
              <div className="flex gap-2">
                <motion.button
                  onClick={() => handleSearch('recommendation')}
                  disabled={isSearching || !amountKrw || amountKrw < 10_000}
                  whileHover={!isSearching && amountKrw >= 10_000 ? { scale: 1.015, y: -1 } : {}}
                  whileTap={!isSearching && amountKrw >= 10_000 ? { scale: 0.975 } : {}}
                  transition={SPRING_FAST}
                  className={[
                    'flex-1 py-4 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2',
                    isSearching
                      ? 'bg-acc-amber/70 text-white cursor-not-allowed'
                      : amountKrw >= 10_000
                        ? 'bg-acc-amber text-white shadow-glow-amber btn-pulse cursor-pointer'
                        : 'bg-fill-secondary text-label-disabled cursor-not-allowed',
                  ].join(' ')}
                >
                  {isSearching ? (
                    <>
                      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
                        <CircleNotch className="w-4 h-4" />
                      </motion.div>
                      계산 중
                    </>
                  ) : (
                    <>
                      <MagnifyingGlass className="w-4 h-4" />
                      추천 경로
                    </>
                  )}
                </motion.button>

                <motion.button
                  onClick={() => handleSearch('domestic')}
                  disabled={isSearching || !amountKrw || amountKrw < 10_000}
                  whileHover={!isSearching && amountKrw >= 10_000 ? { scale: 1.015, y: -1 } : {}}
                  whileTap={!isSearching && amountKrw >= 10_000 ? { scale: 0.975 } : {}}
                  transition={SPRING_FAST}
                  className={[
                    'flex-1 py-4 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2',
                    isSearching
                      ? 'bg-fill-secondary text-label-disabled cursor-not-allowed'
                      : amountKrw >= 10_000
                        ? 'bg-fill-secondary text-label-primary border border-white/10 cursor-pointer hover:bg-fill-primary'
                        : 'bg-fill-secondary text-label-disabled cursor-not-allowed',
                  ].join(' ')}
                >
                  내 경로 찾기 <ArrowRight className="w-4 h-4" />
                </motion.button>
              </div>

              {allData?.latestRunAt && (
                <p className="text-center text-[11px] text-label-tertiary">
                  데이터 기준: {fmtKst(allData.latestRunAt)} KST
                </p>
              )}
    </>
  );
}
