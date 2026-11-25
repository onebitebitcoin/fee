// 첫 화면 '가장 저렴한 경로' 카드의 표시 규칙. 어떤 경로를 넣을지는 백엔드(domain/popular_paths.py)가 정한다.
import type { PopularPathEntry, PopularPathsResponse } from '../../types';
import { routeStops, type RouteStop } from './routeStops';

/** 기준 금액 문구. 살 때는 원화 금액, 팔 때는 BTC 수량이 기준이다. */
export function popularBasisLabel(d: Pick<PopularPathsResponse, 'mode' | 'amount_krw' | 'amount_btc'>): string {
  if (d.mode === 'sell') return d.amount_btc != null ? `${d.amount_btc} BTC 판매 기준` : '';
  return d.amount_krw != null ? `₩${d.amount_krw.toLocaleString('ko-KR')} 구매 기준` : '';
}

/** 정거장 목록. routeStops 는 해외 거래소 id 를 `_g` 로 받으므로 맞춰 넘긴다. */
export function popularStops(p: PopularPathEntry, mode: PopularPathsResponse['mode']): RouteStop[] {
  return routeStops({ ...p, _g: p.global_exchange ?? '' }, mode);
}
