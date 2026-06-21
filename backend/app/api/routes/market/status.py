"""통합 상태 라우터 — status / scrape-status / crawl-status / notices / network-changes / carf / volumes."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.app.db import repositories
from backend.app.db.session import get_db
from backend.app.domain.market_core import get_withdrawal_source_url
from backend.app.services.exchange_status_builder import build_exchange_status
from backend.app.api.routes.market._shared import _status_cache

router = APIRouter()


@router.get('/scrape-status')
def get_scrape_status(db: Session = Depends(get_db)) -> dict:
    latest_run = repositories.get_latest_successful_run(db)
    if latest_run is None:
        return {'last_run': None, 'items': []}

    items = []
    crawl_errors = repositories.list_crawl_errors_for_run(db, latest_run.id)
    error_stages = {(e.exchange, e.stage): e.error_message for e in crawl_errors}

    # 1. NetworkStatusSnapshot source_url
    network_rows = repositories.list_network_status_for_run(db, latest_run.id)
    seen_urls: set[str] = set()
    for row in network_rows:
        if row.source_url and row.source_url not in seen_urls:
            seen_urls.add(row.source_url)
            has_error = (row.exchange, 'network_status') in error_stages
            items.append({
                'label': f'{row.exchange} 네트워크 상태',
                'url': row.source_url,
                'category': 'network_status',
                'status': 'error' if has_error else 'ok',
                'last_crawled_at': int(row.recorded_at.timestamp()) if row.recorded_at else None,
                'error_message': error_stages.get((row.exchange, 'network_status')),
            })

    # 2. LightningSwapFeeSnapshot source_url
    lightning_rows = repositories.list_lightning_swap_fees_for_run(db, latest_run.id)
    for row in lightning_rows:
        if row.source_url:
            has_error = not row.enabled or bool(row.error_message)
            items.append({
                'label': row.service_name,
                'url': row.source_url,
                'category': 'lightning',
                'status': 'error' if has_error else 'ok',
                'last_crawled_at': int(row.recorded_at.timestamp()) if row.recorded_at else None,
                'error_message': row.error_message,
            })

    # 3. WithdrawalFeeSnapshot - 거래소별 소스 URL
    withdrawal_rows = repositories.list_withdrawal_snapshots_for_run(db, latest_run.id)
    seen_exchanges: set[str] = set()
    for row in withdrawal_rows:
        if row.exchange not in seen_exchanges:
            seen_exchanges.add(row.exchange)
            source_url = get_withdrawal_source_url(row.exchange, row.coin, row.network_label)
            if source_url:
                has_error = (row.exchange, 'withdrawal') in error_stages
                items.append({
                    'label': f'{row.exchange} 출금 수수료',
                    'url': source_url,
                    'category': 'withdrawal',
                    'status': 'error' if has_error else 'ok',
                    'last_crawled_at': int(row.recorded_at.timestamp()) if row.recorded_at else None,
                    'error_message': error_stages.get((row.exchange, 'withdrawal')),
                })

    return {
        'last_run': {
            'id': latest_run.id,
            'status': latest_run.status,
            'completed_at': int(latest_run.completed_at.timestamp()) if latest_run.completed_at else None,
        },
        'items': items,
    }


@router.get('/crawl-status')
def get_crawl_status(db: Session = Depends(get_db)) -> dict:
    """거래소별 최신 크롤 결과 (Pass/Fail/Error 요약)."""
    from backend.app.domain.market_core import GROUPS

    all_exchanges = list(GROUPS['korea']) + list(GROUPS['global'])

    # 가장 최근 3개 run 조회
    runs = repositories.list_crawl_runs(db, limit=3)
    latest = runs[0] if runs else None

    if latest is None:
        return {'last_run': None, 'exchanges': [], 'running': False}

    is_running = latest.status == 'running'

    # 에러 목록
    errors_by_exchange: dict[str, list[str]] = {}
    for e in repositories.list_crawl_errors_for_run(db, latest.id):
        errors_by_exchange.setdefault(e.exchange or '__global__', []).append(
            f'{e.stage}: {e.error_message}'
        )

    # 티커 스냅샷 존재 여부
    ticker_rows = repositories.list_ticker_snapshots_for_run(db, latest.id)
    has_ticker: set[str] = {r.exchange for r in ticker_rows}

    # 출금 스냅샷 존재 여부 (coin별)
    withdrawal_rows = repositories.list_withdrawal_snapshots_for_run(db, latest.id)
    has_btc_wd: set[str] = {r.exchange for r in withdrawal_rows if r.coin == 'BTC'}
    has_usdt_wd: set[str] = {r.exchange for r in withdrawal_rows if r.coin == 'USDT'}

    # 데이터 갭: 출금이 활성(enabled)인데 수수료가 비어 경로 계산에서 제외되는 행 (조치 필요)
    # 예: okx Lightning Network — enabled=True 이지만 fee=None 이면 라이트닝 경로가 생성되지 않음
    data_gaps = [
        {
            'exchange': r.exchange,
            'coin': r.coin,
            'network_label': r.network_label,
            'issue': '출금 활성이지만 수수료 미수집',
        }
        for r in withdrawal_rows
        if r.enabled and r.fee is None
    ]
    data_gaps.sort(key=lambda g: (g['exchange'], g['coin'], g['network_label'] or ''))

    result_exchanges = []
    for ex in all_exchanges:
        errs = errors_by_exchange.get(ex, [])
        result_exchanges.append({
            'exchange': ex,
            'group': 'korea' if ex in GROUPS['korea'] else 'global',
            'ticker':   'pass' if ex in has_ticker  else ('error' if any('ticker' in e for e in errs) else 'missing'),
            'btc_wd':   'pass' if ex in has_btc_wd  else ('error' if any('withdrawal' in e for e in errs) else 'missing'),
            'usdt_wd':  'pass' if ex in has_usdt_wd else ('error' if any('withdrawal' in e for e in errs) else 'missing'),
            'errors':   errs,
        })

    return {
        'running': is_running,
        'last_run': {
            'id': latest.id,
            'status': latest.status,
            'trigger': latest.trigger,
            'message': latest.message,
            'started_at': int(latest.started_at.timestamp()) if latest.started_at else None,
            'completed_at': int(latest.completed_at.timestamp()) if latest.completed_at else None,
            'usd_krw_rate': latest.usd_krw_rate,
        },
        'exchanges': result_exchanges,
        'data_gaps': data_gaps,
    }


@router.get('/status')
def get_exchange_status(db: Session = Depends(get_db)) -> dict:
    """출금 수수료 + 네트워크 상태 + 공지사항 통합 뷰"""
    # single-flight: 캐시 만료 직후 동시 요청을 1회 계산으로 병합
    return _status_cache.get_or_compute('status', lambda: build_exchange_status(db))


@router.get('/notices/latest')
def get_latest_notices(limit: int = Query(5, ge=1, le=20), db: Session = Depends(get_db)) -> dict:
    """BTC/USDT/Lightning 관련 최신 공지사항 반환"""
    rows = repositories.get_latest_relevant_notices(db, limit=limit)
    return {
        'items': [
            {
                'exchange': row.exchange,
                'title': row.title,
                'url': row.url,
                'published_at': int(row.published_at.timestamp()) if row.published_at else None,
                'noticed_at': int(row.noticed_at.timestamp()) if row.noticed_at else None,
            }
            for row in rows
        ]
    }


@router.get('/network-changes/recent')
def get_recent_network_changes(hours: int = Query(24, ge=1, le=72), db: Session = Depends(get_db)) -> dict:
    """최근 N시간 내 네트워크 상태 변경(출금 정지/재개) 목록 + 관련 공지 반환"""
    items = repositories.get_recent_network_changes(db, hours=hours)
    return {'items': items}


@router.get('/carf-exchanges')
def get_carf_exchanges(db: Session = Depends(get_db)) -> dict:
    """CARF 거래소 정보 목록 반환"""
    import json
    rows = repositories.list_carf_exchanges(db)
    exchanges = []
    for r in rows:
        exchanges.append({
            'id': r.id,
            'name': r.name,
            'shortName': r.short_name,
            'type': r.type,
            'registeredCountry': r.registered_country,
            'carfGroup': r.carf_group,
            'carfDataCollectionStart': r.carf_data_collection_start,
            'carfFirstExchange': r.carf_first_exchange,
            'koreaService': r.korea_service,
            'koreaBlocked': r.korea_blocked,
            'koreaImpact': r.korea_impact,
            'impactDetail': r.impact_detail,
            'travelRuleKorea': r.travel_rule_korea,
            'travelRuleNote': r.travel_rule_note,
            'koreaUserJurisdiction': r.korea_user_jurisdiction,
            'koreaUserJurisdictionNote': r.korea_user_jurisdiction_note,
            'mapLocation': json.loads(r.map_location_json) if r.map_location_json else None,
            'sources': json.loads(r.sources_json) if r.sources_json else None,
        })
    return {'exchanges': exchanges}


@router.get('/exchange-volumes')
def get_exchange_volumes(db: Session = Depends(get_db)) -> dict:
    """거래소별 24H/7D/30D 거래량 반환 (DB 기반, 크롤링 시 하루 1회 갱신).

    - volume_24h_usd: 24시간 거래량 (USD)
    - volume_7d_usd : 7일 거래량 추정 (24H × 7)
    - volume_30d_usd: 30일 거래량 추정 (24H × 30)
    - trust_rank    : CoinGecko 신뢰도 순위
    - recorded_at   : 마지막 갱신 시각 (unix timestamp)
    """
    rows = repositories.get_latest_exchange_volumes(db)
    volumes: dict[str, dict] = {}
    for r in rows:
        vol24 = r.volume_24h_usd
        volumes[r.exchange] = {
            'volume_24h_btc': r.volume_24h_btc,
            'volume_24h_usd': vol24,
            'volume_7d_usd':  round(vol24 * 7)  if vol24 else None,
            'volume_30d_usd': round(vol24 * 30) if vol24 else None,
            'trust_score': r.trust_score,
            'trust_rank':  r.trust_rank,
            'recorded_at': int(r.recorded_at.timestamp()) if r.recorded_at else None,
        }
    return {'volumes': volumes}
