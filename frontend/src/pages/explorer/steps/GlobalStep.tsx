import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, ArrowRight, Globe, Warning, WarningCircle, CaretDown } from '@phosphor-icons/react';
import { fmtEx } from '../../../lib/exchangeNames';
import { getGlobalGates } from '../../../lib/gatemanRegistry';
import { GLOBAL_EXCHANGES, GLOBAL_INFO, RISK_LABEL, RISK_COLOR, SPRING_FAST, SPRING_SLOW } from '../constants';
import type { GlobalExchange } from '../constants';
import { ExFavicon, GatemanPanel, OptionCard } from '../ui';
import { useExplorer } from '../ExplorerContext';

export function GlobalStep() {
  const [showChecklist, setShowChecklist] = useState(false);
  const {
    domestic, global, setGlobal, setNetwork, setGlobalExitMethod, liveRegistry, stepEndRef,
    scrollToStepEnd, globalOptions, globalSupportsLightning, handleBack, handleNext,
    cautionMap, failedGlobalExchanges,
  } = useExplorer();

  // 조회 성공한 거래소 목록
  const successExchangeIds = new Set(globalOptions.map(o => o.exchange));
  // GLOBAL_EXCHANGES 순서 유지하며 실패 거래소만 추출
  const failedInOrder = GLOBAL_EXCHANGES.filter(
    g => failedGlobalExchanges.includes(g) && !successExchangeIds.has(g),
  );
  return (
    <>
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <ExFavicon id={domestic!} size={14} />
                  <ArrowRight className="w-3 h-3 text-label-tertiary" />
                  <Globe className="w-4 h-4 text-label-secondary" />
                </div>
                <h1 className="text-2xl font-bold text-label-primary tracking-tight">해외 거래소</h1>
                <p className="text-sm text-label-secondary mt-1">경유할 해외 거래소를 선택해요</p>
              </div>
              <div className="space-y-2.5">
                {globalOptions.map(({ exchange, best }, i) => {
                  const tradingComp = best.breakdown?.components.find(c =>
                    c.label.includes('BTC 매수') || c.label.includes('FDUSD 매수'),
                  );
                  return (
                    <motion.div key={exchange}
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ ...SPRING_SLOW, delay: i * 0.04 }}>
                      <OptionCard
                        selected={global === exchange}
                        onClick={() => { setGlobal(exchange as GlobalExchange); setNetwork(null); setGlobalExitMethod(null); setShowChecklist(false); scrollToStepEnd(); }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <ExFavicon id={exchange} size={22} />
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold text-label-primary">{fmtEx(exchange)}</p>
                                {cautionMap[exchange]?.caution && (
                                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-acc-red/10 text-acc-red flex-shrink-0">유의</span>
                                )}
                              </div>
                              {cautionMap[exchange]?.caution && cautionMap[exchange].reason && (
                                <p className="text-[11px] text-acc-red mt-0.5 leading-relaxed">{cautionMap[exchange].reason}</p>
                              )}
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                {tradingComp?.rate_pct != null && (
                                  <span className="text-[10px] text-label-tertiary num">
                                    거래 수수료 <span className="font-medium text-label-secondary">{tradingComp.rate_pct.toFixed(2)}%</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </OptionCard>
                    </motion.div>
                  );
                })}
                {failedInOrder.map((exchange, i) => (
                  <motion.div key={exchange}
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ ...SPRING_SLOW, delay: (globalOptions.length + i) * 0.04 }}>
                    <div className="rounded-2xl border border-fill-tertiary bg-fill-secondary/40 p-3.5 opacity-60">
                      <div className="flex items-center gap-2.5">
                        <ExFavicon id={exchange} size={22} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-label-secondary">{fmtEx(exchange)}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <WarningCircle className="w-3 h-3 text-acc-red flex-shrink-0" weight="fill" />
                            <p className="text-[11px] text-acc-red">조회 실패 — 데이터를 불러오지 못했어요</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
              {global && (() => {
                const info = GLOBAL_INFO[global];
                if (!info) return null;
                return (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={SPRING_SLOW}
                    className="ios-card rounded-2xl p-4 space-y-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-label-tertiary">거래소 정보</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-label-tertiary">소재 국가</span><p className="font-medium text-label-primary mt-0.5">{info.country}</p></div>
                      <div><span className="text-label-tertiary">CARF 시행</span><p className="font-medium text-label-primary mt-0.5">{info.carf}년</p></div>
                      <div><span className="text-label-tertiary">위험도</span>
                        <p className={`inline-flex items-center mt-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${RISK_COLOR[info.risk]}`}>
                          {RISK_LABEL[info.risk]}
                        </p>
                      </div>
                      {(() => {
                        const lnOk = globalSupportsLightning(global);
                        return <div><span className="text-label-tertiary">라이트닝 출금</span><p className={`font-medium mt-0.5 ${lnOk ? 'text-acc-amber' : 'text-label-secondary'}`}>{lnOk ? '지원' : '미지원'}</p></div>;
                      })()}
                      {info.fatca && <div><span className="text-label-tertiary">규제</span><p className="font-medium text-acc-red mt-0.5">FATCA</p></div>}
                      <div><span className="text-label-tertiary">24H 거래량 (참고)</span>
                        <p className="font-medium text-label-primary mt-0.5 num">~${info.vol24hB}억</p>
                      </div>
                    </div>
                    {info.vol24hB < 20 && (
                      <div className="flex items-start gap-2 p-2.5 rounded-xl bg-acc-amber/8 border border-acc-amber/15">
                        <Warning className="w-3.5 h-3.5 text-acc-amber mt-0.5 flex-shrink-0" weight="fill" />
                        <p className="text-[11px] text-label-secondary leading-relaxed">
                          <span className="font-semibold text-acc-amber">슬리피지 주의</span> — 24시간 거래량이 낮아 유동성이 부족합니다. BTC 매수 시 실제 체결가가 호가보다 불리할 수 있으며, 특히 거래 규모가 클수록 영향이 커집니다.
                        </p>
                      </div>
                    )}
                    <a href={info.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-[11px] text-acc-blue hover:underline">
                      <Globe className="w-3 h-3" /> {info.url.replace('https://', '')}
                    </a>
                  </motion.div>
                );
              })()}
              {global && (
                <div className="space-y-2">
                  <button
                    onClick={() => setShowChecklist(!showChecklist)}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-2xl ios-card border border-transparent hover:border-white/12 transition-colors"
                  >
                    <span className="text-sm font-semibold text-label-primary">{fmtEx(global)} 입출금 체크리스트</span>
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
                          gates={getGlobalGates(global, liveRegistry?.global)}
                          title={`${fmtEx(global)} 입출금 체크리스트`}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
              {global && (
                <motion.button
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={SPRING_FAST}
                  onClick={() => handleNext('global')}
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
