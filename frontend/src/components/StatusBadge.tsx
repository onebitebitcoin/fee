type StatusBadgeProps = {
  status: string;
};

type BadgeConfig = {
  bg: string;
  text: string;
  border: string;
  dot?: string;
  label?: string;
};

const configMap: Record<string, BadgeConfig> = {
  success:              { bg: 'bg-bnb-green/10', text: 'text-bnb-green', border: 'border-bnb-green/25', dot: 'bg-bnb-green' },
  ok:                   { bg: 'bg-bnb-green/10', text: 'text-bnb-green', border: 'border-bnb-green/25', dot: 'bg-bnb-green' },
  partial_success:      { bg: 'bg-brand-500/10', text: 'text-brand-400', border: 'border-brand-500/25', dot: 'bg-brand-400' },
  running:              { bg: 'bg-brand-500/10', text: 'text-brand-400', border: 'border-brand-500/25', dot: 'bg-brand-400' },
  maintenance_detected: { bg: 'bg-brand-500/10', text: 'text-brand-400', border: 'border-brand-500/25' },
  failed:               { bg: 'bg-bnb-red/10',   text: 'text-bnb-red',   border: 'border-bnb-red/25' },
  error:                { bg: 'bg-bnb-red/10',   text: 'text-bnb-red',   border: 'border-bnb-red/25' },
};

const labelMap: Record<string, string> = {
  success:              '정상',
  ok:                   '정상',
  partial_success:      '부분',
  running:              '실행 중',
  maintenance_detected: '점검',
  failed:               '실패',
  error:                '오류',
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const cfg = configMap[status] ?? { bg: 'bg-dark-200', text: 'text-bnb-muted', border: 'border-dark-100' };
  const displayLabel = labelMap[status] ?? status;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide
        ${cfg.bg} ${cfg.text} ${cfg.border}`}
    >
      {cfg.dot && (
        <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} aria-hidden />
      )}
      {displayLabel}
    </span>
  );
}
