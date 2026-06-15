import { motion } from 'motion/react';
import { ArrowLeft, ArrowRight, CaretDown, TrendDown, Wallet, Warning } from '@phosphor-icons/react';
import { NetworkIcon } from '../../../components/NetworkIcon';
import { fmtEx } from '../../../lib/exchangeNames';
import { formatFeeKrw, formatNumber, formatPercent, SATS_PER_BTC } from '../../../lib/formatBtc';
import { SPRING_SLOW, fmtAmountText } from '../constants';
import { ExFavicon, SectionLabel, Chip } from '../ui';
import { useExplorer } from '../ExplorerContext';

export function ResultStep() {
  const {
    amountKrw, domestic, global, network, swapSvc, liveKimp, liveUsdtKrw, displaySats, showAltPaths,
    setShowAltPaths, snapshotKimp, domesticBtcKrw, resultPath, altPaths, handleBack, reset,
    globalExitMethod, allData,
  } = useExplorer();
  const isHoldOnGlobal = globalExitMethod === 'none';
  const isDisabled = !!resultPath?.disabled;
  if (!resultPath) return null;
  // 경로가 실제로 해외 거래소를 경유하는지 판별 (transient global state가 아닌 결과 데이터 기준).
  // - USDT 경로는 항상 글로벌 경유 (buy 모드에선 route_variant 미설정이라 transfer_coin으로 판별).
  // - btc_via_global은 transfer_coin='BTC'이지만 글로벌 경유 → route_variant로 판별.
  // route_variant 부재 시 fail-closed(false) → BTC 직접 경로에 엉뚱한 거래소가 표시되지 않도록.
  const usesGlobal =
    resultPath.transfer_coin === 'USDT' ||
    (resultPath.route_variant?.endsWith('via_global') ?? false);
  return (
    <>
              {isDisabled && (() => {
                const reason = resultPath.disabled_reason && resultPath.disabled_reason !== 'disabled'
                  ? resultPath.disabled_reason : null;
                const msg = resultPath.suspension_message ?? null;
                const noticeTitle = resultPath.notice_title ?? null;
                const noticeUrl = resultPath.notice_url ?? null;
                return (
                <div className="ios-card rounded-2xl px-4 py-3 flex items-start gap-3">
                  <Warning weight="fill" className="w-4 h-4 text-label-secondary flex-shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-bold text-label-primary mb-1">
                      출금 일시 중단
                      {reason && <span className="ml-1.5 text-[10px] font-normal text-label-tertiary">({reason})</span>}
                    </p>
                    {msg ? (
                      <p className="text-[11px] text-label-secondary leading-snug break-words">{msg}</p>
                    ) : (
                      <p className="text-[11px] text-label-secondary leading-snug">
                        해당 경로의 출금이 현재 거래소에 의해 비활성화되어 있습니다.
                      </p>
                    )}
                    {noticeTitle && noticeUrl && (
                      <a
                        href={noticeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 flex items-start gap-1 group"
                      >
                        <span className="text-[9px] font-semibold bg-acc-blue/10 text-acc-blue px-1.5 py-0.5 rounded-full shrink-0 mt-0.5">공지</span>
                        <span className="text-[10px] text-acc-blue group-hover:underline leading-snug break-words">{noticeTitle}</span>
                      </a>
                    )}
                    {!noticeTitle && (
                      <p className="text-[10px] text-label-tertiary mt-1.5">
                        거래소 공지사항을 확인하세요.
                      </p>
                    )}
                  </div>
                </div>
                );
              })()}

              {isHoldOnGlobal && (
                <div className="ios-card rounded-2xl px-4 py-3 flex items-center gap-2">
                  <span className="text-[10px] font-semibold bg-acc-blue/10 text-acc-blue px-2 py-0.5 rounded-full shrink-0">개인지갑으로 출금하지 않음</span>
                  <p className="text-[10px] text-label-secondary">출금 없이 해외 거래소에 BTC 보유하는 경우 기준. 출금 수수료 제외 시 실제 수수료는 더 낮습니다.</p>
                </div>
              )}

              {/* Hero result card */}
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ ...SPRING_SLOW, delay: 0.1 }}
                className="rounded-3xl text-center relative overflow-hidden"
                style={isDisabled
                  ? { background: 'linear-gradient(145deg, rgba(120,120,130,0.12) 0%, rgba(100,100,110,0.06) 50%, rgba(255,255,255,0) 100%)', border: '0.5px solid rgba(150,150,160,0.25)' }
                  : { background: 'linear-gradient(145deg, rgba(232,133,90,0.10) 0%, rgba(240,160,60,0.06) 50%, rgba(255,255,255,0) 100%)', border: '0.5px solid rgba(200,120,60,0.18)' }
                }
              >
                {isDisabled && <div className="caution-tape-band w-full h-9" />}
                <div className="p-6">
                {!isDisabled && (
                  <motion.div
                    animate={{ opacity: [0.3, 0.7, 0.3] }}
                    transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                    className="absolute -top-8 left-1/2 -translate-x-1/2 w-32 h-32 rounded-full bg-acc-amber/10 blur-2xl pointer-events-none"
                  />
                )}
                {isDisabled ? (
                  <div className="w-8 h-8 rounded-full bg-fill-tertiary flex items-center justify-center mx-auto mb-4 relative z-10">
                    <Wallet weight="fill" className="w-4.5 h-4.5 text-label-quaternary" />
                  </div>
                ) : (
                  <Wallet weight="fill" className="w-8 h-8 text-acc-amber mx-auto mb-4 relative z-10" />
                )}
                <p className="text-xs text-label-tertiary uppercase tracking-wider mb-2 relative z-10">예상 수령</p>
                <p className={`text-5xl font-bold num leading-none relative z-10 ${isDisabled ? 'text-label-tertiary' : 'text-label-primary'}`}>
                  {formatNumber(displaySats)}
                </p>
                <p className="text-sm text-label-tertiary mt-1 num relative z-10">sats</p>
                <div className="sep mt-5 mb-4 relative z-10" />

                {(() => {
                  const kimchi = domestic ? ((liveKimp ?? snapshotKimp)[domestic] ?? null) : null;
                  const satsKrw = domesticBtcKrw != null && resultPath.btc_received != null
                    ? Math.round(resultPath.btc_received * domesticBtcKrw)
                    : null;
                  const krwPnL = satsKrw != null ? satsKrw - amountKrw : null;

                  const globalBtcKrw = domesticBtcKrw != null && kimchi != null
                    ? domesticBtcKrw / (1 + kimchi / 100)
                    : null;
                  const satsGlobalKrw = globalBtcKrw != null && resultPath.btc_received != null
                    ? Math.round(resultPath.btc_received * globalBtcKrw)
                    : null;
                  const globalPnL = satsGlobalKrw != null ? satsGlobalKrw - amountKrw : null;

                  return (
                    <div className="space-y-2 relative z-10 w-full">
                      <div className="ios-card rounded-2xl px-4 py-3 text-left">
                        <p className="text-[10px] text-label-tertiary uppercase tracking-wide mb-1.5">수수료 합계</p>
                        <p className="text-sm font-bold text-acc-red num">
                          -{formatFeeKrw(resultPath.total_fee_krw)}
                          <span className="text-[11px] font-normal ml-1.5 opacity-70">({formatPercent(resultPath.fee_pct)})</span>
                        </p>
                        {krwPnL != null && krwPnL !== -resultPath.total_fee_krw && (
                          <p className={`text-[11px] num mt-1.5 ${krwPnL < 0 ? 'text-label-secondary' : 'text-acc-green'}`}>
                            순손익(김치 프리미엄 포함) {krwPnL < 0 ? '▼' : '▲'} ₩{formatNumber(Math.abs(krwPnL))}
                          </p>
                        )}
                      </div>

                      {globalPnL != null && (() => {
                        const isUsdtPath = resultPath.transfer_coin === 'USDT';
                        // USDT 경로: globalPnL과 수수료 차이 = 테더/원달러 환율 차이 효과
                        // globalPnL = btc_received × globalBtcKrw - amountKrw (음수 = 손실)
                        // exchangeRateDiff < 0 → 국내 USDT 환율이 포렉스보다 비쌈 (추가 비용)
                        const exchangeRateDiff = isUsdtPath ? (globalPnL + resultPath.total_fee_krw) : null;
                        return (
                        <div className="ios-card rounded-2xl px-4 py-3 text-left">
                          <p className="text-[10px] text-label-tertiary uppercase tracking-wide mb-1.5">
                            글로벌 시세 기준
                            <span className="ml-1.5 normal-case font-normal">
                              (김치 프리미엄 <span className={kimchi! >= 0 ? 'text-acc-red' : 'text-acc-green'}>{kimchi! >= 0 ? '+' : ''}{kimchi!.toFixed(2)}%</span>
                              <span className="text-[9px] text-label-tertiary"> / 원달러 기준</span>)
                            </span>
                          </p>
                          <p className="text-xs text-label-secondary leading-relaxed">
                            같은 비트코인을 글로벌 시세로 환산하면 <span className="num font-semibold text-label-primary">₩{formatNumber(satsGlobalKrw!)}</span>
                          </p>
                          <p className={`text-sm font-bold num mt-1 ${globalPnL >= 0 ? 'text-acc-green' : 'text-acc-red'}`}>
                            {globalPnL >= 0 ? '▲' : '▼'} ₩{formatNumber(Math.abs(globalPnL))} {globalPnL >= 0 ? '수익' : '지출'}
                            <span className="text-[11px] font-normal ml-1.5 opacity-70">({(Math.abs(globalPnL) / amountKrw * 100).toFixed(2)}%)</span>
                          </p>
                          {isUsdtPath && exchangeRateDiff != null && (
                            <div className="mt-2 pt-2 border-t border-[rgba(180,110,50,0.08)] space-y-1.5">
                              <div className="flex justify-between items-center text-[10px]">
                                <span className="text-label-tertiary">거래소·출금 수수료</span>
                                <span className="num text-acc-red">-{formatFeeKrw(resultPath.total_fee_krw)}</span>
                              </div>
                              {Math.abs(exchangeRateDiff) > 50 && (() => {
                                const upbitUsdt = liveUsdtKrw;
                                // usd_krw_rate는 개별 경로가 아닌 응답 최상위에 있음
                                const forexRate = global ? allData?.byGlobal?.[global]?.usd_krw_rate ?? null : null;
                                const usdtPremiumPct = upbitUsdt && forexRate
                                  ? ((upbitUsdt / forexRate) - 1) * 100 : null;
                                // 업비트 USDT < 포렉스 → 테더 할인 → 사용자 이득(초록)
                                // 업비트 USDT > 포렉스 → 테더 프리미엄 → 사용자 손실(빨강)
                                const isUsdtDiscount = usdtPremiumPct != null ? usdtPremiumPct < 0 : exchangeRateDiff < 0;
                                return (
                                  <div className="space-y-1">
                                    <div className="flex justify-between items-center text-[10px]">
                                      <span className="text-label-tertiary">테더/원달러 환율 차이</span>
                                      <span className={`num ${isUsdtDiscount ? 'text-acc-green' : 'text-acc-red'}`}>
                                        {isUsdtDiscount ? '+' : '-'}
                                        {formatFeeKrw(Math.abs(exchangeRateDiff))}
                                      </span>
                                    </div>
                                    <div className="rounded-xl bg-fill-secondary px-3 py-2 space-y-1">
                                      <div className="flex justify-between text-[9px]">
                                        <span className="text-label-tertiary">업비트 USDT <span className="opacity-60">(upbit)</span></span>
                                        <span className="num text-label-secondary font-medium">
                                          {upbitUsdt ? `₩${formatNumber(Math.round(upbitUsdt))}` : '-'}
                                        </span>
                                      </div>
                                      <div className="flex justify-between text-[9px]">
                                        <span className="text-label-tertiary">달러 포렉스 <span className="opacity-60">(dunamu)</span></span>
                                        <span className="num text-label-secondary font-medium">
                                          {forexRate ? `₩${formatNumber(Math.round(forexRate))}` : '-'}
                                        </span>
                                      </div>
                                      {usdtPremiumPct != null && (
                                        <div className="flex justify-between text-[9px] pt-0.5 border-t border-[rgba(180,110,50,0.06)]">
                                          <span className="text-label-tertiary">테더 프리미엄</span>
                                          <span className={`num font-semibold ${usdtPremiumPct > 0 ? 'text-acc-red' : 'text-acc-green'}`}>
                                            {usdtPremiumPct > 0 ? '+' : ''}{usdtPremiumPct.toFixed(2)}%
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                        );
                      })()}
                    </div>
                  );
                })()}
                </div>
              </motion.div>

              {/* Route path visualization */}
              <div>
                <SectionLabel>이동 경로</SectionLabel>
                <div className="ios-card rounded-2xl p-4">
                  <div className="flex items-center gap-1 flex-wrap">
                    {/* 국내 거래소 */}
                    <div className="flex flex-col items-center">
                      <ExFavicon id={resultPath.korean_exchange} size={24} />
                      <p className="text-[10px] text-label-secondary mt-1">{fmtEx(resultPath.korean_exchange)}</p>
                    </div>
                    <div className="flex flex-col items-center px-1">
                      <ArrowRight className="w-3.5 h-3.5 text-label-tertiary" />
                      <p className="text-[9px] text-label-tertiary mt-1">
                        {resultPath.transfer_coin === 'BTC'
                          ? (!usesGlobal && swapSvc === '__direct__' ? 'BTC Lightning' : '비트코인')
                          : resultPath.transfer_coin}
                      </p>
                    </div>
                    {/* 해외 거래소 (글로벌 경유 경로만) */}
                    {usesGlobal && global && (
                      <>
                        <div className="flex flex-col items-center">
                          <ExFavicon id={global} size={24} />
                          <p className="text-[10px] text-label-secondary mt-1">{fmtEx(global)}</p>
                        </div>
                        {!isHoldOnGlobal && (
                          <div className="flex flex-col items-center px-1">
                            <ArrowRight className="w-3.5 h-3.5 text-label-tertiary" />
                            <p className="text-[9px] text-label-tertiary mt-1">
                              {swapSvc === '__direct__' ? 'BTC Lightning' : '비트코인'}
                            </p>
                          </div>
                        )}
                      </>
                    )}
                    {/* 스왑 서비스 (라이트닝, 제3자 서비스) */}
                    {swapSvc && swapSvc !== '__direct__' && (
                      <>
                        <div className="flex flex-col items-center">
                          <ExFavicon id={swapSvc} size={24} />
                          <p className="text-[10px] text-label-secondary mt-1">{fmtEx(swapSvc)}</p>
                        </div>
                        <div className="flex flex-col items-center px-1">
                          <ArrowRight className="w-3.5 h-3.5 text-label-tertiary" />
                          <p className="text-[9px] text-label-tertiary mt-1">LN</p>
                        </div>
                      </>
                    )}
                    {/* 개인 지갑 (출금하지 않음 선택 시 숨김) */}
                    {!isHoldOnGlobal && (
                      <div className="flex flex-col items-center">
                        <div className="w-6 h-6 rounded-md bg-acc-green/15 flex items-center justify-center">
                          <Wallet weight="fill" className="w-3.5 h-3.5 text-acc-green" />
                        </div>
                        <p className="text-[10px] text-label-secondary mt-1">내 지갑</p>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 pt-3 border-t border-[rgba(180,110,50,0.08)] flex gap-3 text-[10px] text-label-tertiary flex-wrap">
                    <span className="flex items-center gap-1">네트워크 <NetworkIcon network={resultPath.network} size={12} /><span className="text-label-secondary font-medium">{resultPath.network}</span></span>
                    <span>출금 방식 <span className="text-label-secondary font-medium">{resultPath.global_exit_mode === 'lightning' ? '라이트닝' : '온체인'}</span></span>
                  </div>
                </div>
              </div>

              {/* Fee breakdown */}
              {resultPath.breakdown?.components && resultPath.breakdown.components.length > 0 && (
                <div>
                  <SectionLabel>수수료 내역</SectionLabel>
                  <div className="ios-card rounded-2xl divide-y divide-[rgba(180,110,50,0.08)]">
                    {resultPath.breakdown.components.map((c, i) => (
                      <div key={i} className="flex items-start justify-between px-4 py-3 gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-xs text-label-secondary leading-snug">{c.label}</p>
                            {c.is_fixed != null && (
                              <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
                                c.is_fixed
                                  ? 'bg-acc-blue/10 text-acc-blue'
                                  : 'bg-acc-amber/10 text-acc-amber'
                              }`}>
                                {c.is_fixed ? '고정' : '변동'}
                              </span>
                            )}
                          </div>
                          {fmtAmountText(c.amount_text) && (
                            <p className="text-[10px] text-label-tertiary num mt-0.5">{fmtAmountText(c.amount_text)}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-semibold text-acc-red num">
                            -{formatFeeKrw(c.amount_krw)}
                          </p>
                          {c.rate_pct != null && (
                            <p className="text-[10px] text-label-tertiary num mt-0.5">{c.rate_pct.toFixed(4)}%</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tags */}
              <div className="flex flex-wrap gap-1.5">
                {resultPath.domestic_kyc_status === 'kyc' && <Chip color="amber">국내 인증 필요</Chip>}
                {usesGlobal && resultPath.global_kyc_status === 'kyc'   && <Chip color="amber">해외 인증 필요</Chip>}
                {usesGlobal && resultPath.global_kyc_status === 'non_kyc' && <Chip color="green">해외 인증 불필요</Chip>}
                {resultPath.global_exit_mode === 'lightning' && <Chip color="blue">라이트닝 출금</Chip>}
              </div>

              {/* Alternative paths recommendation */}
              {altPaths.length > 0 && (() => {
                const bestAlt = altPaths[0];
                const savingsKrw = domesticBtcKrw != null
                  ? Math.round(((bestAlt.btc_received ?? 0) - (resultPath.btc_received ?? 0)) * domesticBtcKrw)
                  : Math.round(resultPath.total_fee_krw - bestAlt.total_fee_krw);
                return (
                  <div>
                    <button
                      onClick={() => setShowAltPaths(v => !v)}
                      className="w-full rounded-2xl px-4 py-3.5 flex items-center justify-between gap-3 text-left bg-acc-green/10 border border-acc-green/30"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-acc-green/20 flex items-center justify-center flex-shrink-0">
                          <TrendDown className="w-4.5 h-4.5 text-acc-green" weight="bold" />
                        </div>
                        <div>
                          <p className="text-[11px] text-acc-green font-medium">더 저렴한 경로가 있어요</p>
                          <p className="text-base font-bold text-acc-green num">
                            ₩{formatNumber(savingsKrw)} <span className="text-sm font-semibold">절약 가능</span>
                          </p>
                          <p className="text-[10px] text-acc-green/70 mt-0.5">
                            {altPaths.length}개 경로 {showAltPaths ? '접기' : '보기'} →
                          </p>
                        </div>
                      </div>
                      <CaretDown className={`w-4 h-4 text-acc-green/60 flex-shrink-0 transition-transform duration-200 ${showAltPaths ? 'rotate-180' : ''}`} />
                    </button>

                    {showAltPaths && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                        className="mt-2 space-y-2"
                      >
                        {altPaths.map((p, i) => {
                          const altSavingsKrw = domesticBtcKrw != null
                            ? Math.round(((p.btc_received ?? 0) - (resultPath.btc_received ?? 0)) * domesticBtcKrw)
                            : Math.round(resultPath.total_fee_krw - p.total_fee_krw);
                          return (
                            <div key={p.path_id ?? i} className="ios-card rounded-2xl px-4 py-3">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-1 flex-wrap min-w-0 flex-1">
                                  <ExFavicon id={p.korean_exchange} size={16} />
                                  <span className="text-[10px] text-label-secondary font-medium">{fmtEx(p.korean_exchange)}</span>
                                  <ArrowRight className="w-2.5 h-2.5 text-label-tertiary flex-shrink-0" />
                                  <span className="text-[10px] text-label-tertiary">{p.transfer_coin === 'BTC' ? '비트코인' : p.transfer_coin}</span>
                                  {p.transfer_coin === 'USDT' && p._g && (
                                    <>
                                      <ArrowRight className="w-2.5 h-2.5 text-label-tertiary flex-shrink-0" />
                                      <ExFavicon id={p._g} size={16} />
                                      <span className="text-[10px] text-label-secondary font-medium">{fmtEx(p._g)}</span>
                                    </>
                                  )}
                                  <ArrowRight className="w-2.5 h-2.5 text-label-tertiary flex-shrink-0" />
                                  <NetworkIcon network={p.network} size={12} />
                                  <span className="text-[10px] text-label-tertiary">{p.network}</span>
                                  {p.global_exit_mode === 'lightning' && (
                                    <span className="text-[9px] bg-acc-amber/10 text-acc-amber px-1.5 py-0.5 rounded-full font-medium">라이트닝</span>
                                  )}
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-xs font-bold text-acc-green num">+₩{formatNumber(altSavingsKrw)}</p>
                                  <p className="text-[10px] text-label-tertiary num mt-0.5">{formatPercent(p.fee_pct)}</p>
                                </div>
                              </div>
                              <div className="mt-1.5 flex gap-3 text-[10px] text-label-tertiary">
                                <span>수수료 <span className="text-acc-red num font-medium">-{formatFeeKrw(p.total_fee_krw)}</span></span>
                                <span>수령 <span className="text-label-primary num font-medium">{formatNumber(Math.round((p.btc_received ?? 0) * SATS_PER_BTC))} sats</span></span>
                              </div>
                            </div>
                          );
                        })}
                      </motion.div>
                    )}
                  </div>
                );
              })()}

              {/* Retry */}
              <button
                onClick={reset}
                className="w-full py-3.5 rounded-2xl bg-fill-secondary text-label-secondary text-sm font-semibold hover:bg-fill-primary transition-colors"
              >
                다시 탐색
              </button>
              <button onClick={handleBack} className="w-full py-2 text-sm text-label-tertiary hover:text-label-secondary transition-colors flex items-center justify-center gap-1.5">
                <ArrowLeft className="w-3.5 h-3.5" weight="bold" /> 이전으로
              </button>
    </>
  );
}
