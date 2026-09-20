import { motion } from 'motion/react';
import { ArrowLeft, ArrowRight } from '@phosphor-icons/react';
import { fmtEx } from '../../../lib/exchangeNames';
import { SPRING_FAST } from '../constants';
import { ExFavicon, OptionCard } from '../ui';
import { useExplorer } from '../ExplorerContext';

export function GlobalExitMethodStep() {
  const {
    mode, coin, global, setNetwork, globalExitMethod, setGlobalExitMethod, stepEndRef,
    scrollToStepEnd, hasLightningPaths, handleBack, handleNext,
  } = useExplorer();
  if (!global) return null;
  const isSell = mode === 'sell';
  const lnAvailable = hasLightningPaths;

  return (
    <>
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <ExFavicon id={global} size={14} />
                  <p className="text-xs text-label-secondary">{fmtEx(global)}</p>
                </div>
                <h1 className="text-2xl font-bold text-label-primary tracking-tight">
                  {isSell ? '전송 방식' : '출금 방식'}
                </h1>
                <p className="text-sm text-label-secondary mt-1">
                  {isSell
                    ? '개인 지갑에서 해외 거래소로 어떻게 보낼까요?'
                    : '해외 거래소에서 어떻게 출금할까요?'}
                </p>
              </div>
              <div className="space-y-2.5">
                <OptionCard
                  selected={globalExitMethod === 'onchain'}
                  onClick={() => { setGlobalExitMethod('onchain'); if (coin === 'BTC_GLOBAL') setNetwork(null); scrollToStepEnd(); }}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-fill-secondary flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-label-secondary">1</span>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-label-primary">{isSell ? '온체인 전송' : '온체인 출금'}</p>
                      <p className="text-xs text-label-secondary mt-0.5">
                        {isSell
                          ? 'Bitcoin 블록체인으로 해외 거래소에 입금. 10분 내외 소요.'
                          : 'Bitcoin 블록체인으로 출금. 10분 내외 소요.'}
                      </p>
                    </div>
                  </div>
                </OptionCard>
                <OptionCard
                  selected={globalExitMethod === 'lightning'}
                  onClick={() => { if (lnAvailable) { setGlobalExitMethod('lightning'); if (coin === 'BTC_GLOBAL') setNetwork(null); scrollToStepEnd(); } }}
                  disabled={!lnAvailable}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-fill-secondary flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className={`text-xs font-bold ${lnAvailable ? 'text-label-secondary' : 'text-label-disabled'}`}>2</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-bold ${lnAvailable ? 'text-label-primary' : 'text-label-disabled'}`}>
                          {isSell ? '라이트닝 전송' : '라이트닝 출금'}
                        </p>
                        {!lnAvailable && (
                          <span className="text-[10px] font-semibold bg-fill-secondary text-label-tertiary px-1.5 py-0.5 rounded-md">경로 없음</span>
                        )}
                      </div>
                      <p className={`text-xs mt-0.5 ${lnAvailable ? 'text-label-secondary' : 'text-label-disabled'}`}>
                        {isSell
                          ? '스왑 서비스로 온체인 비트코인을 라이트닝으로 바꿔 입금. 다음 단계에서 스왑 서비스를 선택합니다.'
                          : '라이트닝 네트워크로 출금. 다음 단계에서 종착지(개인지갑/라이트닝 지갑)를 선택합니다.'}
                      </p>
                    </div>
                  </div>
                </OptionCard>
                {/* '출금하지 않음'은 살 때만 뜻이 있다. 팔 때는 원화를 받는 것이 목적이라
                    거래소에 비트코인을 남겨두는 선택지가 성립하지 않는다. */}
                {!isSell && (
                  <OptionCard
                    selected={globalExitMethod === 'none'}
                    onClick={() => { setGlobalExitMethod('none'); scrollToStepEnd(); }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-fill-secondary flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs font-bold text-label-secondary">3</span>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-label-primary">개인지갑으로 출금하지 않음</p>
                        <p className="text-xs text-label-secondary mt-0.5">출금 없이 해외 거래소에 비트코인 보유. 매수 비용만 비교.</p>
                      </div>
                    </div>
                  </OptionCard>
                )}
              </div>
              {globalExitMethod === 'onchain' && (
                <div className="ios-card rounded-2xl p-4 text-xs space-y-2">
                  <p className="font-semibold text-label-primary">{isSell ? '온체인 전송' : '온체인 출금'}</p>
                  <p className="text-label-secondary">
                    {isSell
                      ? 'Bitcoin 블록체인에 직접 기록. 보내는 쪽이 개인 지갑이므로 채굴자 수수료를 지갑에서 직접 냅니다. 10분 내외 소요.'
                      : 'Bitcoin 블록체인에 직접 기록. 거래소 고정 출금 수수료 부과 (채굴 수수료 아님). 10분 내외 소요.'}
                  </p>
                </div>
              )}
              {globalExitMethod === 'lightning' && (
                <div className="ios-card rounded-2xl p-4 text-xs space-y-2">
                  <p className="font-semibold text-label-primary">{isSell ? '라이트닝 전송 흐름' : '라이트닝 출금 흐름'}</p>
                  {isSell ? (
                    <p className="text-label-secondary">
                      개인지갑 <span className="text-acc-brand font-medium">온체인 비트코인</span> → 스왑 서비스 → <span className="text-acc-brand font-medium">라이트닝</span> → <span className="text-label-primary font-medium">해외 거래소 입금</span>
                    </p>
                  ) : (
                    <>
                      <p className="text-label-secondary">개인지갑 종착: 해외 거래소 → <span className="text-acc-brand font-medium">라이트닝 출금</span> → 스왑 서비스 → <span className="text-label-primary font-medium">온체인 비트코인 수령</span></p>
                      <p className="text-label-secondary">라이트닝 지갑 종착: 해외 거래소 → <span className="text-acc-brand font-medium">라이트닝 출금</span> → <span className="text-label-primary font-medium">라이트닝 지갑 수령</span> (스왑 없음)</p>
                    </>
                  )}
                </div>
              )}
              {globalExitMethod && (
                <motion.button
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={SPRING_FAST}
                  onClick={() => handleNext('global_exit_method')}
                  className="w-full py-3.5 rounded-2xl font-bold text-sm bg-acc-brand text-white shadow-glow-brand cursor-pointer flex items-center justify-center gap-2"
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
