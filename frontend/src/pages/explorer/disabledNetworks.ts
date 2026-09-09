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

const MINUTE_SEC = 60;
const HOUR_SEC = 60 * MINUTE_SEC;
const DAY_SEC = 24 * HOUR_SEC;

/**
 * 출금 중단이 얼마나 이어지고 있는지를 사람이 읽는 문구로 만든다.
 *
 * @param sinceTs 중단이 시작된 시각(unix 초). 백엔드 `disabled_since` 값.
 * @param nowTs 기준 시각(unix 초). 렌더링 시점을 넘기면 된다.
 * @param opts.exact `false` 면 보존된 스냅샷 이력의 시작점이라 실제 중단 시작은 그보다
 *   이를 수 있다. 이 경우 하한값임을 드러내기 위해 "최소" 를 앞에 붙인다.
 * @returns `3일 4시간째` 같은 문구. `sinceTs` 가 없으면 null.
 */
export function formatDisabledDuration(
  sinceTs: number | null | undefined,
  nowTs: number,
  opts?: { exact?: boolean },
): string | null {
  if (!sinceTs) return null;
  const elapsed = Math.max(0, nowTs - sinceTs);
  const prefix = opts?.exact === false ? '최소 ' : '';

  if (elapsed < MINUTE_SEC) return '방금';
  if (elapsed < HOUR_SEC) return `${prefix}${Math.floor(elapsed / MINUTE_SEC)}분째`;
  if (elapsed < DAY_SEC) return `${prefix}${Math.floor(elapsed / HOUR_SEC)}시간째`;

  const days = Math.floor(elapsed / DAY_SEC);
  const hours = Math.floor((elapsed % DAY_SEC) / HOUR_SEC);
  return hours === 0 ? `${prefix}${days}일째` : `${prefix}${days}일 ${hours}시간째`;
}

/**
 * 거래소 API 가 영문으로 주는 중단 사유를 한국어로 옮긴다.
 *
 * 거래소가 어떤 문구를 쓸지 전부 알 수 없으므로, 실제로 관측된 값만 매핑해 두고
 * 나머지는 원문을 그대로 보여준다. 임의로 번역하거나 "점검" 같은 일반 문구로
 * 뭉뚱그리면 실제 사유와 어긋날 수 있다.
 */
const SUSPENSION_REASON_KO: Record<string, string> = {
  'system maintenance': '시스템 점검',
  'wallet maintenance': '지갑 점검',
  'network congestion': '네트워크 혼잡',
  'network upgrade': '네트워크 업그레이드',
  'under maintenance': '점검 중',
};

/**
 * 중단 사유 표시 문구를 만든다.
 *
 * @param reason 백엔드 `suspension_reason` 값. 거래소가 제공하지 않으면 null.
 * @returns 한국어 문구(매핑에 있을 때) 또는 원문. 사유가 없으면 null.
 */
export function formatSuspensionReason(reason: string | null | undefined): string | null {
  const trimmed = reason?.trim();
  if (!trimmed) return null;
  return SUSPENSION_REASON_KO[trimmed.toLowerCase()] ?? trimmed;
}
