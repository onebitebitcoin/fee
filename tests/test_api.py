from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.db.base import Base
from backend.app.db.models import CrawlRun, TickerSnapshot, WithdrawalFeeSnapshot
from backend.app.db.session import get_db
from backend.app.main import app


def make_test_session():
    engine = create_engine(
        'sqlite://',
        future=True,
        connect_args={'check_same_thread': False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)
    Base.metadata.create_all(bind=engine)
    return engine, TestingSessionLocal


def test_healthcheck():
    client = TestClient(app)
    response = client.get('/api/v1/health')
    assert response.status_code == 200
    assert response.json() == {'status': 'ok'}


def test_latest_tickers_returns_empty_without_crawl():
    engine, TestingSessionLocal = make_test_session()

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)
    response = client.get('/api/v1/market/tickers/latest')
    assert response.status_code == 200
    assert response.json()['items'] == []
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def test_cheapest_path_uses_latest_snapshot_data():
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

    db.add_all([
        TickerSnapshot(
            crawl_run_id=crawl_run.id,
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
            crawl_run_id=crawl_run.id,
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
            crawl_run_id=crawl_run.id,
            exchange='upbit',
            coin='USDT',
            source='scraped_page',
            network_label='TRC20',
            fee=9.0,
            fee_usd=9.0,
            fee_krw=12600.0,
            enabled=True,
            note='snapshot value',
        ),
    ])
    db.commit()
    db.close()

    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)
    response = client.get('/api/v1/market/path-finder/cheapest?amount_krw=1000000&global_exchange=binance')
    assert response.status_code == 200
    payload = response.json()
    assert payload['data_source'] == 'latest_snapshot'
    assert payload['best_path']['network'] == 'TRC20'
    assert payload['best_path']['breakdown']['components'][1]['amount_text'] == '9.0 USDT'
    assert payload['best_path']['breakdown']['components'][1]['amount_krw'] == 12600

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def test_trigger_crawl_persists_rows(mocker):
    from backend.app.services import live_market

    engine, TestingSessionLocal = make_test_session()

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    mocker.patch.object(live_market, 'ALL_EXCHANGES', ['upbit'])
    mocker.patch.object(live_market, 'fetch_usd_krw_rate', return_value=1400.0)
    mocker.patch.object(live_market, 'get_ticker', return_value={
        'exchange': 'upbit',
        'pair': 'BTC/KRW',
        'market_type': 'spot',
        'price': 150000000.0,
        'high_24h': 151000000.0,
        'low_24h': 149000000.0,
        'volume_24h_btc': 10.0,
        'currency': 'KRW',
        'maker_fee_pct': 0.05,
        'taker_fee_pct': 0.05,
        'maker_fee_usd': 50.0,
        'maker_fee_krw': 70000.0,
        'taker_fee_usd': 50.0,
        'taker_fee_krw': 70000.0,
        'usd_krw_rate': 1400,
    })
    mocker.patch.object(live_market, 'get_withdrawal_fees', side_effect=[
        {'exchange': 'upbit', 'coin': 'BTC', 'source': 'official_docs', 'networks': [{'label': 'Bitcoin', 'fee': 0.0002, 'fee_usd': 20.0, 'fee_krw': 28000.0, 'enabled': True, 'note': 'test'}]},
        {'exchange': 'upbit', 'coin': 'USDT', 'source': 'official_docs', 'networks': [{'label': 'TRC20', 'fee': 1.0, 'fee_usd': 1.0, 'fee_krw': 1400.0, 'enabled': True, 'note': 'test'}]},
    ])
    mocker.patch.object(live_market, 'get_network_status', return_value={
        'exchanges': {'upbit': {'status': 'ok', 'suspended_networks': [], 'checked_at': '2026-03-10T00:00:00'}}
    })

    client = TestClient(app)
    response = client.post('/api/v1/crawl-runs')
    assert response.status_code == 201
    payload = response.json()
    assert payload['status'] == 'success'

    tickers = client.get('/api/v1/market/tickers/latest').json()['items']
    withdrawals = client.get('/api/v1/market/withdrawal-fees/latest').json()['items']
    network = client.get('/api/v1/market/network-status/latest').json()
    assert len(tickers) == 1
    assert len(withdrawals) == 2
    assert network['exchanges']['upbit']['status'] == 'ok'

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def test_withdrawal_latest_exposes_source_url_for_realtime_api_rows():
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
    db.add(
        WithdrawalFeeSnapshot(
            crawl_run_id=crawl_run.id,
            exchange='bithumb',
            coin='USDT',
            source='realtime_api',
            network_label='TRC20',
            fee=0.0,
            fee_usd=0.0,
            fee_krw=0.0,
            enabled=True,
            note='api row',
        )
    )
    db.commit()
    db.close()

    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)
    response = client.get('/api/v1/market/withdrawal-fees/latest')
    assert response.status_code == 200
    payload = response.json()
    row = payload['items'][0]
    assert row['exchange'] == 'bithumb'
    assert row['source_url'] == 'https://gw.bithumb.com/exchange/v1/coin-inout/info'

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)
