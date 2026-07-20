import { motion } from 'motion/react';
import { Check } from '@phosphor-icons/react';
import { SPRING_FAST } from './constants';
import { ExFavicon } from './ui';
import { useExplorer } from './ExplorerContext';
import { buildTimeline } from './timeline';

/** 마법사 상단 가로 진행 타임라인 — 지금까지 고른 값을 단계 순서대로 보여준다(표시 전용). */
export function StepTimeline() {
  const {
    phase, domestic, coin, global, network, btcMethod,
    globalExitMethod, destination, swapSvc,
  } = useExplorer();

  const steps = buildTimeline(
    { domestic, coin, global, network, btcMethod, globalExitMethod, destination, swapSvc },
    phase,
  );
  if (steps.length < 2) return null;   // 첫 단계에선 타임라인이 의미 없음

  return (
    <nav aria-label="진행 단계" className="mb-4 -mx-1 px-1 overflow-x-auto scrollbar-none">
      <ol className="flex items-center gap-1 w-max">
        {steps.map((s, i) => {
          const isCurrent = s.state === 'current';
          return (
            <li key={s.phase} className="flex items-center gap-1">
              {i > 0 && <span aria-hidden className="w-3 h-px bg-sys-separator flex-shrink-0" />}
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...SPRING_FAST, delay: Math.min(i, 6) * 0.03 }}
                aria-current={isCurrent ? 'step' : undefined}
                className={[
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl whitespace-nowrap',
                  isCurrent ? 'bg-acc-amber/15 ring-1 ring-acc-amber/40' : 'bg-fill-secondary',
                ].join(' ')}
              >
                {s.state === 'done' && (
                  <Check className="w-3 h-3 text-acc-green flex-shrink-0" weight="bold" />
                )}
                {s.iconId && <ExFavicon id={s.iconId} size={14} />}
                <span className="flex flex-col items-start leading-tight">
                  <span className={`text-[9px] ${isCurrent ? 'text-acc-amber' : 'text-label-quaternary'}`}>
                    {s.label}
                  </span>
                  <span className={`text-[11px] font-semibold ${isCurrent ? 'text-label-primary' : 'text-label-secondary'}`}>
                    {s.value ?? '선택 중'}
                  </span>
                </span>
              </motion.div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
