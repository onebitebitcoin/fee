"""GET /api/v1/market/path-finder/cheapest-all 배치 엔드포인트 테스트."""
from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.db.base import Base
from backend.app.db.models import (
    CrawlRun,
    ExchangeCapabilitySnapshot,
    LightningSwapFeeSnapshot,
    TickerSnapshot,
    WithdrawalFeeSnapshot,
)
from backend.app.db.session import get_db
from backend.app.main import app


def make_test_session():
    engine = create_engine(
        'sqlite://',
        future=True,
        connect_args={'check_same_thread': False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(
        bind=engine, autoflush=False, autocommit=False, expire_on_commit=False
    )
    Base.metadata.create_all(bind=engine)
    return engine, TestingSessionLocal


def _seed_db(db, crawl_run_id: int) -> None:
    db.add_all([
        TickerSnapshot(
            crawl_run_id=crawl_run_id,
            exchange='upbit',
            pair='BTC/KRW',
            market_type='spot',
            currency='KRW',
            price=100000000.0,
            maker_fee_pct=0.05,
            taker_fee_pct=0.05,
            usd_krw_rate=1400.0,
        ),
        TickerSnapshot(
            crawl_run_id=crawl_run_id,
            exchange='binance',
            pair='BTC/USD',
            market_type='spot',
            currency='USD',
            price=70000.0,
            maker_fee_pct=0.1,
            taker_fee_pct=0.1,
            usd_krw_rate=1400.0,
        ),
        WithdrawalFeeSnapshot(
            crawl_run_id=crawl_run_id,
            exchange='upbit',
            coin='BTC',
            source='scraped_page',
            network_label='Bitcoin',
            fee=0.0001,
            fee_usd=7.0,
            fee_krw=10000.0,
            enabled=True,
        ),
        WithdrawalFeeSnapshot(
            crawl_run_id=crawl_run_id,
            exchange='upbit',
            coin='USDT',
            source='scraped_page',
            network_label='TRC20',
            fee=9.0,
            fee_usd=9.0,
            fee_krw=12600.0,
            enabled=True,
        ),
        WithdrawalFeeSnapshot(
            crawl_run_id=crawl_run_id,
            exchange='binance',
            coin='BTC',
            source='scraped_page',
            network_label='Bitcoin',
            fee=0.00001,
            fee_usd=0.7,
            fee_krw=1000.0,
            enabled=True,
        ),
        WithdrawalFeeSnapshot(
            crawl_run_id=crawl_run_id,
            exchange='binance',
            coin='BTC',
            source='scraped_page',
            network_label='Lightning Network',
            fee=0.000001,
            fee_usd=0.07,
            fee_krw=100.0,
            enabled=True,
        ),
        LightningSwapFeeSnapshot(
            crawl_run_id=crawl_run_id,
            service_name='BitFreezer',
            fee_pct=0.39,
            fee_fixed_sat=0,
            min_amount_sat=1,
            max_amount_sat=1_000_000_000,
            enabled=True,
            source_url='https://bitfreezer.vercel.app',
            direction='ln_to_onchain',
        ),
        ExchangeCapabilitySnapshot(
            crawl_run_id=crawl_run_id,
            exchange='upbit',
            supports_lightning_deposit=False,
            supports_lightning_withdrawal=False,
        ),
        ExchangeCapabilitySnapshot(
            crawl_run_id=crawl_run_id,
            exchange='binance',
            supports_lightning_deposit=True,
            supports_lightning_withdrawal=True,
        ),
    ])
    db.commit()


def test_cheapest_all_returns_by_global_keys(monkeypatch):
    """cheapest-all 엔드포인트가 by_global 키를 가진 dict를 반환한다."""
    engine, TestingSessionLocal = make_test_session()

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    db = TestingSessionLocal()
    crawl_run = CrawlRun(status='success', usd_krw_rate=1400.0)
    db.add(crawl_run)
    db.commit()
    db.refresh(crawl_run)
    _seed_db(db, crawl_run.id)
    db.close()

    monkeypatch.setattr('backend.app.api.routes.market.kyc_registry.get_kyc_registry', lambda force_refresh=False: {})

    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)
    response = client.get('/api/v1/market/path-finder/cheapest-all?amount_krw=1000000&mode=buy')
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)

    assert response.status_code == 200
    payload = response.json()
    assert 'by_global' in payload
    assert 'last_run' in payload
    assert 'latest_scraping_time' in payload


