"""SELL 경로에 Strike onchain_to_ln 서비스가 올바르게 포함되는지 검증."""
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


def _make_session():
    engine = create_engine(
        'sqlite://',
        future=True,
        connect_args={'check_same_thread': False},
        poolclass=StaticPool,
    )
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)
    Base.metadata.create_all(bind=engine)
    return engine, Session


def test_sell_lightning_strike_included_when_lightning_deposit_supported(mocker):
    """direction='onchain_to_ln' Strike 항목이 있고 거래소가 Lightning 입금 지원 시 SELL 경로에 포함된다."""
    engine, Session = _make_session()

    def override_get_db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    db = Session()
    crawl_run = CrawlRun(status='success', usd_krw_rate=1400.0)
    db.add(crawl_run)
    db.commit()
    db.refresh(crawl_run)

    db.add_all([
        TickerSnapshot(
            crawl_run_id=crawl_run.id,
            exchange='bithumb',
            pair='BTC/KRW',
            market_type='spot',
            currency='KRW',
            price=100_000_000.0,
            taker_fee_pct=0.04,
            usd_krw_rate=1400.0,
        ),
        TickerSnapshot(
            crawl_run_id=crawl_run.id,
            exchange='binance',
            pair='BTC/USD',
            market_type='spot',
            currency='USD',
            price=70_000.0,
            taker_fee_pct=0.1,
            usd_krw_rate=1400.0,
        ),
        WithdrawalFeeSnapshot(
            crawl_run_id=crawl_run.id,
            exchange='bithumb',
            coin='BTC',
            source='scraped_page',
            network_label='Bitcoin',
            fee=0.0001,
            fee_krw=10_000.0,
            enabled=True,
        ),
        # Strike onchain_to_ln: 0% 수수료
        LightningSwapFeeSnapshot(
            crawl_run_id=crawl_run.id,
            service_name='Strike',
            fee_pct=0.0,
            fee_fixed_sat=0,
            min_amount_sat=1_000,
            max_amount_sat=100_000_000,
            enabled=True,
            direction='onchain_to_ln',
        ),
        # bithumb: Lightning 입금 지원
        ExchangeCapabilitySnapshot(
            crawl_run_id=crawl_run.id,
            exchange='bithumb',
            supports_lightning_deposit=True,
            supports_lightning_withdrawal=True,
        ),
        ExchangeCapabilitySnapshot(
            crawl_run_id=crawl_run.id,
            exchange='binance',
            supports_lightning_deposit=True,
            supports_lightning_withdrawal=True,
        ),
    ])
    db.commit()
    db.close()

    mocker.patch('backend.app.api.routes.market.kyc_registry.get_kyc_registry', return_value={
        'bithumbbtc': {'is_kyc': True},
        'binancebtc': {'is_kyc': True},
    })
    mocker.patch('backend.app.domain.market_paths._estimate_wallet_btc_network_fee_btc', return_value=0.00001)

    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)
    response = client.get('/api/v1/market/path-finder/cheapest?mode=sell&amount_btc=0.01&global_exchange=binance')
    assert response.status_code == 200
    payload = response.json()

    strike_paths = [
        p for p in payload['all_paths']
        if p.get('lightning_exit_provider') == 'Strike'
    ]
    assert len(strike_paths) > 0, 'Strike SELL 경로가 결과에 포함되어야 함'

    strike_path = strike_paths[0]
    assert strike_path['route_variant'] == 'lightning_direct'
    components = strike_path['breakdown']['components']
    assert len(components) == 3, f'breakdown 컴포넌트 3개 기대, 실제: {len(components)}'
    labels = [c['label'] for c in components]
    assert any('네트워크 수수료' in lbl for lbl in labels), '개인지갑 네트워크 수수료 컴포넌트 없음'
    assert any('Strike' in lbl for lbl in labels), 'Strike 스왑 수수료 컴포넌트 없음'
    assert any('매도' in lbl for lbl in labels), '국내 매도 수수료 컴포넌트 없음'

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def test_sell_lightning_strike_excluded_without_lightning_deposit(mocker):
    """한국 거래소가 Lightning 입금 미지원이면 Strike SELL 경로가 제외된다."""
    engine, Session = _make_session()

    def override_get_db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    db = Session()
    crawl_run = CrawlRun(status='success', usd_krw_rate=1400.0)
    db.add(crawl_run)
    db.commit()
    db.refresh(crawl_run)

    db.add_all([
        TickerSnapshot(
            crawl_run_id=crawl_run.id,
            exchange='bithumb',
            pair='BTC/KRW',
            market_type='spot',
            currency='KRW',
            price=100_000_000.0,
            taker_fee_pct=0.04,
            usd_krw_rate=1400.0,
        ),
        TickerSnapshot(
            crawl_run_id=crawl_run.id,
            exchange='binance',
            pair='BTC/USD',
            market_type='spot',
            currency='USD',
            price=70_000.0,
            taker_fee_pct=0.1,
            usd_krw_rate=1400.0,
        ),
        WithdrawalFeeSnapshot(
            crawl_run_id=crawl_run.id,
            exchange='bithumb',
            coin='BTC',
            source='scraped_page',
            network_label='Bitcoin',
            fee=0.0001,
            fee_krw=10_000.0,
            enabled=True,
        ),
        LightningSwapFeeSnapshot(
            crawl_run_id=crawl_run.id,
            service_name='Strike',
            fee_pct=0.0,
            fee_fixed_sat=0,
            min_amount_sat=1_000,
            max_amount_sat=100_000_000,
            enabled=True,
            direction='onchain_to_ln',
        ),
        # bithumb: Lightning 입금 미지원
        ExchangeCapabilitySnapshot(
            crawl_run_id=crawl_run.id,
            exchange='bithumb',
            supports_lightning_deposit=False,
            supports_lightning_withdrawal=False,
        ),
    ])
    db.commit()
    db.close()

    mocker.patch('backend.app.api.routes.market.kyc_registry.get_kyc_registry', return_value={})
    mocker.patch('backend.app.domain.market_paths._estimate_wallet_btc_network_fee_btc', return_value=0.00001)

    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)
    response = client.get('/api/v1/market/path-finder/cheapest?mode=sell&amount_btc=0.01&global_exchange=binance')
    assert response.status_code == 200
    payload = response.json()

    strike_paths = [p for p in payload['all_paths'] if p.get('lightning_exit_provider') == 'Strike']
    assert len(strike_paths) == 0, 'Lightning 입금 미지원 거래소에서는 Strike 경로가 제외되어야 함'

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def test_fetch_strike_onchain_to_ln_fees_direction():
    """fetch_strike_onchain_to_ln_fees()가 올바른 direction과 수수료를 반환한다."""
    from backend.app.services.lightning_scraper import fetch_strike_onchain_to_ln_fees

    result = fetch_strike_onchain_to_ln_fees()
    assert result['direction'] == 'onchain_to_ln'
    assert result['fee_pct'] == 0.0
    assert result['service_name'] == 'Strike'
    assert result['enabled'] is True


