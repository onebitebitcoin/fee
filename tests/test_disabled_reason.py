"""출금 중단 사유(suspension_reason)와 관련 공지 노출 테스트."""
from __future__ import annotations

import datetime as dt

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.db.base import Base
from backend.app.db.models import CrawlRun, ExchangeNotice, WithdrawalFeeSnapshot
from backend.app.db.repositories import get_notices_for_disabled_networks
from backend.app.domain.notice_match import is_suspension_notice, network_keywords

KEY = ('bithumb', 'USDT', 'TRC20')


def _new_session():
    engine = create_engine(
        'sqlite://', future=True,
        connect_args={'check_same_thread': False}, poolclass=StaticPool,
    )
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)
    Base.metadata.create_all(bind=engine)
    return Session()


class TestNetworkKeywords:
    """네트워크 라벨과 공지 표기가 달라도 이어지도록 별칭을 넓힌다."""

    def test_trc20_label_also_matches_tron(self):
        """빗썸은 라벨을 'TRC20'으로 쓰지만 공지 제목은 'Tron 네트워크'라고 쓴다."""
        assert 'tron' in network_keywords('TRC20', 'USDT')
        assert 'trc20' in network_keywords('TRC20', 'USDT')

    def test_erc20_label_also_matches_ethereum(self):
        assert 'ethereum' in network_keywords('ERC20', 'USDT')

    def test_kaia_label_also_matches_legacy_klaytn(self):
        assert 'klaytn' in network_keywords('Kaia', 'USDT')

    def test_btc_onchain_label_includes_korean_alias(self):
        kws = network_keywords('Bitcoin (On-chain)', 'BTC')
        assert 'bitcoin' in kws and '비트코인' in kws

    def test_unknown_label_falls_back_to_its_own_tokens(self):
        """별칭이 없는 네트워크는 라벨 자체 토큰을 쓰되 불용어는 뺀다."""
        kws = network_keywords('Asset Hub Polkadot', 'USDT')
        assert 'polkadot' in kws
        assert 'the' not in kws


class TestIsSuspensionNotice:
    """중단/재개를 다루는 공지인지 가려낸다.

    코인 심볼과 네트워크만으로 매칭하면, BTC 처럼 네트워크 키워드가 코인 심볼과
    사실상 같아지는 경우 AND 조건이 무력해져 프로모션 공지까지 붙는다.
    """

    def test_korean_suspension_notice(self):
        assert is_suspension_notice('테더(USDT) Tron 네트워크 출금 일시 중단 안내')

    def test_korean_resume_notice(self):
        assert is_suspension_notice('테더(USDT) Tron 네트워크 출금 재개 안내')

    def test_korean_maintenance_notice(self):
        assert is_suspension_notice('비트코인(BTC) 지갑 시스템 점검 안내')

    def test_english_suspension_notice(self):
        assert is_suspension_notice('Binance Will Suspend USDT Withdrawals on Kaia Network')

    def test_english_maintenance_notice(self):
        assert is_suspension_notice('Notice on BTC Wallet Maintenance')

    def test_rejects_promotion_notice(self):
        assert not is_suspension_notice(
            'Binance Earn Launches BTC Yield APY Boost Promotion with Up to an Additional 1% APY'
        )

    def test_rejects_listing_notice(self):
        assert not is_suspension_notice('헤미(HEMI) 신규 거래지원 안내 (BTC, USDT 마켓)')


