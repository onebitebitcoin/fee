import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, CircleNotch, MagnifyingGlass, Warning, ArrowDown, ArrowUp } from '@phosphor-icons/react';
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
                <div className="flex items-center justify-center gap-3 py-0.5">
                  <span className="text-[11px] text-label-tertiary">
                    오늘 <span className="font-semibold text-label-secondary num">{stats.visitors_today.toLocaleString('ko-KR')}</span>회
                  </span>
                  <span className="text-label-quaternary text-[10px]">·</span>
                  <span className="text-[11px] text-label-tertiary">
                    누적 <span className="font-semibold text-label-secondary num">{stats.visitors_total.toLocaleString('ko-KR')}</span>회
                  </span>
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
                      </div>
                      <p className={`text-[13px] font-bold num ${usdtColor}`}>
                        {usdtPremium != null ? `${usdtPremium >= 0 ? '+' : ''}${usdtPremium.toFixed(2)}%` : '—'}
                      </p>
                    </div>
                  </div>
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
                  disabled
                  className="flex-1 py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 bg-fill-secondary text-label-disabled cursor-not-allowed"
                >
                  내 경로 찾기 <span className="text-[11px] font-normal text-label-quaternary">(준비중)</span>
                </motion.button>
              </div>

              {/* 변경 공지사항 */}
              {networkChanges.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-label-quaternary uppercase tracking-wider mb-1.5">변경 공지사항</p>
                  <div className="space-y-1">
                    {networkChanges.map((item, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <span className={`flex-shrink-0 ${item.change_type === 'suspended' ? 'text-acc-red' : 'text-acc-green'}`}>
                          {item.change_type === 'suspended'
                            ? <ArrowDown size={11} weight="bold" />
                            : <ArrowUp size={11} weight="bold" />}
                        </span>
                        <ExFavicon id={item.exchange} size={12} />
                        <span className="text-[11px] text-label-secondary">{fmtEx(item.exchange)}</span>
                        {item.coin && <span className="text-[11px] text-label-tertiary">{item.coin}</span>}
                        {item.network && <span className="text-[10px] text-label-quaternary">{item.network}</span>}
                        <span className={`text-[11px] font-semibold ${item.change_type === 'suspended' ? 'text-acc-red' : 'text-acc-green'}`}>
                          {item.change_type === 'suspended' ? '출금 중단' : '출금 재개'}
                        </span>
                        {item.detected_at && (
                          <span className="text-[10px] text-label-quaternary ml-auto">· {fmtKst(item.detected_at)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {allData?.latestRunAt && (
                <p className="text-center text-[11px] text-label-tertiary">
                  데이터 기준: {fmtKst(allData.latestRunAt)} KST
                </p>
              )}
    </>
  );
}
