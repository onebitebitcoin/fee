import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, CircleNotch, MagnifyingGlass, Warning, Info } from '@phosphor-icons/react';
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
  const [kimpInfoOpen, setKimpInfoOpen] = useState(false);
  const {
    amount, setAmount, unit, setUnit, amountKrw, allData, error, btcPrice, usdtPremium,
    handleSearch, isSearching,
  } = useExplorer();

  const kimp = btcPrice?.kimchiPremium;
  const kimpColor = kimp == null
    ? 'text-label-tertiary'
    : kimp > 2 ? 'text-acc-red' : kimp > 0 ? 'text-acc-amber' : 'text-acc-green';
  const usdtColor = usdtPremium == null
    ? 'text-label-tertiary'
    : usdtPremium >= 0 ? 'text-acc-red' : 'text-acc-green';

  return (
    <>
              {/* 지원 거래소 마퀴 */}
              <ExchangeMarquee />

              {/* BTC 시세 + 프리미엄 패널 */}
              {btcPrice && (
                <>
                  <div className="ios-card rounded-2xl px-4 py-3 grid grid-cols-2 gap-x-2 gap-y-2.5">
                    <div className="text-center">
                      <p className="text-[10px] text-label-tertiary mb-0.5">Binance</p>
                      <p className="text-[13px] font-bold text-label-primary num">
                        ${btcPrice.usd.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-label-tertiary mb-0.5">Upbit</p>
                      <p className="text-[13px] font-bold text-label-primary num">
                        ₩{(btcPrice.upbitKrw ?? btcPrice.krw).toLocaleString('ko-KR')}
                      </p>
                    </div>
                    <div className="col-span-2 h-px bg-separator" />
                    <div className="text-center">
                      <p className="text-[10px] text-label-tertiary mb-0.5">비트코인 김치 프리미엄</p>
                      <p className={`text-[13px] font-bold num ${kimpColor}`}>
                        {kimp != null ? `${kimp >= 0 ? '+' : ''}${kimp.toFixed(2)}%` : '—'}
                      </p>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1 mb-0.5">
                        <p className="text-[10px] text-label-tertiary">원달러 김치 프리미엄</p>
                        <button
                          onClick={() => setKimpInfoOpen(o => !o)}
                          className="text-label-quaternary hover:text-label-tertiary transition-colors"
                          aria-label="계산 방식 설명"
                        >
                          <Info size={11} weight={kimpInfoOpen ? 'fill' : 'regular'} />
                        </button>
                      </div>
                      <p className={`text-[13px] font-bold num ${usdtColor}`}>
                        {usdtPremium != null ? `${usdtPremium >= 0 ? '+' : ''}${usdtPremium.toFixed(2)}%` : '—'}
                      </p>
                    </div>
                  </div>

                  {/* 계산 방식 설명 패널 */}
                  <AnimatePresence>
                    {kimpInfoOpen && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="rounded-2xl bg-fill-secondary p-3.5 space-y-3">
                          <p className="text-[11px] font-semibold text-label-secondary uppercase tracking-wide">프리미엄 계산 방식</p>
                          <div className="space-y-2">
                            <div className="rounded-xl p-2.5 bg-fill-tertiary space-y-1">
                              <p className="text-[11px] font-semibold text-label-primary">비트코인 김치 프리미엄</p>
                              <p className="text-[10px] font-mono text-label-secondary leading-relaxed">
                                업비트 BTC/KRW ÷ (바이낸스 BTC/USD × 업비트 USDT/KRW) − 1
                              </p>
                              <p className="text-[10px] text-label-tertiary leading-relaxed">
                                업비트 USDT를 달러 환율 기준으로 삼아, 한국 BTC가 글로벌 대비 얼마나 비싼지 측정해요.
                              </p>
                            </div>
                            <div className="rounded-xl p-2.5 bg-fill-tertiary space-y-1">
                              <p className="text-[11px] font-semibold text-label-primary">원달러 김치 프리미엄</p>
                              <p className="text-[10px] font-mono text-label-secondary leading-relaxed">
                                업비트 USDT/KRW ÷ 두나무 포렉스 USD/KRW − 1
                              </p>
                              <p className="text-[10px] text-label-tertiary leading-relaxed">
                                업비트의 USDT 시세가 실제 외환 환율보다 얼마나 비싼지 측정해요. 원화로 달러를 사는 비용이에요.
                              </p>
                            </div>
                            <div className="rounded-xl p-2.5 bg-acc-amber/8 border border-acc-amber/15 space-y-1">
                              <p className="text-[11px] font-semibold text-acc-amber">둘의 관계</p>
                              <p className="text-[10px] font-mono text-label-secondary">
                                실제 BTC 김프 ≈ 비트코인 김프 + 원달러 김프
                              </p>
                              <p className="text-[10px] text-label-tertiary leading-relaxed">
                                두 값의 차이가 클수록 USDT와 BTC의 국내 수급이 서로 다른 방향으로 움직이고 있다는 뜻이에요.
                              </p>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
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
