import type { KycStatus } from '../types';

const badgeMap: Record<Exclude<KycStatus, null>, { label: string; className: string }> = {
  kyc: {
    label: 'KYC',
    className: 'border-blue-500/40 bg-blue-500/10 text-blue-400',
  },
  non_kyc: {
    label: 'NON-KYC',
    className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
  },
  mixed: {
    label: 'MIXED',
    className: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-400',
  },
};

export function KycBadge({ status }: { status?: KycStatus }) {
  if (!status) return null;
  const badge = badgeMap[status];
  return (
    <span className={`inline-flex items-center border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${badge.className}`}>
      {badge.label}
    </span>
  );
}
