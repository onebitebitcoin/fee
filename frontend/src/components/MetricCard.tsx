import { TrendingDown, TrendingUp } from 'lucide-react';

type MetricCardProps = {
  label: string;
  value: string | number;
  helper?: string;
  trend?: 'up' | 'down';
};

export function MetricCard({ label, value, helper, trend }: MetricCardProps) {
  return (
    <article className="border border-dark-200 bg-dark-300 p-4 transition-colors hover:border-dark-100">
      <p className="section-label">{label}</p>
      <div className="mt-2 flex items-end gap-2">
        <p className="text-2xl font-semibold text-bnb-text font-data">{value}</p>
        {trend === 'up' && <TrendingUp size={15} className="mb-1 text-bnb-green" />}
        {trend === 'down' && <TrendingDown size={15} className="mb-1 text-bnb-red" />}
      </div>
      {helper ? <p className="mt-1 text-xs text-bnb-muted">{helper}</p> : null}
    </article>
  );
}
