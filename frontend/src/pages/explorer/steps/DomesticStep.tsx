import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, ArrowRight, Globe, Warning, CaretDown } from '@phosphor-icons/react';
import { fmtEx } from '../../../lib/exchangeNames';
import { getDomesticGates } from '../../../lib/gatemanRegistry';
import { DOMESTIC_INFO, SPRING_FAST, SPRING_SLOW } from '../constants';
import { ExFavicon, GatemanPanel, OptionCard } from '../ui';
import { useExplorer } from '../ExplorerContext';

export function DomesticStep() {
  const [showChecklist, setShowChecklist] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const {
    allData, domestic, setDomestic, setCoin, setGlobal, setNetwork, liveKimp, usdtPremium,
    kimpFetchedAt, btcPrice, withdrawalLimits, stepEndRef,
    scrollToStepEnd, snapshotKimp, koreaVolumeMap, domesticOptions, liveRegistry, handleBack, handleNext,
    cautionMap, carfMap,
  } = useExplorer();
  return (
    <>
              <div>
                <h1 className="text-2xl font-bold text-label-primary tracking-tight">국내 거래소</h1>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-sm text-label-secondary">출발 거래소를 선택해요</p>
                </div>
                <div className="ios-card rounded-2xl px-4 py-4 mt-2">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-[10px] text-label-tertiary uppercase tracking-wide">원달러 김치 프리미엄</p>
                      <p className="text-[9px] text-label-tertiary mt-0.5">원화로 달러(USDT)를 살 때 붙는 프리미엄이에요.</p>
                      {usdtPremium != null ? (
                        <p className={`text-3xl font-bold num mt-1 ${usdtPremium >= 0 ? 'text-acc-red' : 'text-acc-green'}`}>
                          {usdtPremium >= 0 ? '+' : ''}{usdtPremium.toFixed(2)}%
                        </p>
                      ) : (
                        <p className="text-3xl font-bold text-label-tertiary mt-1">–</p>
                      )}
                    </div>
                    <div className="text-right pb-0.5">
                      <p className="text-[10px] text-label-tertiary uppercase tracking-wide">비트코인 김치 프리미엄</p>
                      <p className="text-[9px] text-label-tertiary mt-0.5">한국 BTC가 해외 대비 얼마나 비싼지예요.</p>
                      <p className="text-xs text-label-secondary mt-1">거래소별 표시</p>
                      {kimpFetchedAt != null && (
                        <p className="text-[9px] text-label-tertiary num mt-0.5">
                          {new Date(kimpFetchedAt * 1000).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Seoul' })} 기준
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-2.5">
                {domesticOptions.map(({ exchange, best }, i) => {
                  const kimp = (liveKimp ?? snapshotKimp)[exchange] ?? null;
                  const takerFee = allData?.tickers.find(t =>
                    t.exchange === exchange && t.currency === 'KRW' && t.pair?.includes('BTC')
                  )?.taker_fee_pct ?? null;
                  return (
                    <motion.div
                      key={exchange}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ ...SPRING_SLOW, delay: i * 0.04 }}
                    >
                      <OptionCard
                        selected={domestic === exchange}
                        onClick={() => { setDomestic(exchange); setCoin(null); setGlobal(null); setNetwork(null); setShowChecklist(false); setShowInfo(false); scrollToStepEnd(); }}
                      >
                        <div className="flex items-center gap-2.5 mb-2.5">
                          <ExFavicon id={exchange} size={22} />
                          <p className="text-sm font-semibold text-label-primary">{fmtEx(exchange)}</p>
                          {cautionMap[exchange]?.caution && (
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-acc-red/10 text-acc-red flex-shrink-0">유의</span>
                          )}
                        </div>
                        {cautionMap[exchange]?.caution && cautionMap[exchange].reason && (
                          <p className="text-[11px] text-acc-red mb-2 leading-relaxed">{cautionMap[exchange].reason}</p>
                        )}
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <p className="text-[9px] text-label-tertiary uppercase tracking-wide">24시간 거래량</p>
                            <p className="text-xs font-medium text-label-primary num mt-0.5">
                              {koreaVolumeMap[exchange] != null
                                ? `${(koreaVolumeMap[exchange]! / 1_0000_0000).toFixed(1)}억원`
                                : '–'}
                            </p>
                          </div>
                          <div>
                            <p className="text-[9px] text-label-tertiary uppercase tracking-wide">거래 수수료</p>
                            <p className="text-xs font-medium text-label-primary num mt-0.5">
                              {takerFee != null ? `${takerFee.toFixed(2)}%` : '–'}
                            </p>
                          </div>
                          <div>
                            <p className="text-[9px] text-label-tertiary uppercase tracking-wide">BTC 김프</p>
                            <p className={`text-sm font-bold num mt-0.5 ${kimp == null ? 'text-label-tertiary' : kimp > 2 ? 'text-acc-red' : kimp > 0 ? 'text-acc-amber' : 'text-acc-green'}`}>
                              {kimp != null ? `${kimp >= 0 ? '+' : ''}${kimp.toFixed(2)}%` : '–'}
                            </p>
                          </div>
                        </div>
                      </OptionCard>
                    </motion.div>
                  );
                })}
              </div>
              {domestic && (() => {
                const info = DOMESTIC_INFO[domestic];
                const apiLimits = withdrawalLimits[domestic] ?? null;
                const mergedLimits = {
                  krw_per_tx_limit: apiLimits?.krw_per_tx_limit ?? info?.krw_per_tx_limit ?? null,
                  btc_per_tx_max: apiLimits?.btc_per_tx_max ?? info?.btc_per_tx_max ?? null,
                  btc_daily_verified: (() => {
                    if (apiLimits?.krw_daily_verified_digital != null && btcPrice?.krw) {
                      return Math.round(apiLimits.krw_daily_verified_digital / btcPrice.krw * 100) / 100;
                    }
                    return apiLimits?.btc_daily_verified ?? info?.btc_daily_verified ?? null;
                  })(),
                  krw_daily_verified_digital: apiLimits?.krw_daily_verified_digital ?? null,
                  source: apiLimits?.source ?? 'static',
                };
                const vol = koreaVolumeMap[domestic];
                const kimp = (liveKimp ?? snapshotKimp)[domestic] ?? null;
                return (
                  <div className="space-y-2">
                    <button
                      onClick={() => setShowInfo(o => !o)}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-2xl ios-card border border-transparent hover:border-white/12 transition-colors"
                    >
                      <span className="text-sm font-semibold text-label-primary">{fmtEx(domestic)} 거래소 정보</span>
                      <motion.div animate={{ rotate: showInfo ? 180 : 0 }} transition={SPRING_FAST}>
                        <CaretDown className="w-4 h-4 text-label-tertiary" weight="bold" />
                      </motion.div>
                    </button>
                    <AnimatePresence>
                      {showInfo && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={SPRING_FAST}
                          className="overflow-hidden"
                        >
                          <div className="ios-card rounded-2xl p-4 space-y-3">
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div><span className="text-label-tertiary">소재 국가</span><p className="font-medium text-label-primary mt-0.5">{info?.country ?? '대한민국'}</p></div>
                              <div><span className="text-label-tertiary">CARF 시행</span><p className="font-medium text-label-primary mt-0.5">{carfMap[domestic] ?? info?.carf ?? 2027}년</p></div>
                              <div><span className="text-label-tertiary">연계 은행</span><p className="font-medium text-label-primary mt-0.5">{info?.bank ?? '–'}</p></div>
                              <div><span className="text-label-tertiary">라이트닝 지원</span><p className={`font-medium mt-0.5 ${info?.lightning ? 'text-acc-amber' : 'text-label-secondary'}`}>{info?.lightning ? '지원' : '미지원'}</p></div>
                              {vol != null && <div><span className="text-label-tertiary">24시간 비트코인 거래량</span><p className="font-medium text-label-primary mt-0.5 num">{(vol / 1_0000_0000).toFixed(1)}억원</p></div>}
                              {kimp != null && (
                                <div>
                                  <span className="text-label-tertiary">김치 프리미엄 <span className="text-[9px]">(원달러 기준)</span></span>
                                  <p className={`font-medium mt-0.5 num ${kimp > 2 ? 'text-acc-red' : kimp > 0 ? 'text-acc-amber' : 'text-acc-green'}`}>{kimp >= 0 ? '+' : ''}{kimp.toFixed(2)}%</p>
                                </div>
                              )}
                              {usdtPremium != null && (
                                <div>
                                  <span className="text-label-tertiary">원달러 프리미엄 <span className="text-[9px]">(테더)</span></span>
                                  <p className={`font-medium mt-0.5 num ${usdtPremium >= 0 ? 'text-acc-red' : 'text-acc-green'}`}>{usdtPremium >= 0 ? '+' : ''}{usdtPremium.toFixed(2)}%</p>
                                </div>
                              )}
                            </div>
                            {info && (
                              <div className="pt-2 border-t border-[rgba(180,110,50,0.08)] space-y-2">
                                <div className="flex items-center justify-between">
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-label-tertiary">온체인 출금 한도</p>
                                  {mergedLimits.source === 'playwright' ? (
                                    <span className="text-[9px] text-acc-green font-medium">최신 데이터</span>
                                  ) : (
                                    <span className="text-[9px] text-acc-amber font-medium">데이터 조회 불가</span>
                                  )}
                                </div>
                                {mergedLimits.source === 'playwright' ? (
                                  <>
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                      <div>
                                        <span className="text-label-tertiary">1회 KRW 기준 한도</span>
                                        <p className="font-medium text-label-primary mt-0.5 num">
                                          {mergedLimits.krw_per_tx_limit != null ? `${(mergedLimits.krw_per_tx_limit / 10000).toFixed(0)}만원` : '제한 없음'}
                                        </p>
                                      </div>
                                      <div>
                                        <span className="text-label-tertiary">1회 최대 BTC</span>
                                        <p className="font-medium text-label-primary mt-0.5 num">
                                          {mergedLimits.btc_per_tx_max != null ? `${mergedLimits.btc_per_tx_max} BTC` : '제한 없음'}
                                        </p>
                                      </div>
                                      <div>
                                        <span className="text-label-tertiary">일일 한도 (인증 완료)</span>
                                        <p className="font-medium text-label-primary mt-0.5 num">
                                          {mergedLimits.btc_daily_verified != null ? `${mergedLimits.btc_daily_verified} BTC/일` : '–'}
                                        </p>
                                        {mergedLimits.krw_daily_verified_digital != null && (
                                          <p className="text-[10px] text-label-tertiary mt-0.5 num">({(mergedLimits.krw_daily_verified_digital / 100_000_000).toFixed(0)}억원 기준)</p>
                                        )}
                                      </div>
                                    </div>
                                    {mergedLimits.krw_per_tx_limit != null && (
                                      <div className="flex items-start gap-2 p-2.5 rounded-xl bg-fill-secondary">
                                        <p className="text-[11px] text-label-secondary leading-relaxed">
                                          1회 출금 시 {(mergedLimits.krw_per_tx_limit / 10000).toFixed(0)}만원 초과분은 여러 트랜잭션으로 분할 출금됩니다.
                                        </p>
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <p className="text-[11px] text-label-tertiary leading-relaxed">최근 크롤링된 출금 한도 데이터가 없어요. 거래소 공식 페이지에서 직접 확인해 주세요.</p>
                                )}
                                <p className="text-[10px] text-label-tertiary">{info.personal_wallet_req}</p>
                                {info.source_note.startsWith('⚠️') && (
                                  <div className="flex items-start gap-1.5">
                                    <Warning className="w-3 h-3 text-acc-amber mt-0.5 flex-shrink-0" weight="fill" />
                                    <p className="text-[10px] text-acc-amber">{info.source_note.replace('⚠️ ', '')}</p>
                                  </div>
                                )}
                              </div>
                            )}
                            {vol != null && vol < 500_0000_0000 && (
                              <div className="flex items-start gap-2 p-2.5 rounded-xl bg-acc-amber/8 border border-acc-amber/15">
                                <Warning className="w-3.5 h-3.5 text-acc-amber mt-0.5 flex-shrink-0" weight="fill" />
                                <p className="text-[11px] text-label-secondary leading-relaxed">
                                  <span className="font-semibold text-acc-amber">슬리피지 주의</span> — 거래량이 적어 호가창이 얇습니다. 대규모 매수·매도 시 실제 체결가가 표시가보다 불리할 수 있습니다.
                                </p>
                              </div>
                            )}
                            {info?.url && (
                              <a href={info.url} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-[11px] text-acc-blue hover:underline">
                                <Globe className="w-3 h-3" /> {info.url.replace('https://', '')}
                              </a>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })()}
              {domestic && (
                <div className="space-y-2">
                  <button
                    onClick={() => setShowChecklist(!showChecklist)}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-2xl ios-card border border-transparent hover:border-white/12 transition-colors"
                  >
                    <span className="text-sm font-semibold text-label-primary">{fmtEx(domestic)} 출금 체크리스트</span>
                    <motion.div animate={{ rotate: showChecklist ? 180 : 0 }} transition={SPRING_FAST}>
                      <CaretDown className="w-4 h-4 text-label-tertiary" weight="bold" />
                    </motion.div>
                  </button>
                  <AnimatePresence>
                    {showChecklist && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={SPRING_FAST}
                        className="overflow-hidden"
                      >
                        <GatemanPanel
                          gates={getDomesticGates(domestic, liveRegistry?.domestic)}
                          title={`${fmtEx(domestic)} 출금 체크리스트`}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
              {domestic && (
                <motion.button
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={SPRING_FAST}
                  onClick={() => handleNext('domestic')}
                  className="w-full py-3.5 rounded-2xl font-bold text-sm bg-acc-amber text-white shadow-glow-amber cursor-pointer flex items-center justify-center gap-2"
                >
                  다음 <ArrowRight className="w-4 h-4" />
                </motion.button>
              )}
              <button onClick={handleBack} className="w-full py-2 text-sm text-label-tertiary hover:text-label-secondary transition-colors flex items-center justify-center gap-1.5">
                <ArrowLeft className="w-3.5 h-3.5" weight="bold" /> 이전으로
              </button>
              <div ref={stepEndRef} />
    </>
  );
}
