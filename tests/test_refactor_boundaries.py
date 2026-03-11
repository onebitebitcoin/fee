from backend.app.domain import market_core
from backend.app.services import live_market


def test_live_market_uses_backend_domain_market_core() -> None:
    assert live_market.fetch_upbit is market_core.fetch_upbit
    assert live_market.fetch_usd_krw_rate is market_core.fetch_usd_krw_rate
    assert live_market.get_withdrawal_source_url is market_core.get_withdrawal_source_url
