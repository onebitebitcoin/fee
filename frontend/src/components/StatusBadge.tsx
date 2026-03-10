type StatusBadgeProps = {
  status: string;
};

const colorMap: Record<string, string> = {
  success: 'bg-bnb-green/20 text-bnb-green border border-bnb-green/30',
  partial_success: 'bg-brand-500/20 text-brand-500 border border-brand-500/30',
  failed: 'bg-bnb-red/20 text-bnb-red border border-bnb-red/30',
  running: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  ok: 'bg-bnb-green/20 text-bnb-green border border-bnb-green/30',
  maintenance_detected: 'bg-brand-500/20 text-brand-500 border border-brand-500/30',
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${colorMap[status] ?? 'bg-dark-200 text-bnb-muted border border-dark-100'}`}>
      {status}
    </span>
  );
}
