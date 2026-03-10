from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.db.base import Base
from backend.app.services.crawl_service import CrawlService


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


def test_run_full_crawl_records_partial_success(mocker):
    from backend.app.services import live_market

    engine, TestingSessionLocal = make_test_session()

    mocker.patch.object(live_market, 'ALL_EXCHANGES', ['upbit', 'binance'])
    mocker.patch.object(live_market, 'fetch_usd_krw_rate', return_value=1400.0)
    mocker.patch.object(live_market, 'get_ticker', side_effect=[
        {
            'exchange': 'upbit',
            'pair': 'BTC/KRW',
            'market_type': 'spot',
            'price': 150000000.0,
            'currency': 'KRW',
            'maker_fee_pct': 0.05,
            'taker_fee_pct': 0.05,
        },
        {'error': 'binance down'},
    ])
    mocker.patch.object(live_market, 'get_withdrawal_fees', side_effect=[
        {'exchange': 'upbit', 'coin': 'BTC', 'source': 'official_docs', 'networks': []},
        {'exchange': 'upbit', 'coin': 'USDT', 'source': 'official_docs', 'networks': []},
        {'exchange': 'binance', 'coin': 'BTC', 'source': 'realtime_api', 'networks': []},
        {'exchange': 'binance', 'coin': 'USDT', 'error': 'withdrawal fail'},
    ])
    mocker.patch.object(live_market, 'get_network_status', return_value={'exchanges': {'upbit': {'status': 'ok', 'suspended_networks': [], 'checked_at': 'now'}}})

    with TestingSessionLocal() as db:
        result = CrawlService(db).run_full_crawl(trigger='scheduler')
        assert result.status == 'partial_success'
        assert 'errors=2' in (result.message or '')

    Base.metadata.drop_all(bind=engine)
