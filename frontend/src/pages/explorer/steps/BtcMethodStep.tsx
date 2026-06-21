import { motion } from 'motion/react';
import { ArrowLeft, ArrowRight } from '@phosphor-icons/react';
import { ONCHAIN_GATES } from '../../../lib/gatemanRegistry';
import { SPRING_FAST, SPRING_SLOW } from '../constants';
import { OptionCard, GatemanPanel } from '../ui';
import { useExplorer } from '../ExplorerContext';

export function BtcMethodStep() {
  const {
    btcMethod, setBtcMethod, liveRegistry, stepEndRef, scrollToStepEnd, handleBack,
    handleNext,
  } = useExplorer();
  return (
    <>
              <div>
                <h1 className="text-2xl font-bold text-label-primary tracking-tight">출금 네트워크 방식</h1>
                <p className="text-sm text-label-secondary mt-1">비트코인을 어떻게 보낼까요?</p>
              </div>
              <div className="space-y-2.5">
                <OptionCard selected={btcMethod === 'onchain'} onClick={() => { setBtcMethod('onchain'); scrollToStepEnd(); }}>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-fill-secondary flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-label-secondary">1</span>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-label-primary">온체인 출금</p>
                      <p className="text-xs text-label-secondary mt-0.5">Bitcoin 블록체인 네트워크로 직접 전송. 10분 내외 소요.</p>
                    </div>
                  </div>
                </OptionCard>
                <div className="ios-card rounded-2xl p-4 opacity-50 cursor-not-allowed">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-fill-secondary flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-label-secondary">2</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-label-primary">라이트닝</p>
                        <span className="text-[10px] font-semibold bg-fill-secondary text-label-tertiary px-1.5 py-0.5 rounded-md">국내 거래소 미지원</span>
                      </div>
                      <p className="text-xs text-label-secondary mt-0.5">즉시 결제 · 수수료 저렴 · 국내 거래소에서 직접 출금 불가</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2 p-3 rounded-xl bg-acc-amber/8 border border-acc-amber/15">
                <span className="text-acc-amber mt-0.5 flex-shrink-0 text-sm">⚡</span>
                <p className="text-[11px] text-label-secondary leading-relaxed">
                  <span className="font-semibold text-acc-amber">라이트닝 출금 불가</span> — 국내 거래소(업비트, 빗썸 등)는 라이트닝 직접 출금을 지원하지 않습니다. 라이트닝 경로를 원하신다면 코인 선택 단계에서 <span className="font-medium text-label-primary">비트코인 → 해외거래소 경유</span>를 선택하세요.
                </p>
              </div>

              {btcMethod === 'onchain' && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={SPRING_SLOW}
                  className="space-y-2.5">
                  <div className="ios-card rounded-2xl p-4 text-xs space-y-2">
                    <p className="font-semibold text-label-primary">온체인 출금이란?</p>
                    <p className="text-label-secondary">Bitcoin 블록체인에 직접 기록되는 방식입니다. 거래소가 고정 출금 수수료를 부과하며, 10분 내외 소요됩니다.</p>
                    <p className="text-label-secondary">채굴자 수수료(온체인 네트워크 수수료)는 거래소 출금 수수료에 포함되어 있습니다.</p>
                  </div>
                  <GatemanPanel gates={liveRegistry?.onchain ?? ONCHAIN_GATES} title="온체인 출금 주의사항" />
                </motion.div>
              )}

              {btcMethod !== null && (
                <motion.button
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={SPRING_FAST}
                  onClick={() => handleNext('btc_method')}
                  className="w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all bg-acc-amber text-white shadow-glow-amber cursor-pointer"
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