def test_get_all_lightning_swap_fees_includes_strike_both_directions(mocker):
    """Strike API가 정상 응답할 때 get_all_lightning_swap_fees()에 양방향 항목이 모두 포함된다."""
    import requests as _requests
    from backend.app.services.lightning_scraper import get_all_lightning_swap_fees

    mock_resp = mocker.MagicMock()
    mock_resp.status_code = 200
    mock_resp.raise_for_status.return_value = None
    mock_resp.json.return_value = [{'code': 'BTC'}]
    mocker.patch.object(_requests, 'get', return_value=mock_resp)

    all_fees = get_all_lightning_swap_fees()
    strike_entries = [s for s in all_fees if s.get('service_name') == 'Strike']
    directions = {s['direction'] for s in strike_entries}
    assert 'ln_to_onchain' in directions, 'Strike ln_to_onchain 항목 없음'
    assert 'onchain_to_ln' in directions, 'Strike onchain_to_ln 항목 없음'


def test_get_all_lightning_swap_fees_includes_boltz_submarine_ln_to_onchain():
    """get_all_lightning_swap_fees()에 Boltz (Submarine) ln_to_onchain 항목이 포함된다."""
    from backend.app.services.lightning_scraper import get_all_lightning_swap_fees

    all_fees = get_all_lightning_swap_fees()
    boltz_sub = [s for s in all_fees if s.get('service_name') == 'Boltz (Submarine)']
    assert len(boltz_sub) > 0, 'Boltz (Submarine) 항목이 get_all_lightning_swap_fees() 결과에 없음'
    assert boltz_sub[0].get('direction') == 'ln_to_onchain', 'Boltz (Submarine) direction이 ln_to_onchain이 아님'


def test_fetch_boltz_reverse_fees_direction():
    """fetch_boltz_reverse_fees()가 direction='ln_to_onchain'을 반환한다."""
    from backend.app.services.lightning_scraper import fetch_boltz_reverse_fees

    result = fetch_boltz_reverse_fees()
    assert result['service_name'] == 'Boltz (Submarine)'
    assert result.get('direction') == 'ln_to_onchain', f"direction 불일치: {result.get('direction')}"
    assert result.get('fee_pct') is not None or result.get('error') is not None
