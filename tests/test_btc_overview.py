"""첫 화면 보강 — 청산 수집·집계, 24시간 가격 추이, 뉴스 키워드 파일, 두 API."""
import json
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.db.base import Base
from backend.app.db.models import LiquidationEvent
from backend.app.db.session import get_db
from backend.app.main import app
from backend.app.services import btc_trend_service, liquidation_service, news_keywords

NOW = datetime(2026, 11, 9, 7, 30, tzinfo=timezone.utc)


@pytest.fixture()
def session_factory():
    engine = create_engine('sqlite://', future=True, connect_args={'check_same_thread': False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    yield factory
    Base.metadata.drop_all(bind=engine)


def _detail(ts: datetime, side: str, sz='2', px='70000'):
    return {'ts': str(int(ts.timestamp() * 1000)), 'posSide': side, 'sz': sz, 'bkPx': px}


def test_parse_okx_converts_contracts_to_usd_and_drops_unknown_side():
    events = liquidation_service.parse_okx_details([_detail(NOW, 'long'), _detail(NOW, 'net')])
    assert len(events) == 1
    assert events[0]['usd'] == pytest.approx(2 * 0.01 * 70000)
    assert events[0]['side'] == 'long'


def test_fetch_paginates_until_older_than_since():
    pages = [
        {'data': [{'details': [_detail(NOW, 'long'), _detail(NOW - timedelta(minutes=30), 'short')]}]},
        {'data': [{'details': [_detail(NOW - timedelta(hours=2), 'long'), _detail(NOW - timedelta(hours=5), 'long')]}]},
        {'data': [{'details': [_detail(NOW - timedelta(hours=9), 'long')]}]},
    ]
    calls = []

    def fake_get(url, params):
        calls.append(dict(params))
        return pages[len(calls) - 1]

    events = liquidation_service.fetch_okx_liquidations(NOW - timedelta(hours=3), fake_get)
    assert len(calls) == 2  # 두 번째 페이지에서 3시간보다 오래된 기록을 만나 멈춘다
    assert 'after' in calls[1]
    assert len(events) == 3  # 5시간 전 기록은 since 이전이라 제외


def test_store_events_is_idempotent(session_factory):
    events = liquidation_service.parse_okx_details([_detail(NOW, 'long'), _detail(NOW, 'short', sz='1')])
    with session_factory() as db:
        assert liquidation_service.store_events(db, events) == 2
        assert liquidation_service.store_events(db, events) == 0
        assert len(db.scalars(select(LiquidationEvent)).all()) == 2


def test_hourly_summary_marks_hours_before_collection_as_missing(session_factory):
    events = liquidation_service.parse_okx_details([
        _detail(NOW - timedelta(minutes=10), 'long', sz='10'),  # 07시대
        _detail(NOW - timedelta(hours=1, minutes=20), 'short', sz='5'),  # 06시대, 가장 오래된 기록
    ])
    with session_factory() as db:
        liquidation_service.store_events(db, events)
        s = liquidation_service.hourly_summary(db, NOW)
    hours = s['hours']
    assert len(hours) == 24
    assert hours[-1]['long'] == round(10 * 0.01 * 70000)
    assert hours[-2]['short'] == round(5 * 0.01 * 70000)
    assert hours[-3]['long'] is None  # 수집 시작 전 시간은 0 이 아니라 기록 없음
    assert s['total_long_usd'] == 7000 and s['total_short_usd'] == 3500


def test_collect_once_prunes_old_rows(session_factory):
    old = liquidation_service.parse_okx_details([_detail(NOW - timedelta(hours=60), 'long')])
    with session_factory() as db:
        liquidation_service.store_events(db, old)
    added = liquidation_service.collect_once(
        session_factory, now=NOW, http_get=lambda u, p: {'data': [{'details': [_detail(NOW, 'short')]}]})
    assert added == 1
    with session_factory() as db:
        rows = db.scalars(select(LiquidationEvent)).all()
    assert [r.side for r in rows] == ['short']


def test_parse_klines_computes_change_from_first_open():
    rows = [[1794092400000, '100', '110', '90', '105'], [1794096000000, '105', '120', '95', '110']]
    t = btc_trend_service.parse_klines(rows)
    assert t['change_pct'] == pytest.approx(10.0)
    assert t['high'] == 120 and t['low'] == 90 and len(t['points']) == 2
    with pytest.raises(ValueError):
        btc_trend_service.parse_klines([])


def test_load_keywords_flags_stale_and_rejects_bad_files(tmp_path):
    p = tmp_path / 'btc_keywords.json'
    with pytest.raises(news_keywords.KeywordsUnavailable, match='없습니다'):
        news_keywords.load_keywords(p, NOW)
    p.write_text('{"rank": "x"}')
    with pytest.raises(news_keywords.KeywordsUnavailable, match='형식'):
        news_keywords.load_keywords(p, NOW)
    p.write_text(json.dumps({'generated_at': (NOW - timedelta(minutes=5)).isoformat(), 'total': 3, 'rank': []}))
    assert news_keywords.load_keywords(p, NOW)['stale'] is False
    p.write_text(json.dumps({'generated_at': (NOW - timedelta(hours=3)).isoformat(), 'total': 3, 'rank': []}))
    assert news_keywords.load_keywords(p, NOW)['stale'] is True


def test_btc_24h_api(session_factory, mocker):
    mocker.patch.object(btc_trend_service, 'get_btc_24h_trend',
                        return_value={'source': 'binance', 'points': [], 'change_pct': -1.5})

    def override():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override
    try:
        r = TestClient(app).get('/api/v1/market/btc-24h')
    finally:
        app.dependency_overrides.clear()
    assert r.status_code == 200
    body = r.json()
    assert body['price']['change_pct'] == -1.5
    assert len(body['liquidations']['hours']) == 24 and body['liquidations']['covered_from'] is None


def test_btc_24h_api_reports_price_failure(mocker):
    mocker.patch.object(btc_trend_service, 'get_btc_24h_trend', side_effect=RuntimeError('timeout'))
    r = TestClient(app).get('/api/v1/market/btc-24h')
    assert r.status_code == 502 and '가격 추이' in r.json()['detail']


def test_news_keywords_api(tmp_path, mocker):
    from backend.app.api.routes import news
    p = tmp_path / 'k.json'
    settings = mocker.Mock(mynews_keywords_path=p)
    mocker.patch.object(news, 'get_settings', return_value=settings)
    client = TestClient(app)
    assert client.get('/api/v1/news/keywords').status_code == 503
    p.write_text(json.dumps({'generated_at': datetime.now(timezone.utc).isoformat(), 'total': 1,
                             'rank': [{'name': 'ETF', 'count': 3, 'recent': 2, 'items': []}]}))
    r = client.get('/api/v1/news/keywords')
    assert r.status_code == 200 and r.json()['rank'][0]['name'] == 'ETF' and r.json()['stale'] is False
