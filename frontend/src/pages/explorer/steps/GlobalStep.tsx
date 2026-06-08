import { motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Globe, Warning } from '@phosphor-icons/react';
import { fmtEx } from '../../../lib/exchangeNames';
import { GLOBAL_INFO, RISK_LABEL, RISK_COLOR, SPRING_FAST, SPRING_SLOW } from '../constants';
import type { GlobalExchange } from '../constants';
import { ExFavicon, OptionCard } from '../ui';
import { useExplorer } from '../ExplorerContext';

export function GlobalStep() {
  const {
    domestic, global, setGlobal, setNetwork, setGlobalExitMethod, stepEndRef,
    scrollToStepEnd, globalOptions, globalSupportsLightning, handleBack, handleNext,
  } = useExplorer();
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
                  const wdComp = best.breakdown?.components.find(c =>
                    c.label.includes('BTC 출금') && c.is_fixed,
                  );
                  return (
                    <motion.div key={exchange}
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ ...SPRING_SLOW, delay: i * 0.04 }}>
                      <OptionCard
                        selected={global === exchange}
                        onClick={() => { setGlobal(exchange as GlobalExchange); setNetwork(null); setGlobalExitMethod(null); scrollToStepEnd(); }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <ExFavicon id={exchange} size={22} />
                            <div>
                              <p className="text-sm font-semibold text-label-primary">{fmtEx(exchange)}</p>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                {tradingComp?.rate_pct != null && (
                                  <span className="text-[10px] text-label-tertiary num">
                                    거래 수수료 <span className="font-medium text-label-secondary">{tradingComp.rate_pct.toFixed(2)}%</span>
                                  </span>
                                )}
                                {wdComp?.amount_text && (
                                  <span className="text-[10px] text-label-tertiary">
                                    출금 <span className="font-medium text-label-secondary">{wdComp.amount_text}</span>
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
