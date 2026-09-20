import { motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Warning } from '@phosphor-icons/react';
import { fmtEx } from '../../../lib/exchangeNames';
import { SPRING_FAST, SPRING_SLOW } from '../constants';
import { ExFavicon, OptionCard } from '../ui';
import { useExplorer } from '../ExplorerContext';
import type { CoinType } from '../flow';

type CoinMeta = { num: number; title: string; desc: string; caution?: string };

const COIN_META: Record<CoinType, CoinMeta> = {
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

// 팔 때는 자금이 개인 지갑에서 거래소로 흐르므로 같은 선택지라도 설명이 반대가 된다.
// BTC_GLOBAL 은 팔 때 존재하지 않는 경로라 목록에 오르지 않지만, 타입을 채우려고 남겨둔다.
const SELL_COIN_META: Record<CoinType, CoinMeta> = {
  USDT: {
    num: 1,
    title: '해외 거래소에서 매도 → USDT로 송금',
    desc: '개인 지갑의 비트코인을 해외 거래소로 보내 USDT로 팔고, 그 USDT를 국내 거래소로 옮겨 원화로 바꾸는 경로예요. 국내 매도 호가가 불리하거나 김치 프리미엄이 낮을 때 유리할 수 있어요.',
  },
  BTC_GLOBAL: {
    num: 2,
    title: '비트코인 → 해외거래소 경유',
    desc: '팔 때는 쓰이지 않는 경로예요.',
  },
  BTC: {
    num: 3,
    title: '국내 거래소로 직접 전송',
    desc: '개인 지갑의 비트코인을 국내 거래소로 바로 보내 원화로 파는 경로예요. 거치는 단계가 가장 적어요.',
    caution: '입금 주소를 잘못 넣으면 되돌릴 수 없어요. 거래소가 안내한 BTC 입금 주소와 네트워크를 그대로 써야 해요.',
  },
};

export function CoinStep() {
  const {
    mode,
    domestic, coin, setCoin, setGlobal, setNetwork, setBtcMethod,
    setGlobalExitMethod, setSwapSvc, stepEndRef, scrollToStepEnd,
    coinOptions, handleBack, handleNext,
  } = useExplorer();
  const meta = mode === 'sell' ? SELL_COIN_META : COIN_META;

  return (
    <>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <ExFavicon id={domestic!} size={16} />
                  <p className="text-xs text-label-secondary">{fmtEx(domestic!)}</p>
                </div>
                <h1 className="text-2xl font-bold text-label-primary tracking-tight">
                  {mode === 'sell' ? '거래소로 보내는 방식' : '국내 거래소 출금 방식'}
                </h1>
                <p className="text-sm text-label-secondary mt-1">어떤 방식으로 이동할까요?</p>
              </div>
              <div className="space-y-2.5">
                {coinOptions.map(({ coin: c }, i) => {
                  const m = meta[c];
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
                            <span className="text-xs font-bold text-label-secondary">{m.num}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-label-primary">{m.title}</p>
                            <p className="text-xs text-label-secondary mt-1 leading-relaxed">{m.desc}</p>
                            {m.caution && (
                              <div className="flex items-start gap-1.5 mt-2">
                                <Warning className="w-3 h-3 text-acc-brand flex-shrink-0 mt-0.5" weight="fill" />
                                <p className="text-[11px] text-acc-brand leading-relaxed">{m.caution}</p>
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
