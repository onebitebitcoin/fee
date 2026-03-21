import { KycBadge } from '../KycBadge';
import { CarfBadge } from '../CarfBadge';
import { ServiceLabel } from './ServiceLabel';
import { buildPathSteps } from '../../lib/pathUtils';
import type { CheapestPathEntry, PathMode } from '../../types';

export function PathTimeline({ path, globalExchange, mode }: { path: CheapestPathEntry; globalExchange: string; mode: PathMode }) {
  const steps = buildPathSteps(path, globalExchange, mode);

  return (
    <>
      <div className="space-y-3 md:hidden" aria-label="모바일 경로 타임라인">
        {steps.map((step, idx) => (
          <div key={idx} className="flex gap-3">
            <div className="flex w-4 flex-col items-center">
              <div className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${step.active ? 'bg-brand-500' : 'bg-dark-200'}`} />
              {idx < steps.length - 1 ? <div className="mt-1 w-px flex-1 bg-brand-500/40" /> : null}
            </div>
            <div className="flex-1 border border-dark-200 bg-dark-500 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    {step.rawName && step.variant ? (
                      <ServiceLabel
                        name={step.rawName}
                        label={step.label}
                        variant={step.variant}
                        textClassName="text-sm font-semibold text-bnb-text"
                        logoClassName="h-5 w-5"
                      />
                    ) : (
                      <p className="text-sm font-semibold text-bnb-text">{step.label}</p>
                    )}
                    <KycBadge status={step.kycStatus} />
                    <CarfBadge carfFirstExchange={step.carfFirstExchange} />
                  </div>
                  <p className="mt-1 text-xs text-bnb-muted">{step.sub}</p>
                </div>
                {step.feeText || step.feeRateText ? (
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-bnb-muted">단계 수수료</p>
                    {step.feeText ? <p className="mt-1 text-sm font-semibold text-brand-400">{step.feeText}</p> : null}
                    {step.feeRateText ? <p className="mt-1 text-[11px] font-data text-bnb-muted">수수료율 {step.feeRateText}</p> : null}
                  </div>
                ) : null}
              </div>
              {step.feeLabel ? <p className="mt-2 text-[11px] text-bnb-muted">{step.feeLabel}</p> : null}
            </div>
          </div>
        ))}
      </div>

      <div className="hidden items-start gap-0 md:flex" aria-label="데스크톱 경로 타임라인">
        {steps.map((step, idx) => (
          <div key={idx} className="flex flex-1 flex-col items-center">
            <div className="flex w-full items-center">
              {idx > 0 && <div className="h-px flex-1 bg-brand-500/40" />}
              <div className={`h-2 w-2 shrink-0 rounded-full ${step.active ? 'bg-brand-500' : 'bg-dark-200'}`} />
              {idx < steps.length - 1 && <div className="h-px flex-1 bg-brand-500/40" />}
            </div>
            <div className="mt-2 text-center">
              <div className="flex flex-wrap items-center justify-center gap-2">
                {step.rawName && step.variant ? (
                  <ServiceLabel
                    name={step.rawName}
                    label={step.label}
                    variant={step.variant}
                    textClassName="justify-center text-[11px] font-semibold text-bnb-text"
                    logoClassName="h-5 w-5"
                  />
                ) : (
                  <p className="text-[11px] font-semibold text-bnb-text">{step.label}</p>
                )}
                <KycBadge status={step.kycStatus} />
                <CarfBadge carfFirstExchange={step.carfFirstExchange} />
              </div>
              <p className="mt-0.5 text-[10px] text-bnb-muted">{step.sub}</p>
              {step.feeText ? <p className="mt-1 text-[10px] font-semibold text-brand-400">{step.feeText}</p> : null}
              {step.feeRateText ? <p className="mt-0.5 text-[10px] font-data text-bnb-muted">수수료율 {step.feeRateText}</p> : null}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
