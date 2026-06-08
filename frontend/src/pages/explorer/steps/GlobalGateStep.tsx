import { motion } from 'motion/react';
import { ArrowLeft, ArrowRight } from '@phosphor-icons/react';
import { fmtEx } from '../../../lib/exchangeNames';
import { getGlobalGates } from '../../../lib/gatemanRegistry';
import { SPRING_FAST } from '../constants';
import { ExFavicon, GatemanPanel } from '../ui';
import { useExplorer } from '../ExplorerContext';

export function GlobalGateStep() {
  const {
    global, liveRegistry, handleBack, handleNext,
  } = useExplorer();
  if (!global) return null;
  return (
    <>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <ExFavicon id={global} size={16} />
                  <p className="text-xs text-label-secondary">{fmtEx(global)}</p>
                </div>
                <h1 className="text-2xl font-bold text-label-primary tracking-tight">입출금 체크리스트</h1>
                <p className="text-sm text-label-secondary mt-1">입출금 전 확인이 필요한 항목이에요</p>
              </div>
              <GatemanPanel
                gates={getGlobalGates(global, liveRegistry?.global)}
                title={`${fmtEx(global)} 입출금 체크리스트`}
              />
              <motion.button
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={SPRING_FAST}
                onClick={() => handleNext('global_gate')}
                className="w-full py-3.5 rounded-2xl font-bold text-sm bg-acc-amber text-white shadow-glow-amber cursor-pointer flex items-center justify-center gap-2"
              >
                다음 <ArrowRight className="w-4 h-4" />
              </motion.button>
              <button onClick={handleBack} className="w-full py-2 text-sm text-label-tertiary hover:text-label-secondary transition-colors flex items-center justify-center gap-1.5">
                <ArrowLeft className="w-3.5 h-3.5" weight="bold" /> 이전으로
              </button>
    </>
  );
}
