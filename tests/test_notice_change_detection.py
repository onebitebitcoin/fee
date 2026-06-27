"""네트워크 상태 변경 감지 단위 테스트"""
from __future__ import annotations

import datetime as dt
from unittest.mock import MagicMock, patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.db.base import Base
from backend.app.db.models import CrawlRun, ExchangeNotice, WithdrawalFeeSnapshot
from backend.app.db.repositories import get_recent_network_changes
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


class TestRelatedNoticesPrecision:
    """get_recent_network_changes 가 'USDT' 변경에 'HUSDT' 선물 공지를 오첨부하지 않아야 한다.

    라이브 버그 재현: SQL ILIKE '%USDT%' 가 'HUSDT' 제목에 substring으로 걸려,
    Kaia USDT 출금중단 행에 무관한 바이낸스 선물 공지가 붙던 문제.
    """

    def _new_session(self):
        engine = create_engine(
            'sqlite://', future=True,
            connect_args={'check_same_thread': False}, poolclass=StaticPool,
        )
        Session = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)
        Base.metadata.create_all(bind=engine)
        return Session()

    def test_husdt_futures_not_attached_to_usdt_change(self):
        db = self._new_session()
        now = dt.datetime.now(dt.timezone.utc)
        prev = CrawlRun(trigger='test', status='success',
                        started_at=now - dt.timedelta(hours=2), completed_at=now - dt.timedelta(hours=2))
        curr = CrawlRun(trigger='test', status='success',
                        started_at=now - dt.timedelta(hours=1), completed_at=now - dt.timedelta(hours=1))
        db.add_all([prev, curr])
        db.flush()

        # prev: 활성 → curr: 비활성 (Kaia USDT 출금 중단)
        db.add(WithdrawalFeeSnapshot(crawl_run_id=prev.id, exchange='binance',
                                     coin='USDT', network_label='Kaia', enabled=True,
                                     source='scraped_page', recorded_at=now))
        db.add(WithdrawalFeeSnapshot(crawl_run_id=curr.id, exchange='binance',
                                     coin='USDT', network_label='Kaia', enabled=False,
                                     source='scraped_page', recorded_at=now))

        # 오탐 후보(HUSDT 선물) + 정상(USDT/Kaia 출금 중단)
        db.add(ExchangeNotice(
            crawl_run_id=curr.id, exchange='binance',
            title='Binance Futures Will End Last Price Protected Period on USDⓈ-Margined HUSDT Perpetual Contract',
            url='https://www.binance.com/en/support/announcement/detail/16c1e35bfa7544ce9440e53dbc862473',
            noticed_at=now))
        db.add(ExchangeNotice(
            crawl_run_id=curr.id, exchange='binance',
            title='Binance Will Suspend USDT Withdrawals on Kaia Network',
            url='https://www.binance.com/en/support/announcement/detail/real-usdt-kaia',
            noticed_at=now))
        db.commit()

        changes = get_recent_network_changes(db, hours=24)
        usdt = [c for c in changes if c['exchange'] == 'binance' and c['coin'] == 'USDT']
        assert usdt, 'Kaia USDT 출금 중단 변경이 감지돼야 한다'
        titles = [n['title'] for c in usdt for n in c['related_notices']]
        assert any('Kaia' in t for t in titles), '정상 USDT/Kaia 공지는 첨부돼야 한다'
        assert not any('HUSDT' in t for t in titles), 'HUSDT 선물 공지는 첨부되면 안 된다'


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
