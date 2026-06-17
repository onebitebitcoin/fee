import { motion } from 'motion/react';
import { ArrowLeft, ArrowRight, CaretDown, Lightning, TrendDown, Wallet, Warning, Wrench } from '@phosphor-icons/react';
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
  // 라이트닝 지갑 종착: LN 출금까지만(스왑·온체인 없음) → 종착 노드 라벨/아이콘이 달라진다.
  const isLnWallet = resultPath.destination === 'lightning_wallet';
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
                <div className="rounded-2xl px-4 py-3 flex items-start gap-3 bg-fill-secondary border border-fill-tertiary/40">
                  <div className="w-7 h-7 rounded-full bg-fill-tertiary flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Wrench weight="fill" className="w-3.5 h-3.5 text-label-tertiary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-bold text-label-secondary mb-1">
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
                  <div className="w-10 h-10 rounded-full bg-fill-secondary border border-fill-tertiary/50 flex items-center justify-center mx-auto mb-4 relative z-10">
                    <Wrench weight="fill" className="w-5 h-5 text-label-tertiary" />
                  </div>
                ) : (
                  <Wallet weight="fill" className="w-8 h-8 text-acc-amber mx-auto mb-4 relative z-10" />
                )}
                <p className="text-xs text-label-tertiary uppercase tracking-wider mb-2 relative z-10">예상 수령</p>
                <p className={`text-5xl font-bold num leading-none relative z-10 ${isDisabled ? 'text-label-tertiary' : 'text-label-primary'}`}>
                  {formatNumber(displaySats)}
                </p>
                <p className="text-sm text-label-tertiary mt-1 num relative z-10">sats</p>
                <p className="text-[10px] text-label-quaternary mt-1 relative z-10">1 BTC = 100,000,000 sats</p>
                <div className="sep mt-5 mb-4 relative z-10" />

                {(() => {
                  const kimchi = domestic ? ((liveKimp ?? snapshotKimp)[domestic] ?? null) : null;
                  const satsKrw = domesticBtcKrw != null && resultPath.btc_received != null
                    ? Math.round(resultPath.btc_received * domesticBtcKrw)
                    : null;
                  const krwPnL = satsKrw != null ? satsKrw - amountKrw : null;

                  // USDT 경로: 글로벌 BTC를 '진짜 원달러(두나무 포렉스)' 환율로 환산해
                  // 테더 프리미엄(업비트 USDT vs 포렉스)이 globalPnL에 실제 금액으로 드러나게 한다.
                  // 매수 계산은 backend가 업비트 USDT 환율로 일관 처리 → 부호는 테더 프리미엄 방향으로 안정.
                  // BTC 경로는 김프 기반 평가 유지.
                  const isUsdtPath = resultPath.transfer_coin === 'USDT';
                  const gd = global ? allData?.byGlobal?.[global] : null;
                  const globalBtcUsd = gd && !('error' in gd) ? gd.global_btc_price_usd ?? null : null;
                  const upbitUsdt = liveUsdtKrw;
                  // usd_krw_rate(두나무 포렉스)는 개별 경로가 아닌 응답 최상위에 있음
                  const forexRate = global ? allData?.byGlobal?.[global]?.usd_krw_rate ?? null : null;
                  const usdtPremiumPct = upbitUsdt && forexRate
                    ? ((upbitUsdt / forexRate) - 1) * 100 : null;
                  const globalBtcKrw = isUsdtPath && forexRate && globalBtcUsd
                    ? globalBtcUsd * forexRate
                    : (domesticBtcKrw != null && kimchi != null
                        ? domesticBtcKrw / (1 + kimchi / 100)
                        : null);
                  const satsGlobalKrw = globalBtcKrw != null && resultPath.btc_received != null
                    ? Math.round(resultPath.btc_received * globalBtcKrw)
                    : null;
                  const globalPnL = satsGlobalKrw != null ? satsGlobalKrw - amountKrw : null;

                  return (
                    <div className="space-y-2 relative z-10 w-full">
                      <div className="ios-card rounded-2xl px-4 py-3 text-left">
                        <p className="text-[10px] text-label-tertiary uppercase tracking-wide mb-1.5">
                          수수료 합계{isUsdtPath && <span className="normal-case font-normal ml-1.5 text-[9px] opacity-80">· 원달러 환산</span>}
                        </p>
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
                        // USDT 경로: globalPnL과 수수료 차이 = 테더/원달러 환율 차이 효과
                        // globalPnL = btc_received × globalBtcKrw - amountKrw (음수 = 손실)
                        // exchangeRateDiff < 0 → 국내 USDT 환율이 포렉스보다 비쌈 (추가 비용)
                        const exchangeRateDiff = isUsdtPath ? (globalPnL + resultPath.total_fee_krw) : null;
                        return (
                        <div className="ios-card rounded-2xl px-4 py-3 text-left">
                          <p className="text-[10px] text-label-tertiary uppercase tracking-wide mb-1.5">
                            글로벌 시세 기준
                            <span className="ml-1.5 normal-case font-normal">
                              ({isUsdtPath && usdtPremiumPct != null ? (
                                <>원달러 프리미엄 <span className={usdtPremiumPct >= 0 ? 'text-acc-red' : 'text-acc-green'}>{usdtPremiumPct >= 0 ? '+' : ''}{usdtPremiumPct.toFixed(2)}%</span></>
                              ) : (
                                <>김치 프리미엄 <span className={kimchi! >= 0 ? 'text-acc-red' : 'text-acc-green'}>{kimchi! >= 0 ? '+' : ''}{kimchi!.toFixed(2)}%</span></>
                              )}
                              <span className="text-[9px] text-label-tertiary"> / 원달러 환산</span>)
                            </span>
                          </p>
                          <p className="text-xs text-label-secondary leading-relaxed">
                            같은 비트코인을 글로벌 시세(원달러 환산)로 평가하면 <span className="num font-semibold text-label-primary">₩{formatNumber(satsGlobalKrw!)}</span>
                          </p>
                          <p className={`text-sm font-bold num mt-1 ${globalPnL >= 0 ? 'text-acc-green' : 'text-acc-red'}`}>
                            {globalPnL >= 0 ? '▲' : '▼'} ₩{formatNumber(Math.abs(globalPnL))} {globalPnL >= 0 ? '수익' : '지출'}
                            <span className="text-[11px] font-normal ml-1.5 opacity-70">({(Math.abs(globalPnL) / amountKrw * 100).toFixed(2)}%)</span>
                          </p>
                          {isUsdtPath && exchangeRateDiff != null && (() => {
                            // upbitUsdt/forexRate/usdtPremiumPct는 상단에서 계산됨.
                            // 환율 차이 = 테더 프리미엄이 거래금액에 적용된 실제 손익. >₩50일 때 노출.
                            const showRateDiff = Math.abs(exchangeRateDiff) > 50;
                            return (
                            <div className="mt-2 pt-2 border-t border-[rgba(180,110,50,0.08)] space-y-1.5">
                              <div className="flex justify-between items-center text-[10px]">
                                <span className="text-label-tertiary">거래소·출금 수수료 <span className="text-[9px] opacity-70">(원달러 환산)</span></span>
                                <span className="num text-acc-red">-{formatFeeKrw(resultPath.total_fee_krw)}</span>
                              </div>
                              {showRateDiff && (
                                <div className="flex justify-between items-center text-[10px]">
                                  <span className="text-label-tertiary">원달러 프리미엄 차이</span>
                                  <span className={`num ${exchangeRateDiff < 0 ? 'text-acc-red' : 'text-acc-green'}`}>
                                    {exchangeRateDiff < 0 ? '-' : '+'}
                                    {formatFeeKrw(Math.abs(exchangeRateDiff))}
                                  </span>
                                </div>
                              )}
                              {usdtPremiumPct != null && (
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
                                  <div className="flex justify-between text-[9px] pt-0.5 border-t border-[rgba(180,110,50,0.06)]">
                                    <span className="text-label-tertiary">원달러 프리미엄</span>
                                    <span className={`num font-semibold ${usdtPremiumPct > 0 ? 'text-acc-red' : 'text-acc-green'}`}>
                                      {usdtPremiumPct > 0 ? '+' : ''}{usdtPremiumPct.toFixed(2)}%
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                            );
                          })()}
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
                          ? (!usesGlobal && isLnWallet ? 'BTC Lightning' : '비트코인')
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
                              {/* 글로벌 출금 레그 = global_exit_mode 기준 (라이트닝이면 스왑 서비스로도 LN 진입) */}
                              {resultPath.global_exit_mode === 'lightning' ? 'BTC Lightning' : '비트코인'}
                            </p>
                          </div>
                        )}
                      </>
                    )}
                    {/* 스왑 서비스 (개인지갑 종착, 제3자 LN→온체인 스왑) */}
                    {swapSvc && !isLnWallet && (
                      <>
                        <div className="flex flex-col items-center">
                          <ExFavicon id={swapSvc} size={24} />
                          <p className="text-[10px] text-label-secondary mt-1">{fmtEx(swapSvc)}</p>
                        </div>
                        <div className="flex flex-col items-center px-1">
                          <ArrowRight className="w-3.5 h-3.5 text-label-tertiary" />
                          {/* 스왑 출력 = 온체인 BTC (LN→온체인 변환 후 개인지갑 수신) */}
                          <p className="text-[9px] text-label-tertiary mt-1">비트코인</p>
                        </div>
                      </>
                    )}
                    {/* 종착지: 라이트닝 지갑 / 개인 지갑 (출금하지 않음 선택 시 숨김) */}
                    {!isHoldOnGlobal && (
                      <div className="flex flex-col items-center">
                        <div className={`w-6 h-6 rounded-md flex items-center justify-center ${isLnWallet ? 'bg-acc-amber/15' : 'bg-acc-green/15'}`}>
                          {isLnWallet
                            ? <Lightning weight="fill" className="w-5 h-5 text-acc-amber" />
                            : <Wallet weight="fill" className="w-5 h-5 text-acc-green" />}
                        </div>
                        <p className="text-[10px] text-label-secondary mt-1">{isLnWallet ? '라이트닝 지갑' : '내 지갑'}</p>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 pt-3 border-t border-[rgba(180,110,50,0.08)] flex gap-3 text-[10px] text-label-tertiary flex-wrap">
                    {/* 출금 네트워크 = 최종 출금 레그 기준 (출금 방식과 동일 레그). 라이트닝이면 Lightning. */}
                    {(() => {
                      const exitNet = resultPath.global_exit_mode === 'lightning'
                        ? 'Lightning'
                        : (resultPath.global_exit_network || resultPath.network);
                      return (
                        <span className="flex items-center gap-1">출금 네트워크 <NetworkIcon network={resultPath.global_exit_mode === 'lightning' ? 'lightning' : exitNet} size={12} /><span className="text-label-secondary font-medium">{exitNet}</span></span>
                      );
                    })()}
                    <span>출금 방식 <span className="text-label-secondary font-medium">{resultPath.global_exit_mode === 'lightning' ? '라이트닝' : '온체인'}</span></span>
                  </div>
                </div>
              </div>

              {/* Fee breakdown */}
              {resultPath.breakdown?.components && resultPath.breakdown.components.length > 0 && (
                <div>
                  <SectionLabel>수수료 내역</SectionLabel>
                  <p className="text-[10px] text-label-tertiary mb-2 -mt-1">
                    <span className="inline-flex items-center gap-1 mr-2"><span className="bg-acc-blue/10 text-acc-blue px-1.5 py-0.5 rounded-full text-[9px] font-semibold">고정</span>이동 금액과 무관한 정액</span>
                    <span className="inline-flex items-center gap-1"><span className="bg-acc-amber/10 text-acc-amber px-1.5 py-0.5 rounded-full text-[9px] font-semibold">변동</span>이동 금액의 비율(%)</span>
                  </p>
                  <div className="ios-card rounded-2xl divide-y divide-[rgba(180,110,50,0.08)]">
                    {resultPath.breakdown.components.map((c, i) => (
                      <div key={i} className="flex items-start justify-between px-4 py-3 gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-xs text-label-secondary leading-snug">{c.label}</p>
                            {c.is_fixed != null && (
                              <span
                                title={c.is_fixed ? '이동 금액에 관계없이 항상 동일한 고정 금액' : '이동 금액에 비례하는 비율(%) 수수료 — 금액이 커질수록 수수료도 증가'}
                                className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full cursor-help ${
                                  c.is_fixed
                                    ? 'bg-acc-blue/10 text-acc-blue'
                                    : 'bg-acc-amber/10 text-acc-amber'
                                }`}>
                                {c.is_fixed ? '고정' : '변동'}
                              </span>
                            )}
                          </div>
                          {c.move_amount != null && c.move_coin && (
                            <p className="text-[10px] text-label-secondary num mt-0.5">
                              이동 {c.move_coin === 'BTC' ? c.move_amount.toFixed(8) : c.move_amount.toFixed(2)} {c.move_coin}
                              {c.move_amount_krw != null && (
                                <span className="text-label-tertiary"> ≈ ₩{formatNumber(c.move_amount_krw)}</span>
                              )}
                            </p>
                          )}
                          {fmtAmountText(c.amount_text) && (
                            <p className="text-[10px] text-label-tertiary num mt-0.5">수수료 {fmtAmountText(c.amount_text)}</p>
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
                    {resultPath.discarded_krw != null && resultPath.discarded_krw > 0 && (
                      <div className="flex items-center justify-between px-4 py-3 gap-3">
                        <p className="text-xs text-label-secondary leading-snug">
                          최소주문 잔돈 <span className="text-[9px] text-label-tertiary">(못 쓰고 남음 · 근사)</span>
                        </p>
                        <p className="text-xs font-semibold text-label-tertiary num shrink-0">≈ ₩{formatNumber(resultPath.discarded_krw)}</p>
                      </div>
                    )}
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
                                  <NetworkIcon network={p.global_exit_mode === 'lightning' ? 'lightning' : (p.global_exit_network || p.network)} size={12} />
                                  <span className="text-[10px] text-label-tertiary">
                                    {p.global_exit_mode === 'lightning' ? 'Lightning' : (p.global_exit_network || p.network)}
                                  </span>
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
