import { motion } from 'motion/react';
import { CircleNotch, Warning } from '@phosphor-icons/react';
import { SPRING_FAST, fmtKst } from '../constants';
import { useExplorer } from '../ExplorerContext';

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

              {/* CTA */}
              <motion.button
                onClick={handleSearch}
                disabled={isSearching || !amountKrw || amountKrw < 10_000}
                whileHover={!isSearching && amountKrw >= 10_000 ? { scale: 1.015, y: -1 } : {}}
                whileTap={!isSearching && amountKrw >= 10_000 ? { scale: 0.975 } : {}}
                transition={SPRING_FAST}
                className={[
                  'w-full py-4 rounded-2xl font-bold text-base transition-all flex items-center justify-center gap-2',
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
                    경로 계산 중
                  </>
                ) : '경로 탐색'}
              </motion.button>

              {allData?.latestRunAt && (
                <p className="text-center text-[11px] text-label-tertiary">
                  데이터 기준: {fmtKst(allData.latestRunAt)} KST
                </p>
              )}
    </>
  );
}
