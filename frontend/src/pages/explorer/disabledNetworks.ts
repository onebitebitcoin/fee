// 첫 페이지 "네트워크 비활성 목록" 표시용 순수 필터 로직.
// 출금 기준(WithdrawalRow.enabled=false) + BTC/USDT 코인만 대상.
import type { WithdrawalRow } from '../../types';

// 상태 표시 대상 코인 (사용자 요구: USDT, BTC만)
export const STATUS_COINS = ['BTC', 'USDT'] as const;

const isStatusCoin = (coin: string): boolean =>
  (STATUS_COINS as readonly string[]).includes(coin);

const rowKey = (row: WithdrawalRow): string =>
  `${row.exchange}|${row.coin}|${row.network_label}`;

/**
 * 출금이 비활성화된(enabled=false) BTC/USDT 네트워크 행만 추려서
 * 거래소 → 코인 → 네트워크 순으로 정렬해 반환한다. (거래소×코인×네트워크 dedup)
 */
export function filterDisabledWithdrawals(
  rows: readonly WithdrawalRow[],
): WithdrawalRow[] {
  const seen = new Set<string>();
  const out: WithdrawalRow[] = [];
  for (const row of rows) {
    if (row.enabled || !isStatusCoin(row.coin)) continue;
    const key = rowKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out.sort((a, b) =>
    a.exchange.localeCompare(b.exchange) ||
    a.coin.localeCompare(b.coin) ||
    a.network_label.localeCompare(b.network_label),
  );
}
