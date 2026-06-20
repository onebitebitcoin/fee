import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, CircleNotch, MagnifyingGlass, Warning, Info, ArrowDown, ArrowUp } from '@phosphor-icons/react';
import { SPRING_FAST, fmtKst } from '../constants';
import { ExFavicon } from '../ui';
import { fmtEx } from '../../../lib/exchangeNames';
import { useExplorer } from '../ExplorerContext';
import { api } from '../../../lib/api';
import type { AccessStats, NetworkChange } from '../../../types';

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
  const [stats, setStats] = useState<AccessStats | null>(null);
  const [networkChanges, setNetworkChanges] = useState<NetworkChange[]>([]);

  useEffect(() => {
    api.getAccessCount().then(setStats).catch(() => {});
    api.getNetworkChanges().then(r => setNetworkChanges(r.items)).catch(() => {});
  }, []);

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
              {/* 방문자 수 */}
              {stats && (
                <div className="flex items-center gap-3 py-0.5">
                  <span className="text-[11px] text-label-tertiary">
                    오늘 방문 <span className="font-semibold text-label-secondary num">{stats.visitors_today.toLocaleString('ko-KR')}</span>명
                  </span>
                  <span className="text-label-quaternary text-[10px]">·</span>
                  <span className="text-[11px] text-label-tertiary">
                    누적 <span className="font-semibold text-label-secondary num">{stats.visitors_total.toLocaleString('ko-KR')}</span>명
                  </span>
                </div>
              )}

              {/* 출금 상태 변경 알림 */}
              {networkChanges.length > 0 && (
                <div className="space-y-1.5">
                  {networkChanges.map((item, i) => (
                    <div key={i} className="ios-card rounded-xl px-3 py-2.5 flex items-start gap-2.5">
                      <div className={`mt-0.5 flex-shrink-0 ${item.change_type === 'suspended' ? 'text-acc-red' : 'text-acc-green'}`}>
                        {item.change_type === 'suspended'
                          ? <ArrowDown size={14} weight="bold" />
                          : <ArrowUp size={14} weight="bold" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <ExFavicon id={item.exchange} size={14} />
                          <span className="text-[12px] font-semibold text-label-primary">{fmtEx(item.exchange)}</span>
                          {item.coin && <span className="text-[11px] text-label-secondary font-medium">{item.coin}</span>}
                          {item.network && <span className="text-[10px] text-label-tertiary">{item.network}</span>}
                          <span className={`text-[11px] font-semibold ${item.change_type === 'suspended' ? 'text-acc-red' : 'text-acc-green'}`}>
                            {item.change_type === 'suspended' ? '출금 중단' : '출금 재개'}
                          </span>
                        </div>
                        {item.related_notices.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {item.related_notices.slice(0, 2).map((n, j) => (
                              <a
                                key={j}
                                href={n.url ?? '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block text-[10px] text-acc-blue truncate hover:underline"
                              >
                                {n.title}
                              </a>
                            ))}
                          </div>
                        )}
                        {item.detected_at && (
                          <p className="text-[10px] text-label-quaternary mt-0.5">
                            {fmtKst(item.detected_at)} 감지
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

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
                        <div className="rounded-2xl bg-fill-secondary p-3.5 space-y-2">
                          <div className="rounded-xl p-2.5 bg-fill-tertiary space-y-0.5">
                            <p className="text-[11px] font-semibold text-acc-amber">비트코인 김치 프리미엄</p>
                            <p className="text-[10px] text-label-secondary">한국 BTC가 해외 대비 얼마나 비싼지예요.</p>
                          </div>
                          <div className="rounded-xl p-2.5 bg-fill-tertiary space-y-0.5">
                            <p className="text-[11px] font-semibold text-acc-blue">원달러 김치 프리미엄</p>
                            <p className="text-[10px] text-label-secondary">원화로 달러(USDT)를 살 때 붙는 프리미엄이에요.</p>
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
