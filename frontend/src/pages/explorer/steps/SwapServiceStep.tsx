import { motion } from 'motion/react';
import { ArrowLeft, ArrowRight, ArrowSquareOut, Globe, Lightning } from '@phosphor-icons/react';
import { fmtEx, getExchangeDomain, getLightningServiceInfo } from '../../../lib/exchangeNames';
import { SPRING_FAST, SPRING_SLOW } from '../constants';
import { ExFavicon, OptionCard } from '../ui';
import { useExplorer } from '../ExplorerContext';

export function SwapServiceStep() {
  const {
    swapSvc, setSwapSvc, scrollToStepEnd, swapServiceOptions, handleBack, handleNext,
  } = useExplorer();
  return (
    <>
              <div>
                <h1 className="text-2xl font-bold text-label-primary tracking-tight">스왑 서비스</h1>
                <p className="text-sm text-label-secondary mt-1">라이트닝 → 온체인 변환 서비스를 선택해요</p>
              </div>
              <div className="space-y-2.5">
                {swapServiceOptions.filter(o => o.name !== '__direct__').length === 0 && !swapServiceOptions.find(o => o.name === '__direct__') ? (
                  <div className="ios-card rounded-2xl p-5 text-center space-y-2">
                    <p className="text-sm font-semibold text-label-secondary">사용 가능한 스왑 서비스 없음</p>
                    <p className="text-xs text-label-tertiary">현재 라이트닝 스왑 서비스 데이터를 불러오지 못했습니다. 다시 시도하거나 온체인 출금을 선택해주세요.</p>
                    <button
                      onClick={handleBack}
                      className="mt-2 text-xs text-acc-amber font-semibold underline underline-offset-2"
                    >
                      출금 방식 다시 선택
                    </button>
                  </div>
                ) : swapServiceOptions.map(({ name, fee_pct, kyc, btc_received, source_url }, i) => {
                  const isSelected = swapSvc === name;
                  const isDirect = name === '__direct__';

                  if (isDirect) {
                    return (
                      <motion.div key="__direct__"
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ ...SPRING_SLOW, delay: i * 0.06 }}>
                        <OptionCard
                          selected={isSelected}
                          onClick={() => { setSwapSvc('__direct__'); scrollToStepEnd(); }}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <div className="w-5 h-5 rounded-md bg-acc-green/15 flex items-center justify-center">
                                  <Lightning weight="fill" className="w-3 h-3 text-acc-green" />
                                </div>
                                <p className="text-sm font-bold text-label-primary">직접 출금 (스왑 없음)</p>
                              </div>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <span className="text-[10px] text-acc-green font-semibold">스왑 수수료 없음</span>
                                <span className="text-[10px] bg-acc-green/10 text-acc-green px-1.5 py-0.5 rounded-full">개인 LN 지갑 필요</span>
                              </div>
                            </div>
                          </div>
                          {isSelected && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              transition={SPRING_FAST}
                              className="mt-3 pt-3 border-t border-[rgba(180,110,50,0.12)] space-y-1 overflow-hidden"
                            >
                              <p className="text-[11px] text-label-secondary leading-relaxed">
                                글로벌 거래소에서 개인 라이트닝 지갑으로 직접 출금합니다. 스왑 서비스 없이 라이트닝 출금 수수료만 발생합니다.
                                Phoenix, Breez 등 자기 관리형 라이트닝 지갑이 필요합니다.
                              </p>
                            </motion.div>
                          )}
                        </OptionCard>
                      </motion.div>
                    );
                  }

                  const svcInfo = getLightningServiceInfo(name);
                  const domain = getExchangeDomain(name);
                  const websiteUrl = source_url ?? (domain ? `https://${domain}` : null);
                  return (
                    <motion.div key={name}
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ ...SPRING_SLOW, delay: i * 0.06 }}>
                      <OptionCard
                        selected={isSelected}
                        onClick={() => { setSwapSvc(name); scrollToStepEnd(); }}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <ExFavicon id={name} size={20} />
                              <p className="text-sm font-bold text-label-primary">{fmtEx(name)}</p>
                              {websiteUrl && (
                                <a
                                  href={websiteUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-label-quaternary hover:text-acc-amber transition-colors"
                                >
                                  <ArrowSquareOut className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className="text-[10px] text-acc-amber font-semibold">{fee_pct.toFixed(2)}% 변동</span>
                              {kyc
                                ? <span className="text-[10px] bg-acc-amber/10 text-acc-amber px-1.5 py-0.5 rounded-full">인증 필요</span>
                                : <span className="text-[10px] bg-acc-green/10 text-acc-green px-1.5 py-0.5 rounded-full">인증 불필요</span>
                              }
                            </div>
                          </div>
                        </div>
                        {isSelected && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            transition={SPRING_FAST}
                            className="mt-3 pt-3 border-t border-[rgba(180,110,50,0.12)] space-y-2.5 overflow-hidden"
                          >
                            {svcInfo && (
                              <p className="text-[11px] text-label-secondary leading-relaxed">{svcInfo.description}</p>
                            )}
                            {svcInfo && svcInfo.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {svcInfo.tags.map(tag => (
                                  <span key={tag} className="text-[10px] bg-fill-secondary text-label-tertiary px-2 py-0.5 rounded-full">{tag}</span>
                                ))}
                              </div>
                            )}
                            {websiteUrl && (
                              <a
                                href={websiteUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 text-[11px] text-acc-amber font-medium hover:underline underline-offset-2"
                              >
                                <Globe className="w-3 h-3" />
                                {domain ?? websiteUrl}
                                <ArrowRight className="w-2.5 h-2.5 rotate-[-45deg]" />
                              </a>
                            )}
                          </motion.div>
                        )}
                      </OptionCard>
                    </motion.div>
                  );
                })}
              </div>
              {swapSvc && (
                <motion.button
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={SPRING_FAST}
                  onClick={() => handleNext('swap_service')}
                  className="w-full py-3.5 rounded-2xl font-bold text-sm bg-acc-amber text-white shadow-glow-amber cursor-pointer flex items-center justify-center gap-2"
                >
                  결과 보기 <ArrowRight className="w-4 h-4" />
                </motion.button>
              )}
              <button onClick={handleBack} className="w-full py-2 text-sm text-label-tertiary hover:text-label-secondary transition-colors flex items-center justify-center gap-1.5">
                <ArrowLeft className="w-3.5 h-3.5" weight="bold" /> 이전으로
              </button>
    </>
  );
}
