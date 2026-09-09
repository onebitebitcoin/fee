"""시세·출금수수료·네트워크상태·LN수수료·거래소역량·출금한도 스냅샷 라우터."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.app.db import repositories
from backend.app.db.session import get_db
from backend.app.domain.market_core import get_withdrawal_source_url
from backend.app.api.routes.market._shared import _serialize_run, _status_cache, _ts

router = APIRouter()


@router.get('/tickers/latest')
def get_latest_tickers(db: Session = Depends(get_db)) -> dict:
    latest_run = repositories.get_latest_successful_run(db)
    if latest_run is None:
        return {'last_run': None, 'items': []}
    rows = repositories.list_ticker_snapshots_for_run(db, latest_run.id)
    return {
        'last_run': _serialize_run(latest_run),
        'items': [
            {
                'exchange': row.exchange,
                'pair': row.pair,
                'market_type': row.market_type,
                'currency': row.currency,
                'price': row.price,
                'high_24h': row.high_24h,
                'low_24h': row.low_24h,
                'volume_24h_btc': row.volume_24h_btc,
                'maker_fee_pct': row.maker_fee_pct,
                'taker_fee_pct': row.taker_fee_pct,
                'maker_fee_usd': row.maker_fee_usd,
                'maker_fee_krw': row.maker_fee_krw,
                'taker_fee_usd': row.taker_fee_usd,
                'taker_fee_krw': row.taker_fee_krw,
                'usd_krw_rate': row.usd_krw_rate,
            }
            for row in rows
        ],
    }


@router.get('/withdrawal-fees/latest')
def get_latest_withdrawals(exchange: str | None = None, coin: str | None = None, db: Session = Depends(get_db)) -> dict:
    latest_run = repositories.get_latest_successful_run(db)
    if latest_run is None:
        return {'last_run': None, 'latest_scraping_time': None, 'items': [], 'errors': []}
    rows = repositories.list_withdrawal_snapshots_for_run(db, latest_run.id)
    errors = repositories.list_crawl_errors_for_run(db, latest_run.id, stage='withdrawal')
    # 출금 중단 행은 "언제부터 중단됐는지"를 전체 스냅샷 이력에서 역추적해 붙인다.
    # 크롤 실행 id 를 캐시 키에 넣어 두므로 다음 크롤이 끝나면 자동으로 새로 계산된다.
    # (exchange/coin 쿼리 필터보다 앞에서 키를 뽑아 캐시 키가 요청 파라미터와 무관하게 유지된다.)
    disabled_keys = [
        (row.exchange, row.coin, row.network_label) for row in rows if not row.enabled
    ]
    disabled_since_map = (
        _status_cache.get_or_compute(
            f'disabled_since:{latest_run.id}',
            lambda: repositories.get_withdrawal_disabled_since(db, disabled_keys),
        )
        if disabled_keys else {}
    )
    # 중단 사유를 설명하는 공지도 창 제한 없이 찾아 붙인다.
    # (network-changes/recent 의 공지 첨부는 최대 72시간 창에 묶여 장기 중단을 놓친다.)
    # 중단 시작 시각을 함께 넘겨, 그 시점 근처에 게시된 공지만 붙게 한다
    # (같은 네트워크의 지난번 중단 공지가 붙는 것을 막는다).
    disabled_notice_map = (
        _status_cache.get_or_compute(
            f'disabled_notices:{latest_run.id}',
            lambda: repositories.get_notices_for_disabled_networks(
                db,
                disabled_keys,
                disabled_since={k: v.get('disabled_since') for k, v in disabled_since_map.items()},
            ),
        )
        if disabled_keys else {}
    )
    if exchange:
        rows = [row for row in rows if row.exchange == exchange.lower()]
        errors = [row for row in errors if row.exchange == exchange.lower()]
    if coin:
        rows = [row for row in rows if row.coin == coin.upper()]
        errors = [row for row in errors if row.coin == coin.upper()]
    legacy_rows = [row for row in rows if row.source == 'official_docs']
    return {
        'last_run': _serialize_run(latest_run),
        'latest_scraping_time': _ts(latest_run.completed_at),
        'items': [
            {
                'exchange': row.exchange,
                'coin': row.coin,
                'source': row.source,
                'network_label': row.network_label,
                'fee': row.fee,
                'fee_usd': row.fee_usd,
                'fee_krw': row.fee_krw,
                'min_withdrawal': row.min_withdrawal,
                'max_withdrawal': row.max_withdrawal,
                'enabled': row.enabled,
                'note': row.note,
                'source_url': get_withdrawal_source_url(row.exchange, row.coin, row.network_label),
                'recorded_at': _ts(row.recorded_at),
                # 출금 중단 시작 시각(unix 초). exact=False 면 보존 이력의 시작점이라 하한값이다.
                'disabled_since': disabled_since_map.get(
                    (row.exchange, row.coin, row.network_label), {}
                ).get('disabled_since'),
                'disabled_since_exact': disabled_since_map.get(
                    (row.exchange, row.coin, row.network_label), {}
                ).get('exact', False),
                # 중단 사유 — 거래소 API 가 직접 제공하는 값(제공하지 않으면 None).
                'suspension_reason': row.suspension_reason,
                'suspension_message': row.suspension_message,
                # 중단을 설명하는 거래소 공지(최신순 최대 3건).
                'related_notices': disabled_notice_map.get(
                    (row.exchange, row.coin, row.network_label), []
                ),
            }
            for row in rows
        ],
        'errors': [
            {
                'exchange': row.exchange,
                'coin': row.coin,
                'stage': row.stage,
                'error_message': row.error_message,
                'created_at': _ts(row.created_at),
            }
            for row in errors
        ] + [
            {
                'exchange': row.exchange,
                'coin': row.coin,
                'stage': 'withdrawal',
                'error_message': '정적 fallback 기반 과거 스냅샷입니다. 최신 스크래핑을 다시 실행하세요.',
                'created_at': _ts(row.recorded_at),
            }
            for row in legacy_rows
        ],
    }


@router.get('/network-status/latest')
def get_latest_network_status(db: Session = Depends(get_db)) -> dict:
    latest_run = repositories.get_latest_successful_run(db)
    if latest_run is None:
        return {'last_run': None, 'exchanges': {}, 'total_suspended': 0}
    rows = repositories.list_network_status_for_run(db, latest_run.id)
    grouped = repositories.group_network_status(rows)
    return {
        'last_run': {'id': latest_run.id, 'status': latest_run.status, 'completed_at': int(latest_run.completed_at.timestamp()) if latest_run.completed_at else None},
        'exchanges': grouped,
        'total_suspended': sum(len(item['suspended_networks']) for item in grouped.values()),
    }


@router.get('/lightning-swap-fees/latest')
def get_latest_lightning_swap_fees(db: Session = Depends(get_db)) -> dict:
    latest_run = repositories.get_latest_successful_run(db)
    if latest_run is None:
        return {'last_run': None, 'items': []}
    rows = repositories.list_lightning_swap_fees_for_run(db, latest_run.id)
    return {
        'last_run': {'id': latest_run.id, 'status': latest_run.status, 'completed_at': int(latest_run.completed_at.timestamp()) if latest_run.completed_at else None},
        'items': [
            {
                'service_name': row.service_name,
                'fee_pct': row.fee_pct,
                'fee_fixed_sat': row.fee_fixed_sat,
                'min_amount_sat': row.min_amount_sat,
                'max_amount_sat': row.max_amount_sat,
                'enabled': row.enabled,
                'source_url': row.source_url,
                'error_message': row.error_message,
                'recorded_at': int(row.recorded_at.timestamp()) if row.recorded_at else None,
            }
            for row in rows
        ],
    }


@router.get('/exchange-capabilities/latest')
def get_latest_exchange_capabilities(db: Session = Depends(get_db)) -> dict:
    latest_run = repositories.get_latest_successful_run(db)
    if latest_run is None:
        return {'last_run': None, 'items': []}
    rows = repositories.list_exchange_capabilities_for_run(db, latest_run.id)
    return {
        'last_run': _serialize_run(latest_run),
        'items': [
            {
                'exchange': row.exchange,
                'supports_lightning_deposit': row.supports_lightning_deposit,
                'supports_lightning_withdrawal': row.supports_lightning_withdrawal,
            }
            for row in rows
        ],
    }


@router.get('/withdrawal-limits/latest')
def get_withdrawal_limits(db: Session = Depends(get_db)) -> dict:
    """국내 거래소 출금 한도 반환 (크롤 데이터 우선, 정적 데이터 fallback).

    - krw_per_tx_limit    : 트래블룰 1회 KRW 제한 (null=제한없음)
    - btc_per_tx_max      : 1회 최대 BTC (null=제한없음)
    - btc_daily_verified  : KYC 인증 완료 일일 BTC 한도 (정적 추정)
    - krw_daily_verified_digital: 크롤링된 일일 디지털 자산 KRW 한도 (null=미수집)
    - source              : playwright / static
    - scraped_at          : 크롤 시각 (unix timestamp, null=정적)
    """
    from backend.app.domain.korea_exchange_registry import WITHDRAWAL_LIMITS  # noqa: PLC0415

    scraped_rows = repositories.get_latest_korea_withdrawal_limits(db)
    scraped_by_exchange: dict[str, object] = {r.exchange: r for r in scraped_rows}

    result: dict[str, dict] = {}
    for exchange, static_lim in WITHDRAWAL_LIMITS.items():
        db_row = scraped_by_exchange.get(exchange)
        result[exchange] = {
            'krw_per_tx_limit': static_lim.krw_per_tx_limit,
            'btc_per_tx_max': static_lim.btc_per_tx_max,
            'btc_daily_verified': static_lim.btc_daily_verified,
            'krw_daily_verified_digital': db_row.krw_daily_verified_digital if db_row else None,
            'source': db_row.source if db_row else 'static',
            'scraped_at': int(db_row.recorded_at.timestamp()) if db_row else None,
        }
    return {'limits': result}
