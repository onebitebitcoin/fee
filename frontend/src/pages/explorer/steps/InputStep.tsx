import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, CircleNotch, MagnifyingGlass, Warning, ArrowDown, ArrowUp, ArrowsCounterClockwise, CaretDown } from '@phosphor-icons/react';
import { SPRING_FAST, fmtKst } from '../constants';
import { ExFavicon } from '../ui';
import { fmtEx } from '../../../lib/exchangeNames';
import { useExplorer } from '../ExplorerContext';
import { api } from '../../../lib/api';
import { filterDisabledWithdrawals } from '../disabledNetworks';
import type { AccessStats, NetworkChange, WithdrawalRow } from '../../../types';

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
  const [disabledNetworks, setDisabledNetworks] = useState<WithdrawalRow[]>([]);
  const [refreshingDisabled, setRefreshingDisabled] = useState(false);
  const [kimpDetailOpen, setKimpDetailOpen] = useState(false);

  useEffect(() => {
    api.getAccessCount().then(setStats).catch(() => {});
    api.getNetworkChanges().then(r => setNetworkChanges(r.items)).catch(() => {});
    api.getWithdrawalFees()
      .then(r => setDisabledNetworks(filterDisabledWithdrawals(r.items)))
      .catch(() => {});
  }, []);

  function refreshDisabledNetworks() {
    setRefreshingDisabled(true);
    api.getWithdrawalFees()
      .then(r => setDisabledNetworks(filterDisabledWithdrawals(r.items)))
      .catch(() => {})
      .finally(() => setRefreshingDisabled(false));
  }

  const {
    amount, setAmount, unit, setUnit, amountKrw, allData, error, btcPrice, usdtPremium,
    handleSearch, isSearching,
  } = useExplorer();

  // 비트코인 자체 프리미엄(USDT 환산) — 분해 보조값
  const kimp = btcPrice?.kimchiPremium;
  // 김치 프리미엄(총) — 메인값. 포렉스 실패 시 BTC 자체 값으로 폴백.
  const kimpTotal = btcPrice?.kimchiPremiumTotal ?? null;
  const heroPrem = kimpTotal ?? kimp ?? null;
  const showBreakdown = kimpTotal != null && (kimp != null || usdtPremium != null);
  const premColor = (v: number | null | undefined) =>
    v == null ? 'text-label-tertiary'
      : v > 2 ? 'text-acc-red' : v > 0 ? 'text-acc-amber' : 'text-acc-green';
  const heroColor = premColor(heroPrem);
  const kimpColor = premColor(kimp);
  const usdtColor = usdtPremium == null
    ? 'text-label-tertiary'
    : usdtPremium >= 0 ? 'text-acc-red' : 'text-acc-green';
  const fmtPct = (v: number | null | undefined) =>
    v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` : '—';

  // 김치 프리미엄 구성 비중 (절대값 기준 — 부호 무관 기여도)
  const btcMag = Math.abs(kimp ?? 0);
  const fxMag = Math.abs(usdtPremium ?? 0);
  const magSum = btcMag + fxMag;
  const btcShare = magSum > 0 ? (btcMag / magSum) * 100 : 0;
  const fxShare = magSum > 0 ? (fxMag / magSum) * 100 : 0;

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
                    {/* 김치 프리미엄: 총합 대표 + 분해 보조 */}
                    <div className="col-span-2 text-center">
                      <p className="text-[10px] text-label-tertiary mb-0.5">비트코인 김치 프리미엄</p>
                      <p className={`text-[22px] font-bold num leading-none ${heroColor}`}>
                        {fmtPct(heroPrem)}
                      </p>
                      {showBreakdown && (
                        <div className="flex items-center justify-center gap-3 mt-1.5">
                          <span className="text-[10px] text-label-tertiary">
                            BTC 자체 <span className={`font-semibold num ${kimpColor}`}>{fmtPct(kimp)}</span>
                          </span>
                          <span className="text-label-quaternary text-[10px]">·</span>
                          <span className="text-[10px] text-label-tertiary">
                            테더(USDT) <span className={`font-semibold num ${usdtColor}`}>{fmtPct(usdtPremium)}</span>
                          </span>
                        </div>
                      )}
                      {/* 자세히 토글 */}
                      {showBreakdown && magSum > 0 && (
                        <button
                          onClick={() => setKimpDetailOpen(o => !o)}
                          className="inline-flex items-center gap-0.5 mt-1.5 text-[10px] font-medium text-acc-amber hover:opacity-80 transition-opacity"
                        >
                          자세히
                          <CaretDown className={`w-2.5 h-2.5 transition-transform ${kimpDetailOpen ? 'rotate-180' : ''}`} weight="bold" />
                        </button>
                      )}
                      {/* 구성 비중 progress bar */}
                      {showBreakdown && magSum > 0 && kimpDetailOpen && (
                        <div className="mt-2.5 text-left">
                          <p className="text-[10px] text-label-tertiary mb-1.5">
                            김치 프리미엄은 두 가지 요인으로 구성됩니다
                          </p>
                          {/* 스택 막대 */}
                          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-fill-tertiary">
                            <div className="h-full bg-acc-amber" style={{ width: `${btcShare}%` }} />
                            <div className="h-full bg-acc-blue" style={{ width: `${fxShare}%` }} />
                          </div>
                          {/* 범례 */}
                          <div className="mt-2 space-y-1">
                            <div className="flex items-center gap-1.5 text-[10px]">
                              <span className="w-2 h-2 rounded-full bg-acc-amber flex-shrink-0" />
                              <span className="text-label-secondary">거래소 BTC 가격차</span>
                              <span className="font-semibold text-label-primary num ml-auto">{btcShare.toFixed(0)}%</span>
                              <span className={`num ${kimpColor}`}>{fmtPct(kimp)}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px]">
                              <span className="w-2 h-2 rounded-full bg-acc-blue flex-shrink-0" />
                              <span className="text-label-secondary">원달러 환율차 (테더)</span>
                              <span className="font-semibold text-label-primary num ml-auto">{fxShare.toFixed(0)}%</span>
                              <span className={`num ${usdtColor}`}>{fmtPct(usdtPremium)}</span>
                            </div>
                          </div>
                        </div>
                      )}
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
                <div className="ios-card rounded-2xl px-4 py-3">
                  <p className="text-[10px] font-semibold text-label-quaternary uppercase tracking-wider mb-2">변경 공지사항</p>
                  <div className="space-y-1.5">
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

              {/* 네트워크 비활성 목록 (출금 중단된 BTC/USDT 네트워크) */}
              {disabledNetworks.length > 0 && (
                <div className="ios-card rounded-2xl px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-semibold text-label-quaternary uppercase tracking-wider">네트워크 비활성 목록</p>
                    <button
                      onClick={refreshDisabledNetworks}
                      disabled={refreshingDisabled}
                      className="p-1 rounded-lg hover:bg-fill-primary text-label-quaternary hover:text-label-secondary transition-colors disabled:opacity-40"
                    >
                      <ArrowsCounterClockwise
                        className={`w-3 h-3 ${refreshingDisabled ? 'animate-spin' : ''}`}
                      />
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {disabledNetworks.map((row, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-acc-red" />
                        <ExFavicon id={row.exchange} size={12} />
                        <span className="text-[11px] text-label-secondary">{fmtEx(row.exchange)}</span>
                        <span className="text-[11px] text-label-tertiary">{row.coin}</span>
                        <span className="text-[10px] text-label-quaternary">{row.network_label}</span>
                        <span className="text-[11px] font-semibold text-acc-red ml-auto">출금 중단</span>
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
