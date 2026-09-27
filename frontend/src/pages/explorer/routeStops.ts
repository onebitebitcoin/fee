// 추천 경로의 정거장 목록. 추천 목록 카드(RecommendationStep)와 결과 화면의 대안 경로(ResultStep)가 함께 쓴다.
// 카드는 정거장을 줄바꿈하며 그리고, 한 줄 요약이 필요한 곳은 routeText 로 이어 붙인다.

import { fmtEx } from '../../lib/exchangeNames';
import { formatNetworkLabel } from '../../lib/networkIcons';
import type { CheapestPathEntry, PathMode } from '../../types';

export interface RouteStop {
  label: string;
  /** 거래소·스왑 서비스 정거장에만 붙는 로고 id(ExFavicon). 코인·네트워크·지갑에는 없다. */
  iconId?: string;
}

type RoutePath = CheapestPathEntry & { _g: string };

const serviceStop = (provider: string | null | undefined): RouteStop =>
  provider && provider !== '__direct__'
    ? { label: fmtEx(provider), iconId: provider }
    : { label: 'LN 스왑' };

/**
 * 팔 때: 자금이 개인 지갑에서 거래소로 흐르므로 정거장 순서가 살 때와 반대다.
 * 예) 내 지갑 › BTC › 빗썸 › 원화
 */
function sellRouteStops(p: RoutePath): RouteStop[] {
  const stops: RouteStop[] = [{ label: '내 지갑' }, { label: 'BTC' }];
  // 라이트닝 경로도 지갑에서 스왑 서비스까지는 온체인 비트코인으로 보낸다
  if (p.global_exit_mode === 'lightning') {
    stops.push(serviceStop(p.lightning_exit_provider), { label: '라이트닝' });
  }
  if (p.transfer_coin === 'USDT') {
    stops.push({ label: fmtEx(p._g), iconId: p._g }, { label: 'USDT' });
    if (p.network) stops.push({ label: formatNetworkLabel(p.network) });
  }
  stops.push({ label: fmtEx(p.korean_exchange), iconId: p.korean_exchange }, { label: '원화' });
  return stops;
}

/** 살 때: 국내 거래소에서 출발해 개인 지갑(온체인 / 라이트닝)에서 끝난다. */
function buyRouteStops(p: RoutePath): RouteStop[] {
  const isUsdt = p.transfer_coin === 'USDT';
  const isViaGlobal = p.route_variant?.endsWith('via_global') ?? false;
  const isLightning = p.path_type === 'lightning_exit';
  const isLnWallet = p.destination === 'lightning_wallet';  // LN 출금까지만(직접 수신)
  // 라이트닝 지갑 종착: 글로벌 거래소 자체 LN 출금 → "바이낸스 LN"으로 합침
  const globalStop: RouteStop = { label: isLightning && isLnWallet ? `${fmtEx(p._g)} LN` : fmtEx(p._g), iconId: p._g };
  const stops: RouteStop[] = [{ label: fmtEx(p.korean_exchange), iconId: p.korean_exchange }];

  if (isUsdt) {
    stops.push({ label: 'USDT' });
    if (p.network) stops.push({ label: formatNetworkLabel(p.network) });
    stops.push(globalStop);
  } else if (isViaGlobal) {
    stops.push({ label: 'BTC' }, globalStop);
    if (!isLightning && p.network) stops.push({ label: formatNetworkLabel(p.network) });
  } else {
    stops.push({ label: 'BTC' });
    if (!isLightning && p.network) stops.push({ label: formatNetworkLabel(p.network) });
  }

  // 개인지갑 종착(LN 스왑 경유): 서비스명 표시, 없으면 "LN 스왑"으로 명시
  if (isLightning && !isLnWallet) stops.push(serviceStop(p.lightning_exit_provider));

  // 종착지: 온체인 지갑 vs 라이트닝 지갑을 명확히 구분
  stops.push({ label: isLnWallet ? '라이트닝 지갑' : isLightning ? '온체인 지갑' : '지갑' });
  return stops;
}

export function routeStops(p: RoutePath, mode: PathMode = 'buy'): RouteStop[] {
  return mode === 'sell' ? sellRouteStops(p) : buyRouteStops(p);
}

export function routeText(p: RoutePath, mode: PathMode = 'buy'): string {
  return routeStops(p, mode).map(s => s.label).join(' › ');
}
