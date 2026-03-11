/**
 * Unix timestamp(초)를 브라우저의 현지 시간으로 포맷합니다.
 */
export function formatTs(ts: number | null | undefined, opts?: { dateOnly?: boolean }): string {
  if (ts == null) return '-';
  const date = new Date(ts * 1000);
  if (opts?.dateOnly) {
    return date.toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' });
  }
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}