class TestGetNoticesForDisabledNetworks:
    def _seed_run_with_disabled_row(self, db) -> CrawlRun:
        now = dt.datetime.now(dt.timezone.utc)
        run = CrawlRun(trigger='test', status='success', started_at=now, completed_at=now)
        db.add(run)
        db.flush()
        db.add(WithdrawalFeeSnapshot(
            crawl_run_id=run.id, exchange='bithumb', coin='USDT', network_label='TRC20',
            enabled=False, source='realtime_api', recorded_at=now,
        ))
        return run

    def test_returns_empty_dict_for_no_keys(self):
        db = _new_session()
        assert get_notices_for_disabled_networks(db, []) == {}

    def test_attaches_notice_written_with_network_alias(self):
        """라벨이 'TRC20'이어도 'Tron'이라 적힌 공지를 찾아낸다."""
        db = _new_session()
        run = self._seed_run_with_disabled_row(db)
        db.add(ExchangeNotice(
            crawl_run_id=run.id, exchange='bithumb',
            title='테더(USDT) Tron 네트워크 출금 일시 중단 안내',
            url='https://feed.bithumb.com/notice/1654774',
            noticed_at=dt.datetime.now(dt.timezone.utc),
        ))
        db.commit()

        result = get_notices_for_disabled_networks(db, [KEY])
        titles = [n['title'] for n in result[KEY]]
        assert any('Tron' in t for t in titles)

    def test_finds_notice_older_than_the_72_hour_change_window(self):
        """중단이 오래됐어도 공지를 붙인다 — 창 제한이 없어야 한다."""
        db = _new_session()
        run = self._seed_run_with_disabled_row(db)
        long_ago = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=45)
        db.add(ExchangeNotice(
            crawl_run_id=run.id, exchange='bithumb',
            title='테더(USDT) Tron 네트워크 출금 일시 중단 안내',
            url='https://feed.bithumb.com/notice/1654774',
            noticed_at=long_ago, published_at=long_ago,
        ))
        db.commit()

        result = get_notices_for_disabled_networks(db, [KEY])
        assert len(result[KEY]) == 1

    def test_excludes_notice_matching_coin_only(self):
        """coin만 겹치고 네트워크가 다른 공지는 붙이지 않는다."""
        db = _new_session()
        run = self._seed_run_with_disabled_row(db)
        db.add(ExchangeNotice(
            crawl_run_id=run.id, exchange='bithumb',
            title='테더(USDT) Aptos 네트워크 출금 일시 중단 안내',
            url='https://x/aptos', noticed_at=dt.datetime.now(dt.timezone.utc),
        ))
        db.commit()

        result = get_notices_for_disabled_networks(db, [KEY])
        assert result[KEY] == []

    def test_excludes_other_exchange_notice(self):
        db = _new_session()
        run = self._seed_run_with_disabled_row(db)
        db.add(ExchangeNotice(
            crawl_run_id=run.id, exchange='upbit',
            title='테더(USDT) Tron 네트워크 출금 일시 중단 안내',
            url='https://x/upbit', noticed_at=dt.datetime.now(dt.timezone.utc),
        ))
        db.commit()

        result = get_notices_for_disabled_networks(db, [KEY])
        assert result[KEY] == []

    def test_excludes_unrelated_promotion_notice(self):
        """BTC 처럼 코인·네트워크 키워드가 겹치는 경우에도 프로모션 공지는 붙지 않는다."""
        db = _new_session()
        now = dt.datetime.now(dt.timezone.utc)
        run = CrawlRun(trigger='test', status='success', started_at=now, completed_at=now)
        db.add(run)
        db.flush()
        db.add(WithdrawalFeeSnapshot(
            crawl_run_id=run.id, exchange='binance', coin='BTC', network_label='Bitcoin',
            enabled=False, source='scraped_page', recorded_at=now,
        ))
        db.add(ExchangeNotice(
            crawl_run_id=run.id, exchange='binance',
            title='Binance Earn Launches BTC Yield APY Boost Promotion',
            url='https://x/promo', noticed_at=now,
        ))
        db.commit()

        result = get_notices_for_disabled_networks(db, [('binance', 'BTC', 'Bitcoin')])
        assert result[('binance', 'BTC', 'Bitcoin')] == []

    def test_prefers_the_most_recent_notice(self):
        """같은 네트워크 공지가 여러 건이면 최신 것이 앞에 온다 (재중단 반복 케이스)."""
        db = _new_session()
        run = self._seed_run_with_disabled_row(db)
        now = dt.datetime.now(dt.timezone.utc)
        db.add(ExchangeNotice(
            crawl_run_id=run.id, exchange='bithumb',
            title='테더(USDT) Tron 네트워크 출금 일시 중단 안내 (지난 건)',
            url='https://x/old', noticed_at=now - dt.timedelta(days=90),
        ))
        db.add(ExchangeNotice(
            crawl_run_id=run.id, exchange='bithumb',
            title='테더(USDT) Tron 네트워크 출금 일시 중단 안내',
            url='https://x/new', noticed_at=now,
        ))
        db.commit()

        result = get_notices_for_disabled_networks(db, [KEY])
        assert result[KEY][0]['url'] == 'https://x/new'


class TestWithdrawalFeesApiExposesReason:
    def test_disabled_row_carries_reason_and_notice(self):
        from fastapi.testclient import TestClient

        from backend.app.api.routes.market._shared import _status_cache
        from backend.app.db.session import get_db
        from backend.app.main import app

        db = _new_session()
        now = dt.datetime.now(dt.timezone.utc)
        run = CrawlRun(trigger='test', status='success', started_at=now, completed_at=now)
        db.add(run)
        db.flush()
        db.add(WithdrawalFeeSnapshot(
            crawl_run_id=run.id, exchange='bithumb', coin='USDT', network_label='TRC20',
            enabled=False, source='realtime_api', recorded_at=now,
            suspension_reason='System Maintenance',
            suspension_message='In order to protect your assets, we have temporarily disabled withdrawals and deposits.',
        ))
        db.add(ExchangeNotice(
            crawl_run_id=run.id, exchange='bithumb',
            title='테더(USDT) Tron 네트워크 출금 일시 중단 안내',
            url='https://feed.bithumb.com/notice/1654774', noticed_at=now,
        ))
        db.commit()

        _status_cache.clear()
        app.dependency_overrides[get_db] = lambda: db
        try:
            response = TestClient(app).get('/api/v1/market/withdrawal-fees/latest')
        finally:
            app.dependency_overrides.clear()
            _status_cache.clear()

        assert response.status_code == 200
        item = response.json()['items'][0]
        assert item['suspension_reason'] == 'System Maintenance'
        assert 'protect your assets' in item['suspension_message']
        assert item['related_notices'][0]['url'] == 'https://feed.bithumb.com/notice/1654774'
