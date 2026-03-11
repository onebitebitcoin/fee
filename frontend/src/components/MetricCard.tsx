import { TrendingDown, TrendingUp } from 'lucide-react';

type MetricCardProps = {
  label: string;
  value: string | number;
  helper?: string;
  trend?: 'up' | 'down';
};

export function MetricCard({ label, value, helper, trend }: MetricCardProps) {
  return (
    <article className="border border-dark-200 bg-dark-300 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-bnb-muted">{label}</p>
      <div className="mt-2 flex items-end gap-2">
        <p className="text-2xl font-semibold text-bnb-text">{value}</p>
        {trend === 'up' && <TrendingUp size={16} className="mb-1 text-bnb-green" />}
        {trend === 'down' && <TrendingDown size={16} className="mb-1 text-bnb-red" />}
      </div>
      {helper ? <p className="mt-1 text-xs text-bnb-muted">{helper}</p> : null}
    </article>
  );
}
