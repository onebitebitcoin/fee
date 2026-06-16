import { motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Wallet, Lightning } from '@phosphor-icons/react';
import { SPRING_FAST } from '../constants';
import { OptionCard } from '../ui';
import { useExplorer } from '../ExplorerContext';

export function DestinationStep() {
  const {
    destination, setDestination, scrollToStepEnd, lightningExitInfo,
    stepEndRef, handleBack, handleNext,
  } = useExplorer();

  const personalAvailable = lightningExitInfo.hasPersonal;
  const lnWalletAvailable = lightningExitInfo.hasLightningWallet;

  return (
    <>
              <div>
                <h1 className="text-2xl font-bold text-label-primary tracking-tight">종착지</h1>
                <p className="text-sm text-label-secondary mt-1">라이트닝으로 출금한 BTC를 어디로 받을까요?</p>
              </div>
              <div className="space-y-2.5">
                <OptionCard
                  selected={destination === 'personal'}
                  onClick={() => { if (personalAvailable) { setDestination('personal'); scrollToStepEnd(); } }}
                  disabled={!personalAvailable}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full bg-acc-green/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Wallet weight="fill" className={`w-4 h-4 ${personalAvailable ? 'text-acc-green' : 'text-label-disabled'}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-bold ${personalAvailable ? 'text-label-primary' : 'text-label-disabled'}`}>개인지갑 (온체인 BTC)</p>
                        {!personalAvailable && (
                          <span className="text-[10px] font-semibold bg-fill-secondary text-label-tertiary px-1.5 py-0.5 rounded-md">경로 없음</span>
                        )}
                      </div>
                      <p className={`text-xs mt-0.5 ${personalAvailable ? 'text-label-secondary' : 'text-label-disabled'}`}>
                        라이트닝 출금 후 스왑 서비스를 거쳐 온체인 BTC로 개인지갑에 수령.
                      </p>
                    </div>
                  </div>
                </OptionCard>
                <OptionCard
                  selected={destination === 'lightning_wallet'}
                  onClick={() => { if (lnWalletAvailable) { setDestination('lightning_wallet'); scrollToStepEnd(); } }}
                  disabled={!lnWalletAvailable}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full bg-acc-amber/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Lightning weight="fill" className={`w-4 h-4 ${lnWalletAvailable ? 'text-acc-amber' : 'text-label-disabled'}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-bold ${lnWalletAvailable ? 'text-label-primary' : 'text-label-disabled'}`}>라이트닝 지갑</p>
                        {!lnWalletAvailable && (
                          <span className="text-[10px] font-semibold bg-fill-secondary text-label-tertiary px-1.5 py-0.5 rounded-md">경로 없음</span>
                        )}
                      </div>
                      <p className={`text-xs mt-0.5 ${lnWalletAvailable ? 'text-label-secondary' : 'text-label-disabled'}`}>
                        라이트닝 출금까지만. 개인 라이트닝 지갑(Phoenix, Breez 등)이나 LN 수신 서비스가 직접 받습니다. 스왑·온체인 단계 없음.
                      </p>
                    </div>
                  </div>
                </OptionCard>
              </div>
              {destination === 'lightning_wallet' && (
                <div className="ios-card rounded-2xl p-4 text-xs space-y-2">
                  <p className="font-semibold text-label-primary">라이트닝 지갑 종착</p>
                  <p className="text-label-secondary">온체인 개인지갑으로는 라이트닝 출금을 직접 받을 수 없습니다. 라이트닝 인보이스를 받는 지갑/서비스가 필요합니다.</p>
                </div>
              )}
              {destination && (
                <motion.button
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={SPRING_FAST}
                  onClick={() => handleNext('destination')}
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
