export const SATS_PER_BTC = 100_000_000;

export function formatNumber(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits }).format(value);
}

export function formatSats(value: number): string {
  return `${formatNumber(Math.round(value * SATS_PER_BTC))} sats`;
}

export function formatCurrency(value: number): string {
  const decimals = value % 1 !== 0 ? 1 : 0;
  return `${formatNumber(value, decimals)} KRW`;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(value >= 1 ? 2 : 3)}%`;
}

export function formatFeeKrw(feeKrw: number | null | undefined): string {
  if (feeKrw == null) return '-';
  return `₩${formatNumber(Math.round(feeKrw), 0)}`;
}
