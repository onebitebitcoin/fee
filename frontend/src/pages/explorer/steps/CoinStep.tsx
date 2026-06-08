import { motion } from 'motion/react';
import { ArrowLeft, ArrowRight, CurrencyBtc, CurrencyDollar, Globe } from '@phosphor-icons/react';
import { fmtEx } from '../../../lib/exchangeNames';
import { SPRING_FAST, SPRING_SLOW } from '../constants';
import { ExFavicon, OptionCard } from '../ui';
import { useExplorer } from '../ExplorerContext';

export function CoinStep() {
  const {
    domestic, coin, setCoin, setGlobal, setNetwork, setBtcMethod,
    setGlobalExitMethod, setSwapSvc, stepEndRef, scrollToStepEnd,
    coinOptions, handleBack, handleNext,
  } = useExplorer();
  return (
    <>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <ExFavicon id={domestic!} size={16} />
                  <p className="text-xs text-label-secondary">{fmtEx(domestic!)}</p>
                </div>
                <h1 className="text-2xl font-bold text-label-primary tracking-tight">국내 거래소 출금 방식</h1>
                <p className="text-sm text-label-secondary mt-1">어떤 방식으로 이동할까요?</p>
              </div>
              <div className="space-y-2.5">
                {coinOptions.map(({ coin: c }, i) => (
                  <motion.div key={c}
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ ...SPRING_SLOW, delay: i * 0.06 }}>
                    <OptionCard
                      selected={coin === c}
                      onClick={() => {
                        setCoin(c); setGlobal(null); setNetwork(null); setBtcMethod(null);
                        setGlobalExitMethod(null); setSwapSvc(null); scrollToStepEnd();
                      }}
                    >
                      <div className="flex items-center gap-3">
                        {c === 'USDT'
                          ? <CurrencyDollar weight="fill" className="w-8 h-8 text-acc-green" />
                          : c === 'BTC_GLOBAL'
                            ? <CurrencyBtc weight="fill" className="w-8 h-8 text-acc-blue" />
                          : <CurrencyBtc weight="fill" className="w-8 h-8 text-acc-amber" />}
                        <div>
                          <p className="text-sm font-bold text-label-primary">
                            {c === 'USDT' ? 'USDT → 해외거래소 비트코인 매수'
                              : c === 'BTC_GLOBAL' ? '비트코인 → 해외거래소 경유'
                              : '비트코인 직접 출금'}
                          </p>
                          <p className="text-xs text-label-secondary mt-0.5">
                            {c === 'USDT'
                              ? 'USDT 출금 → 해외 거래소 비트코인 매수 → 개인 지갑'
                              : c === 'BTC_GLOBAL'
                                ? '비트코인 출금 → 해외 거래소 경유 → 개인 지갑'
                                : '한국 거래소 비트코인 직접 출금 → 개인 지갑'}
                          </p>
                        </div>
                      </div>
                    </OptionCard>
                  </motion.div>
                ))}
              </div>
              {coin && (
                <motion.button
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={SPRING_FAST}
                  onClick={() => handleNext('coin')}
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
