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
 * 레거시 비트코인 온체인 네트워크 여부.
 *
 * 거래소들은 네이티브 메인넷을 'Bitcoin' / 'BTC' / 'Bitcoin (On-chain)'으로 표기하고,
 * 구형 P2SH-wrapped 옵션만 라벨에 'SegWit'/'Legacy'/'P2SH'를 명시한다
 * (예: 바이낸스 'BTC (SegWit)'). 이런 레거시 망은 네이티브 망이 멀쩡해도
 * 따로 비활성인 경우가 많아 비활성 목록에서 혼란을 주므로 대상에서 제외한다.
 * 'Native SegWit'(=네이티브 bech32)과 Lightning은 레거시가 아니다.
 */
const isLegacyBtcNetwork = (label: string): boolean => {
  const s = label.toLowerCase();
  if (!s.includes('btc') && !s.includes('bitcoin')) return false;
  if (s.includes('lightning') || s.includes('native')) return false;
  return s.includes('segwit') || s.includes('legacy') || s.includes('p2sh');
};

/**
 * 출금이 비활성화된(enabled=false) BTC/USDT 네트워크 행만 추려서
 * 거래소 → 코인 → 네트워크 순으로 정렬해 반환한다. (거래소×코인×네트워크 dedup)
 * 레거시 BTC 온체인 망(BTC (SegWit) 등)은 제외한다.
 */
export function filterDisabledWithdrawals(
  rows: readonly WithdrawalRow[],
): WithdrawalRow[] {
  const seen = new Set<string>();
  const out: WithdrawalRow[] = [];
  for (const row of rows) {
    if (row.enabled || !isStatusCoin(row.coin)) continue;
    if (isLegacyBtcNetwork(row.network_label)) continue;
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
