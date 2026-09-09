"""출금 중단 지속 시작 시각(disabled_since) 산출 단위 테스트."""
from __future__ import annotations

import datetime as dt

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.db.base import Base
from backend.app.db.models import CrawlRun, WithdrawalFeeSnapshot
from backend.app.db.repositories import get_withdrawal_disabled_since

KEY = ('bithumb', 'USDT', 'TRC20')


def _new_session():
    engine = create_engine(
        'sqlite://', future=True,
        connect_args={'check_same_thread': False}, poolclass=StaticPool,
    )
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)
    Base.metadata.create_all(bind=engine)
    return Session()


def _add_runs(db, count: int, *, base: dt.datetime, status: str = 'success') -> list[CrawlRun]:
    """base 시각부터 1시간 간격으로 크롤 실행 이력을 만든다(오래된 것부터)."""
    runs = []
    for i in range(count):
        moment = base + dt.timedelta(hours=i)
        run = CrawlRun(trigger='test', status=status, started_at=moment, completed_at=moment)
        db.add(run)
        runs.append(run)
    db.flush()
    return runs


def _add_snapshot(db, run: CrawlRun, *, enabled: bool, key: tuple[str, str, str] = KEY) -> None:
    exchange, coin, network_label = key
    db.add(WithdrawalFeeSnapshot(
        crawl_run_id=run.id, exchange=exchange, coin=coin, network_label=network_label,
        enabled=enabled, source='realtime_api', recorded_at=run.completed_at,
    ))


class TestGetWithdrawalDisabledSince:
    def test_returns_empty_dict_for_no_keys(self):
        db = _new_session()
        assert get_withdrawal_disabled_since(db, []) == {}

    def test_uses_first_disabled_observation_after_last_enabled_run(self):
        """활성 → 비활성 전환이 이력에 있으면 전환이 처음 관측된 크롤 시각을 반환한다."""
        db = _new_session()
        base = dt.datetime(2026, 9, 1, 0, 0, tzinfo=dt.timezone.utc)
        runs = _add_runs(db, 5, base=base)
        for run in runs[:2]:
            _add_snapshot(db, run, enabled=True)
        for run in runs[2:]:
            _add_snapshot(db, run, enabled=False)
        db.commit()

        result = get_withdrawal_disabled_since(db, [KEY])
        assert result[KEY]['exact'] is True
        assert result[KEY]['disabled_since'] == int(runs[2].completed_at.timestamp())

    def test_marks_lower_bound_when_never_enabled_in_history(self):
        """보존된 이력 전체가 비활성이면 가장 오래된 관측 시각 + exact=False 를 반환한다."""
        db = _new_session()
        base = dt.datetime(2026, 9, 1, 0, 0, tzinfo=dt.timezone.utc)
        runs = _add_runs(db, 3, base=base)
        for run in runs:
            _add_snapshot(db, run, enabled=False)
        db.commit()

        result = get_withdrawal_disabled_since(db, [KEY])
        assert result[KEY]['exact'] is False
        assert result[KEY]['disabled_since'] == int(runs[0].completed_at.timestamp())

    def test_counts_only_latest_suspension_streak(self):
        """중단 → 재개 → 재중단이면 마지막 중단 구간의 시작 시각만 반환한다."""
        db = _new_session()
        base = dt.datetime(2026, 9, 1, 0, 0, tzinfo=dt.timezone.utc)
        runs = _add_runs(db, 6, base=base)
        for run, enabled in zip(runs, [True, False, False, True, False, False]):
            _add_snapshot(db, run, enabled=enabled)
        db.commit()

        result = get_withdrawal_disabled_since(db, [KEY])
        assert result[KEY]['exact'] is True
        assert result[KEY]['disabled_since'] == int(runs[4].completed_at.timestamp())

    def test_ignores_failed_crawl_runs(self):
        """실패한 크롤의 스냅샷은 판단 근거에서 제외한다."""
        db = _new_session()
        base = dt.datetime(2026, 9, 1, 0, 0, tzinfo=dt.timezone.utc)
        ok_runs = _add_runs(db, 2, base=base)
        failed_runs = _add_runs(db, 1, base=base + dt.timedelta(hours=2), status='failed')
        later_runs = _add_runs(db, 1, base=base + dt.timedelta(hours=3))
        _add_snapshot(db, ok_runs[0], enabled=True)
        _add_snapshot(db, ok_runs[1], enabled=False)
        _add_snapshot(db, failed_runs[0], enabled=True)
        _add_snapshot(db, later_runs[0], enabled=False)
        db.commit()

        result = get_withdrawal_disabled_since(db, [KEY])
        assert result[KEY]['disabled_since'] == int(ok_runs[1].completed_at.timestamp())

    def test_separates_keys_of_same_exchange(self):
        """같은 거래소의 다른 네트워크는 각자의 중단 시작 시각을 갖는다."""
        db = _new_session()
        base = dt.datetime(2026, 9, 1, 0, 0, tzinfo=dt.timezone.utc)
        other = ('bithumb', 'USDT', 'ERC20')
        runs = _add_runs(db, 4, base=base)
        for run, enabled in zip(runs, [True, False, False, False]):
            _add_snapshot(db, run, enabled=enabled)
        for run, enabled in zip(runs, [True, True, True, False]):
            _add_snapshot(db, run, enabled=enabled, key=other)
        db.commit()

        result = get_withdrawal_disabled_since(db, [KEY, other])
        assert result[KEY]['disabled_since'] == int(runs[1].completed_at.timestamp())
        assert result[other]['disabled_since'] == int(runs[3].completed_at.timestamp())

    def test_returns_none_when_key_has_no_disabled_observation(self):
        """계속 활성인 키는 disabled_since 가 None 이다."""
        db = _new_session()
        base = dt.datetime(2026, 9, 1, 0, 0, tzinfo=dt.timezone.utc)
        runs = _add_runs(db, 2, base=base)
        for run in runs:
            _add_snapshot(db, run, enabled=True)
        db.commit()

        result = get_withdrawal_disabled_since(db, [KEY])
        assert result[KEY]['disabled_since'] is None


class TestWithdrawalFeesApiExposesDisabledSince:
    """`/market/withdrawal-fees/latest` 응답에 중단 시작 시각이 실려야 한다."""

    def test_disabled_row_carries_disabled_since(self):
        from fastapi.testclient import TestClient

        from backend.app.api.routes.market._shared import _status_cache
        from backend.app.db.session import get_db
        from backend.app.main import app

        db = _new_session()
        base = dt.datetime(2026, 9, 1, 0, 0, tzinfo=dt.timezone.utc)
        runs = _add_runs(db, 3, base=base)
        _add_snapshot(db, runs[0], enabled=True)
        _add_snapshot(db, runs[1], enabled=False)
        _add_snapshot(db, runs[2], enabled=False)
        db.commit()

        _status_cache.clear()
        app.dependency_overrides[get_db] = lambda: db
        try:
            response = TestClient(app).get('/api/v1/market/withdrawal-fees/latest')
        finally:
            app.dependency_overrides.clear()
            _status_cache.clear()

        assert response.status_code == 200
        items = response.json()['items']
        assert len(items) == 1
        assert items[0]['enabled'] is False
        assert items[0]['disabled_since'] == int(runs[1].completed_at.timestamp())
        assert items[0]['disabled_since_exact'] is True
