type Props = {
  carfFirstExchange: string | null | undefined;
};

function getStyle(year: number): string {
  const current = new Date().getFullYear();
  if (year <= current + 1) {
    return 'border-bnb-red/40 bg-bnb-red/10 text-bnb-red';
  }
  if (year === current + 2) {
    return 'border-brand-500/40 bg-brand-500/10 text-brand-400';
  }
  return 'border-dark-200 bg-dark-400 text-bnb-muted';
}

export function CarfBadge({ carfFirstExchange }: Props) {
  if (!carfFirstExchange) return null;
  const year = parseInt(carfFirstExchange, 10);
  if (isNaN(year)) return null;
  return (
    <span className={`inline-flex items-center border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${getStyle(year)}`}>
      CARF {year}
    </span>
  );
}
