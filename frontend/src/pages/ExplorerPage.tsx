import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { House, ClipboardText } from '@phosphor-icons/react';
import type { Phase } from './explorer/flow';
import { SPRING_SLOW } from './explorer/constants';
import { ExplorerProvider, useExplorer } from './explorer/ExplorerContext';
import { STEP_REGISTRY } from './explorer/registry';

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ExplorerPage() {
  return (
    <ExplorerProvider>
      <ExplorerShell />
    </ExplorerProvider>
  );
}

// 현재 단계의 모션 래퍼 + 레지스트리 컴포넌트 렌더.
// key는 AnimatePresence가 단계 전환을 감지하도록 상위(StepFrame)에 부여한다.
function StepFrame({ phase, dir }: { phase: Phase; dir: 1 | -1 }) {
  const variants = {
    enter:  { opacity: 0, x: dir * 24, scale: 0.98 },
    center: { opacity: 1, x: 0,        scale: 1 },
    exit:   { opacity: 0, x: dir * -24, scale: 0.98 },
  };
  const entry = STEP_REGISTRY[phase];
  if (!entry) return null;
  const { Component, className } = entry;
  return (
    <motion.div
      variants={variants} custom={dir}
      initial="enter" animate="center" exit="exit"
      transition={SPRING_SLOW}
      className={className}
    >
      <Component />
    </motion.div>
  );
}

function ExplorerShell() {
  const { phase, dir, allData, reset } = useExplorer();

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [phase]);

  return (
    <div className="min-h-[100dvh] bg-sys-bg flex flex-col">

      {/* Header */}
      <header className="glass-header sticky top-0 z-20">
        <div className="max-w-xl mx-auto px-5 h-12 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/favicon.svg" alt="" className="w-5 h-5" />
            <span className="text-sm font-semibold text-label-primary tracking-tight">
              수수료는 얼마나 들까
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/board"
              className="flex items-center gap-1 text-label-tertiary hover:text-label-secondary transition-colors"
              title="게시판"
            >
              <ClipboardText className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">게시판</span>
            </Link>
            {allData && (
              <button
                onClick={reset}
                className="text-label-tertiary hover:text-label-secondary transition-colors"
                title="처음으로"
              >
                <House className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main */}
      <div className="flex-1 max-w-xl mx-auto w-full px-4 py-6">
        <AnimatePresence mode="wait" custom={dir}>
          <StepFrame key={phase} phase={phase} dir={dir} />
        </AnimatePresence>
      </div>
      <footer className="pb-6 pt-2 text-center">
        <span className="text-[10px] text-label-tertiary">v{__APP_VERSION__}</span>
      </footer>
    </div>
  );
}