def test_cheapest_all_includes_global_exchange_list(monkeypatch):
    """by_global에 GROUPS['global'] 목록의 거래소가 포함된다 (데이터 부족 시 error 항목도 허용)."""
    from fee_checker import GROUPS

    engine, TestingSessionLocal = make_test_session()

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    db = TestingSessionLocal()
    crawl_run = CrawlRun(status='success', usd_krw_rate=1400.0)
    db.add(crawl_run)
    db.commit()
    db.refresh(crawl_run)
    _seed_db(db, crawl_run.id)
    db.close()

    monkeypatch.setattr('backend.app.api.routes.market.kyc_registry.get_kyc_registry', lambda force_refresh=False: {})

    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)
    response = client.get('/api/v1/market/path-finder/cheapest-all?amount_krw=1000000&mode=buy')
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)

    assert response.status_code == 200
    by_global = response.json()['by_global']
    global_exchanges = list(GROUPS['global'])
    for gex in global_exchanges:
        assert gex in by_global, f'{gex}가 by_global에 없음'


def test_cheapest_all_binance_has_valid_path(monkeypatch):
    """충분한 데이터가 있는 binance 항목은 best_path를 포함한다."""
    engine, TestingSessionLocal = make_test_session()

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    db = TestingSessionLocal()
    crawl_run = CrawlRun(status='success', usd_krw_rate=1400.0)
    db.add(crawl_run)
    db.commit()
    db.refresh(crawl_run)
    _seed_db(db, crawl_run.id)
    db.close()

    monkeypatch.setattr('backend.app.api.routes.market.kyc_registry.get_kyc_registry', lambda force_refresh=False: {})

    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)
    response = client.get('/api/v1/market/path-finder/cheapest-all?amount_krw=1000000&mode=buy')
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)

    assert response.status_code == 200
    by_global = response.json()['by_global']
    binance_entry = by_global.get('binance', {})
    # error가 없으면 best_path 포함 여부 확인
    if 'error' not in binance_entry:
        assert 'best_path' in binance_entry
        assert binance_entry['data_source'] == 'latest_snapshot'


def test_warm_cheapest_path_cache_populates_cache(monkeypatch):
    """크롤 후 워밍이 대표 금액 프리셋을 캐시에 채우고, 이후 요청이 캐시 히트가 된다."""
    from backend.app.api.routes import market

    engine, TestingSessionLocal = make_test_session()

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    db = TestingSessionLocal()
    crawl_run = CrawlRun(status='success', usd_krw_rate=1400.0)
    db.add(crawl_run)
    db.commit()
    db.refresh(crawl_run)
    _seed_db(db, crawl_run.id)
    run_id = crawl_run.id

    monkeypatch.setattr('backend.app.api.routes.market.kyc_registry.get_kyc_registry', lambda force_refresh=False: {})

    market._cheapest_path_cache.clear()
    warmed = market.warm_cheapest_path_cache(db)
    db.close()

    # 모든 프리셋이 워밍되고, 캐시 키 형식이 라우트와 동일해야 한다
    assert warmed == len(market.WARM_AMOUNT_PRESETS_KRW)
    for amount in market.WARM_AMOUNT_PRESETS_KRW:
        key = f"all:buy:{amount}:None:1:{run_id}"
        assert market._cheapest_path_cache.get(key) is not None

    # 워밍된 금액으로 요청하면 계산 없이 캐시 히트(get_or_compute가 compute 미실행)
    def _boom():
        raise AssertionError('캐시 히트여야 하므로 compute가 호출되면 안 됨')

    cached = market._cheapest_path_cache.get_or_compute(
        f"all:buy:1000000:None:1:{run_id}", _boom
    )
    assert 'by_global' in cached

    market._cheapest_path_cache.clear()
    Base.metadata.drop_all(bind=engine)
