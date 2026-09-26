import { motion } from 'motion/react';
import { ArrowLeft, ArrowRight } from '@phosphor-icons/react';
import { ONCHAIN_GATES } from '../../../lib/gatemanRegistry';
import { SPRING_FAST, SPRING_SLOW } from '../constants';
import { OptionCard, GatemanPanel } from '../ui';
import { useExplorer } from '../ExplorerContext';

export function BtcMethodStep() {
  const {
    mode, btcMethod, setBtcMethod, liveRegistry, stepEndRef, scrollToStepEnd, handleBack,
    handleNext, hasLightningPaths, clearSellSelectionsAfter,
  } = useExplorer();
  const isSell = mode === 'sell';

  // 팔 때는 이 단계가 마법사의 첫 단계라, 방식을 바꾸면 뒤에서 고른 값이 모두 무효가 된다.
  function choose(method: 'onchain' | 'lightning') {
    setBtcMethod(method);
    if (isSell) clearSellSelectionsAfter('btc_method');
    scrollToStepEnd();
  }

  // 라이트닝 가용성의 근거가 방향마다 다르다.
  // 살 때는 국내 거래소가 라이트닝 '출금'을 지원하지 않아 언제나 불가다.
  // 팔 때는 라이트닝 입금을 받는 거래소(국내 또는 해외)로 가는 경로가 실제로 있는지로 판단한다.
  const lnAvailable = isSell ? hasLightningPaths : false;

  return (
    <>
              <div>
                <h1 className="text-2xl font-bold text-label-primary tracking-tight">
                  {isSell ? '전송 방식' : '출금 네트워크 방식'}
                </h1>
                <p className="text-sm text-label-secondary mt-1">
                  {isSell ? '개인 지갑의 비트코인을 어떻게 보낼까요?' : '비트코인을 어떻게 보낼까요?'}
                </p>
              </div>
              <div className="space-y-2.5">
                <OptionCard selected={btcMethod === 'onchain'} onClick={() => choose('onchain')}>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-fill-secondary flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-label-secondary">1</span>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-label-primary">{isSell ? '온체인 전송' : '온체인 출금'}</p>
                      <p className="text-xs text-label-secondary mt-0.5">Bitcoin 블록체인 네트워크로 직접 전송. 10분 내외 소요.</p>
                    </div>
                  </div>
                </OptionCard>
                <OptionCard
                  selected={btcMethod === 'lightning'}
                  onClick={() => { if (lnAvailable) choose('lightning'); }}
                  disabled={!lnAvailable}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-fill-secondary flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className={`text-xs font-bold ${lnAvailable ? 'text-label-secondary' : 'text-label-disabled'}`}>2</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-bold ${lnAvailable ? 'text-label-primary' : 'text-label-disabled'}`}>라이트닝</p>
                        {!lnAvailable && (
                          <span className="text-[10px] font-semibold bg-fill-secondary text-label-tertiary px-1.5 py-0.5 rounded-md">{isSell ? '지원 경로 없음' : '국내 거래소 미지원'}</span>
                        )}
                      </div>
                      <p className={`text-xs mt-0.5 ${lnAvailable ? 'text-label-secondary' : 'text-label-disabled'}`}>
                        {isSell
                          ? '즉시 결제 · 스왑 서비스로 라이트닝으로 바꾼 뒤 거래소로 입금'
                          : '즉시 결제 · 수수료 저렴 · 국내 거래소에서 직접 출금 불가'}
                      </p>
                    </div>
                  </div>
                </OptionCard>
              </div>

              {!lnAvailable && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-acc-brand/8 border border-acc-brand/15">
                  <span className="text-acc-brand mt-0.5 flex-shrink-0 text-sm">⚡</span>
                  <p className="text-[11px] text-label-secondary leading-relaxed">
                    {isSell ? (
                      <>
                        <span className="font-semibold text-acc-brand">라이트닝 입금 불가</span> — 지금 조회된 경로 중에 라이트닝 입금을 받는 거래소로 가는 경로가 없습니다. <span className="font-medium text-label-primary">온체인 전송</span>을 선택하세요.
                      </>
                    ) : (
                      <>
                        <span className="font-semibold text-acc-brand">라이트닝 출금 불가</span> — 국내 거래소(업비트, 빗썸 등)는 라이트닝 직접 출금을 지원하지 않습니다. 라이트닝 경로를 원하신다면 코인 선택 단계에서 <span className="font-medium text-label-primary">비트코인 → 해외거래소 경유</span>를 선택하세요.
                      </>
                    )}
                  </p>
                </div>
              )}

              {btcMethod === 'onchain' && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={SPRING_SLOW}
                  className="space-y-2.5">
                  <div className="ios-card rounded-2xl p-4 text-xs space-y-2">
                    <p className="font-semibold text-label-primary">{isSell ? '온체인 전송이란?' : '온체인 출금이란?'}</p>
                    <p className="text-label-secondary">Bitcoin 블록체인에 직접 기록되는 방식입니다. 10분 내외 소요됩니다.</p>
                    {/* 채굴 수수료를 누가 내는지가 방향에 따라 갈린다. 이 차이가 수수료 내역의 첫 항목을 만든다. */}
                    <p className="text-label-secondary">
                      {isSell
                        ? '보내는 쪽이 개인 지갑이므로 채굴자 수수료를 지갑에서 직접 냅니다. 합치는 잔액 조각(UTXO)이 많을수록 트랜잭션이 커져 수수료가 올라갑니다.'
                        : '거래소가 고정 출금 수수료를 부과하며, 채굴자 수수료(온체인 네트워크 수수료)는 그 출금 수수료에 포함되어 있습니다.'}
                    </p>
                  </div>
                  <GatemanPanel gates={liveRegistry?.onchain ?? ONCHAIN_GATES} title={isSell ? '온체인 전송 주의사항' : '온체인 출금 주의사항'} />
                </motion.div>
              )}

              {btcMethod !== null && (
                <motion.button
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={SPRING_FAST}
                  onClick={() => handleNext('btc_method')}
                  className="w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all bg-acc-brand text-white shadow-glow-brand cursor-pointer"
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
