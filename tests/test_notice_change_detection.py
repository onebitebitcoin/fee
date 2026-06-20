"""네트워크 상태 변경 감지 단위 테스트"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

from backend.app.services.crawl_service import CrawlService


def _make_row(exchange: str, status: str, coin: str | None = None, network: str | None = None):
    row = MagicMock()
    row.exchange = exchange
    row.status = status
    row.coin = coin
    row.network = network
    return row


class TestDetectNetworkChanges:
    def test_no_changes_when_both_empty(self):
        changes = CrawlService._detect_network_changes([], [])
        assert changes == []

    def test_no_changes_when_status_unchanged(self):
        prev = [_make_row('bithumb', 'ok')]
        new = [_make_row('bithumb', 'ok')]
        changes = CrawlService._detect_network_changes(prev, new)
        assert changes == []

    def test_detects_new_suspension(self):
        prev = [_make_row('bithumb', 'ok')]
        new = [
            _make_row('bithumb', 'ok'),
            _make_row('bithumb', 'maintenance_detected', coin='USDT', network='Aptos'),
        ]
        changes = CrawlService._detect_network_changes(prev, new)
        assert len(changes) == 1
        assert changes[0]['exchange'] == 'bithumb'
        assert changes[0]['coin'] == 'USDT'
        assert changes[0]['network'] == 'Aptos'
        assert changes[0]['change_type'] == 'suspended'

    def test_detects_resumption(self):
        prev = [
            _make_row('upbit', 'ok'),
            _make_row('upbit', 'maintenance_detected', coin='BTC', network='Lightning'),
        ]
        new = [_make_row('upbit', 'ok')]
        changes = CrawlService._detect_network_changes(prev, new)
        assert len(changes) == 1
        assert changes[0]['exchange'] == 'upbit'
        assert changes[0]['change_type'] == 'resumed'

    def test_no_change_when_suspension_persists(self):
        suspended = _make_row('coinone', 'maintenance_detected', coin='BTC', network='Lightning')
        prev = [suspended]
        new = [suspended]
        changes = CrawlService._detect_network_changes(prev, new)
        assert changes == []

    def test_multiple_exchanges_with_changes(self):
        prev = [
            _make_row('bithumb', 'ok'),
            _make_row('upbit', 'maintenance_detected', coin='USDT', network='Tron'),
        ]
        new = [
            _make_row('bithumb', 'maintenance_detected', coin='USDT', network='Aptos'),
            _make_row('upbit', 'ok'),
        ]
        changes = CrawlService._detect_network_changes(prev, new)
        assert len(changes) == 2
        types = {c['change_type'] for c in changes}
        assert types == {'suspended', 'resumed'}


class TestFetchTargetedNotices:
    def test_unknown_exchange_returns_empty(self):
        from backend.app.services.notice_scraper import fetch_notices_for_exchange
        result = fetch_notices_for_exchange('unknown_exchange_xyz', ['BTC'])
        assert result == []

    def test_filters_by_extra_keywords(self):
        sample_notices = [
            {'exchange': 'bithumb', 'title': '테더(USDT) Aptos 네트워크 출금 중단', 'url': 'http://example.com/1', 'published_at': None},
            {'exchange': 'bithumb', 'title': '창립 12주년 이벤트', 'url': 'http://example.com/2', 'published_at': None},
            {'exchange': 'bithumb', 'title': 'BTC 입금 재개 안내', 'url': 'http://example.com/3', 'published_at': None},
        ]

        from backend.app.services.notice_scraper import fetch_notices_for_exchange
        with patch('backend.app.services.notice_scraper.fetch_bithumb_notices', return_value=sample_notices):
            result = fetch_notices_for_exchange('bithumb', ['USDT', 'Aptos'])
        assert len(result) == 1
        assert 'Aptos' in result[0]['title']
