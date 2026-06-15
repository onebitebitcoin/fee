import { motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Warning } from '@phosphor-icons/react';
import { fmtEx } from '../../../lib/exchangeNames';
import { SPRING_FAST, SPRING_SLOW } from '../constants';
import { ExFavicon, OptionCard } from '../ui';
import { useExplorer } from '../ExplorerContext';
import type { CoinType } from '../flow';

const COIN_META: Record<CoinType, {
  num: number;
  title: string;
  desc: string;
  caution?: string;
}> = {
  USDT: {
    num: 1,
    title: 'USDT → 해외거래소 비트코인 매수',
    desc: '국내 거래소에서 USDT로 출금한 뒤 해외 거래소에서 BTC를 매수하는 경로예요. 수천만원 이하 소액을 이동할 때 적합해요.',
  },
  BTC_GLOBAL: {
    num: 2,
    title: '비트코인 → 해외거래소 경유',
    desc: '보유한 BTC를 해외 거래소로 옮겨 출금하는 방식이에요. 굳이 USDT로 바꾸지 않아도 되고, USDT 매도·매수 거래 수수료가 없어서 수천만원 단위 금액에서 더 유리해요.',
  },
  BTC: {
    num: 3,
    title: '비트코인 직접 출금',
    desc: '국내 거래소에서 개인 지갑으로 BTC를 바로 출금해요.',
    caution: '최초 출금 전 개인 지갑 주소 등록이 필요하고, 거래소별로 1회·일일 출금 금액 제한이 있을 수 있어요.',
  },
};

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
                {coinOptions.map(({ coin: c }, i) => {
                  const meta = COIN_META[c];
                  return (
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
                        <div className="flex items-start gap-3">
                          <div className="w-6 h-6 rounded-full bg-fill-secondary flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-xs font-bold text-label-secondary">{meta.num}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-label-primary">{meta.title}</p>
                            <p className="text-xs text-label-secondary mt-1 leading-relaxed">{meta.desc}</p>
                            {meta.caution && (
                              <div className="flex items-start gap-1.5 mt-2">
                                <Warning className="w-3 h-3 text-acc-amber flex-shrink-0 mt-0.5" weight="fill" />
                                <p className="text-[11px] text-acc-amber leading-relaxed">{meta.caution}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </OptionCard>
                    </motion.div>
                  );
                })}
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
