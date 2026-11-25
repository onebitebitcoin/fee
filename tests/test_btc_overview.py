"""첫 화면 보강 — 24시간 가격 추이, 선물 시장 신호, 뉴스 키워드 파일, 두 API."""
import json
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.services import btc_trend_service, derivatives_service, news_keywords

NOW = datetime(2026, 11, 9, 7, 30, tzinfo=timezone.utc)


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
    p.write_text(json.dumps({'generated_at': (NOW - timedelta(hours=4)).isoformat(), 'total': 3, 'rank': []}))
    assert news_keywords.load_keywords(p, NOW)['stale'] is True


def test_load_keywords_stale_follows_latest_article_not_file_time(tmp_path):
    p = tmp_path / 'btc_issues.json'

    def write(latest_hours_ago):
        p.write_text(json.dumps({'generated_at': NOW.isoformat(), 'total': 3, 'rank': [],
                                 'latest_at': (NOW - timedelta(hours=latest_hours_ago)).isoformat()}))

    write(2)  # 수집 간격이 정상 범위(최대 1.9시간)를 조금 넘는 수준이면 지연이 아니다
    assert news_keywords.load_keywords(p, NOW)['stale'] is False
    write(4)  # 파일은 방금 만들어졌어도 새 기사가 4시간째 없으면 수집이 멈춘 것이다
    assert news_keywords.load_keywords(p, NOW)['stale'] is True
    p.write_text(json.dumps({'generated_at': NOW.isoformat(), 'total': 0, 'rank': [],
                             'latest_at': '2026-11-08T20:00:00'}))  # 시간대 표기가 없으면 UTC
    assert news_keywords.load_keywords(p, NOW)['stale'] is True


def test_btc_24h_api(mocker):
    mocker.patch.object(btc_trend_service, 'get_btc_24h_trend',
                        return_value={'source': 'binance', 'points': [], 'change_pct': -1.5})
    mocker.patch.object(derivatives_service, 'get_derivatives_summary', side_effect=RuntimeError('451'))

    r = TestClient(app).get('/api/v1/market/btc-24h')
    assert r.status_code == 200
    body = r.json()
    assert body['price']['change_pct'] == -1.5
    assert 'liquidations' not in body
    # 선물 신호가 실패해도 가격은 나가고, 실패 이유를 따로 알린다
    assert body['derivatives'] is None and body['derivatives_error'] == '451'


def test_parse_funding_converts_to_percent():
    out = derivatives_service.parse_funding({'lastFundingRate': '0.00007817', 'nextFundingTime': 1795593600000})
    assert out['funding_rate_pct'] == pytest.approx(0.007817)
    assert out['next_funding_time'].startswith('2026-11-')


def test_parse_open_interest_compares_btc_amount_oldest_to_newest():
    rows = [  # 바이낸스가 순서를 보장하지 않아도 시각 순으로 맞춘다
        {'timestamp': 3, 'sumOpenInterest': '110', 'sumOpenInterestValue': '7000000'},
        {'timestamp': 1, 'sumOpenInterest': '100', 'sumOpenInterestValue': '5000000'},
        {'timestamp': 2, 'sumOpenInterest': '105', 'sumOpenInterestValue': '6000000'},
    ]
    out = derivatives_service.parse_open_interest(rows)
    assert out == {'oi_btc': 110.0, 'oi_usd': 7000000.0, 'oi_change_pct': pytest.approx(10.0)}
    with pytest.raises(ValueError):
        derivatives_service.parse_open_interest(rows[:1])


def test_derivatives_summary_merges_both_calls():
    derivatives_service._cache._store.clear()

    def fake_get(url, params):
        if url == derivatives_service.BINANCE_PREMIUM:
            return {'lastFundingRate': '0.0001', 'nextFundingTime': 1795593600000}
        assert params['limit'] == 25
        return [{'timestamp': 1, 'sumOpenInterest': '100', 'sumOpenInterestValue': '1'},
                {'timestamp': 2, 'sumOpenInterest': '98', 'sumOpenInterestValue': '1'}]

    out = derivatives_service.get_derivatives_summary(fake_get)
    derivatives_service._cache._store.clear()
    assert out['source'] == 'binance'
    assert out['funding_rate_pct'] == pytest.approx(0.01) and out['oi_change_pct'] == pytest.approx(-2.0)


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
