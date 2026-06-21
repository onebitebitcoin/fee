"""market 라우터 공통 상태·헬퍼 — 캐시, 직렬화, 공지/KYC enrich.

여러 라우터 그룹이 공유하는 leaf 유틸. 라우트를 등록하지 않는다(순수 상태/함수).
"""
from __future__ import annotations

from backend.app.services import kyc_registry
from backend.app.services.cache import _TtlCache

# status: 60초 TTL. cheapest: 키에 run_id 포함 + 크롤 시 clear → TTL 길어도 stale 없음.
_status_cache = _TtlCache(ttl=60)
_cheapest_path_cache = _TtlCache(ttl=3600)


def invalidate_status_cache() -> None:
    _status_cache.invalidate('status')
    _cheapest_path_cache.clear()


def _ts(dt_val) -> int | None:
    """datetime → unix timestamp (초). None이면 None 반환."""
    return int(dt_val.timestamp()) if dt_val else None


def _serialize_run(run) -> dict | None:
    """CrawlRun 객체를 직렬화 딕셔너리로 변환."""
    if run is None:
        return None
    return {
        'id': run.id,
        'status': run.status,
        'completed_at': _ts(run.completed_at),
        'started_at': _ts(run.started_at) if hasattr(run, 'started_at') else None,
    }


def _build_notice_lookup(notice_rows: list) -> dict[str, list[dict]]:
    lookup: dict[str, list[dict]] = {}
    for row in notice_rows:
        lookup.setdefault(row.exchange, []).append({
            'title': row.title,
            'url': row.url,
            'published_at': row.published_at,
        })
    return lookup


def _find_notice(exchange: str, coin: str, network: str, notice_lookup: dict) -> dict | None:
    notices = notice_lookup.get(exchange, [])
    n_lower = network.lower()
    # coin 이름은 너무 광범위 — 네트워크 특화 키워드만 사용
    if 'trc20' in n_lower:
        keywords = {'trc20', 'tron'}
    elif 'erc20' in n_lower:
        keywords = {'erc20', 'ethereum', 'eth'}
    elif 'bitcoin' in n_lower or coin.lower() == 'btc':
        keywords = {'btc', 'bitcoin', '비트코인'}
    elif 'kaia' in n_lower:
        keywords = {'kaia', 'klay', 'klaytn'}
    else:
        keywords = {n_lower}
    for notice in notices:
        title = (notice.get('title') or '').lower()
        if any(kw in title for kw in keywords):
            return notice
    return None


def _enrich_disabled_paths_with_notices(payload: dict, exchange_notices: dict) -> dict:
    def _attach(entry: dict) -> None:
        notice = _find_notice(
            entry.get('korean_exchange', ''),
            entry.get('transfer_coin', ''),
            entry.get('network', ''),
            exchange_notices,
        )
        entry['notice_url'] = notice.get('url') if notice else None
        entry['notice_published_at'] = notice.get('published_at') if notice else None
        entry['notice_title'] = notice.get('title') if notice else None

    for dp in payload.get('disabled_paths', []):
        _attach(dp)
    # all_paths의 disabled 항목에도 공지 첨부
    for path in payload.get('all_paths', []):
        if path.get('disabled'):
            _attach(path)
    return payload


def _enrich_path_payload_with_kyc(payload: dict, global_exchange: str) -> dict:
    registry = kyc_registry.get_kyc_registry()
    for path in payload.get('all_paths', []):
        path['domestic_kyc_status'] = kyc_registry.resolve_exchange_asset_kyc_status(
            path.get('korean_exchange'),
            path.get('transfer_coin'),
            registry=registry,
        )
        # 글로벌 거래소를 실제로 경유하는 경로만 global_kyc_status를 채운다.
        # 직접 출금(btc_direct/lightning_direct)은 해외 거래소를 거치지 않으므로 None.
        # USDT 경로는 항상 글로벌 경유(buy 모드에선 route_variant 미설정이라 transfer_coin도 함께 본다).
        uses_global = (
            path.get('transfer_coin') == 'USDT'
            or (path.get('route_variant') or '').endswith('via_global')
        )
        if uses_global:
            global_asset = 'BTC' if path.get('transfer_coin') == 'BTC' else 'USDT'
            path['global_kyc_status'] = kyc_registry.resolve_exchange_asset_kyc_status(
                global_exchange,
                global_asset,
                registry=registry,
            )
        else:
            path['global_kyc_status'] = None
        path['exit_service_kyc_status'] = kyc_registry.resolve_service_kyc_status(
            path.get('lightning_exit_provider') or path.get('swap_service'),
            registry=registry,
        )
        path['wallet_kyc_status'] = 'non_kyc'
    return payload
