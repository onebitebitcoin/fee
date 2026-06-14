// ── 공용 프레젠테이션 컴포넌트 ────────────────────────────────────────────────────
// 단계 컴포넌트들이 공유하는 표시용 컴포넌트 모음.

import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle, Coin, ShieldCheck, CircleNotch, X } from '@phosphor-icons/react';
import { getExchangeDomain, fmtEx } from '../../lib/exchangeNames';
import type { GateItem } from '../../lib/gatemanRegistry';
import { SPRING_FAST } from './constants';

export function ExFavicon({ id, size = 18 }: { id: string; size?: number }) {
  const domain = getExchangeDomain(id);
  if (!domain) return null;
  return (
    <img
      src={`https://www.google.com/s2/favicons?sz=32&domain=${domain}`}
      alt="" width={size} height={size}
      className="rounded-md flex-shrink-0"
      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
    />
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-label-tertiary mb-3">
      {children}
    </p>
  );
}

export function Chip({ color, children }: { color: 'amber' | 'blue' | 'green' | 'red' | 'neutral'; children: React.ReactNode }) {
  const cls = {
    amber:   'bg-acc-amber/15 text-acc-amber',
    blue:    'bg-acc-blue/15 text-acc-blue',
    green:   'bg-acc-green/15 text-acc-green',
    red:     'bg-acc-red/15 text-acc-red',
    neutral: 'bg-fill-secondary text-label-secondary',
  }[color];
  return (
    <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${cls}`}>
      {children}
    </span>
  );
}

// macOS-style selection option card
export function OptionCard({
  selected, onClick, recommended, disabled = false, children,
}: {
  selected: boolean; onClick: () => void;
  recommended?: boolean; disabled?: boolean;
  children: React.ReactNode;
}) {
  void recommended;
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileTap={!disabled ? { scale: 0.985, transition: SPRING_FAST } : {}}
      whileHover={!disabled && !selected ? { scale: 1.008, y: -1, transition: SPRING_FAST } : {}}
      className={[
        'w-full text-left p-4 rounded-2xl border transition-colors duration-150 relative overflow-hidden',
        selected
          ? 'bg-acc-amber/8 border-acc-amber/40 shadow-card-focus'
          : 'ios-card border-transparent hover:border-white/12',
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
      ].join(' ')}
    >
      {selected && (
        <>
          <motion.div
            layoutId="selection-glow"
            className="absolute inset-0 rounded-2xl bg-acc-amber/5 pointer-events-none"
          />
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute top-3 right-3"
          >
            <CheckCircle weight="fill" className="w-4 h-4 text-acc-amber" />
          </motion.div>
        </>
      )}
      {children}
    </motion.button>
  );
}

// Step progress dots
export function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <motion.div
          key={i}
          animate={{
            width: i === current ? 20 : 6,
            opacity: i <= current ? 1 : 0.25,
          }}
          transition={SPRING_FAST}
          className={`h-1.5 rounded-full ${i <= current ? 'bg-acc-amber' : 'bg-fill-primary'}`}
        />
      ))}
    </div>
  );
}

export function LoadingScreen({
  progress = {},
  domesticKeys = [],
  isReady = false,
}: {
  progress?: Record<string, 'loading' | 'done' | 'error'>;
  domesticKeys?: string[];
  isReady?: boolean;
}) {
  const allKeys = Object.keys(progress);
  const domesticInProgress = domesticKeys.filter(k => k in progress);
  const globalKeys = allKeys.filter(k => !domesticKeys.includes(k));
  const doneCount = Object.values(progress).filter(s => s === 'done').length;
  const total = allKeys.length;

  const renderItem = (g: string) => {
    const st = progress[g];
    return (
      <motion.div
        key={g}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-2.5"
      >
        <ExFavicon id={g} size={16} />
        <span className="flex-1 text-xs text-label-secondary">{fmtEx(g)}</span>
        {st === 'loading' && (
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
            <CircleNotch className="w-3.5 h-3.5 text-label-tertiary" />
          </motion.div>
        )}
        {st === 'done' && <CheckCircle weight="fill" className="w-3.5 h-3.5 text-acc-green" />}
        {st === 'error' && <X className="w-3.5 h-3.5 text-label-tertiary" />}
      </motion.div>
    );
  };

  return (
    <motion.div
      key="loading"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center justify-center min-h-[60vh] gap-6"
    >
      {isReady ? (
        <div className="w-14 h-14 rounded-full bg-acc-green/15 flex items-center justify-center">
          <CheckCircle weight="fill" className="w-7 h-7 text-acc-green" />
        </div>
      ) : (
        <motion.div
          animate={{ scale: [1, 1.06, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
          className="w-14 h-14 rounded-full bg-acc-amber/15 flex items-center justify-center"
        >
          <Coin weight="fill" className="w-7 h-7 text-acc-amber" />
        </motion.div>
      )}

      <div className="text-center space-y-1">
        <p className="text-sm font-semibold text-label-primary">
          {isReady ? '조회 완료' : '경로 계산 중'}
        </p>
        {total > 0 ? (
          <p className="text-xs text-label-tertiary">{doneCount} / {total} 거래소 완료</p>
        ) : (
          <p className="text-xs text-label-tertiary">거래소별 실시간 데이터 수집 중...</p>
        )}
      </div>

      {total > 0 && (
        <div className="flex flex-col gap-2 w-56">
          {domesticInProgress.length > 0 && (
            <>
              <p className="text-[10px] text-label-tertiary font-medium uppercase tracking-wide mb-0.5">국내</p>
              <AnimatePresence>{domesticInProgress.map(renderItem)}</AnimatePresence>
            </>
          )}
          {domesticInProgress.length > 0 && globalKeys.length > 0 && (
            <div className="border-t border-fill-tertiary my-1" />
          )}
          {globalKeys.length > 0 && (
            <>
              <p className="text-[10px] text-label-tertiary font-medium uppercase tracking-wide mb-0.5">해외</p>
              <AnimatePresence>{globalKeys.map(renderItem)}</AnimatePresence>
            </>
          )}
        </div>
      )}

      {!isReady && (
        <div className="w-48 h-1 bg-fill-secondary rounded-full overflow-hidden relative">
          <div className="scan-line h-full rounded-full" />
        </div>
      )}
    </motion.div>
  );
}

// ── GatemanPanel ──────────────────────────────────────────────────────────────

const GATE_CFG = {
  required:    { borderCls: 'border-acc-red',   label: '필수',   textCls: 'text-acc-red' },
  conditional: { borderCls: 'border-acc-amber', label: '조건부', textCls: 'text-acc-amber' },
  info:        { borderCls: 'border-acc-blue',  label: '참고',   textCls: 'text-acc-blue' },
};

export function GatemanPanel({
  gates,
  title = '체크리스트',
}: {
  gates: GateItem[];
  title?: string;
}) {
  return (
    <div className="ios-card rounded-2xl p-4 space-y-1.5">
      <div className="flex items-center gap-1.5 mb-2">
        <ShieldCheck className="w-3.5 h-3.5 text-label-tertiary flex-shrink-0" />
        <span className="text-[10px] font-semibold text-label-tertiary uppercase tracking-wider">{title}</span>
      </div>
      {gates.map((g, i) => {
        const cfg = GATE_CFG[g.level];
        return (
          <div key={i} className="flex gap-2.5 items-start">
            <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
              g.level === 'required' ? 'bg-acc-red' : g.level === 'conditional' ? 'bg-acc-amber' : 'bg-acc-blue'
            }`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`text-xs font-semibold ${cfg.textCls}`}>{g.label}</span>
                <span className="text-[9px] font-bold bg-fill-secondary text-label-tertiary px-1 py-0.5 rounded">{cfg.label}</span>
                {g.condition && <span className="text-[9px] text-label-tertiary">({g.condition})</span>}
              </div>
              <p className="text-[11px] text-label-secondary mt-0.5 leading-relaxed">{g.desc}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
