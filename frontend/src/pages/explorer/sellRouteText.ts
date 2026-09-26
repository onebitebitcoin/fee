// 팔 때의 경로 요약 문구. 추천 목록(RecommendationStep)과 결과 화면의 대안 경로(ResultStep)가 함께 쓴다.

import { fmtEx } from '../../lib/exchangeNames';
import { formatNetworkLabel } from '../../lib/networkIcons';
import type { CheapestPathEntry } from '../../types';

/**
 * 자금이 개인 지갑에서 거래소로 흐르므로 정거장 순서가 살 때와 반대다.
 * 예) 내 지갑 › BTC › 빗썸 › 원화
 */
export function sellRouteText(p: CheapestPathEntry & { _g: string }): string {
  const isUsdt = p.transfer_coin === 'USDT';
  const isLightning = p.global_exit_mode === 'lightning';
  const provider = p.lightning_exit_provider;
  const parts: string[] = ['내 지갑'];

  // 라이트닝 경로도 지갑에서 스왑 서비스까지는 온체인 비트코인으로 보낸다
  if (isLightning) {
    parts.push('BTC');
    parts.push(provider && provider !== '__direct__' ? fmtEx(provider) : 'LN 스왑');
    parts.push('라이트닝');
  } else {
    parts.push('BTC');
  }

  if (isUsdt) {
    parts.push(fmtEx(p._g));
    parts.push('USDT');
    if (p.network) parts.push(formatNetworkLabel(p.network));
  }

  parts.push(fmtEx(p.korean_exchange));
  parts.push('원화');
  return parts.join(' › ');
}
