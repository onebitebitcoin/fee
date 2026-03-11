import asyncio

import fee_checker
import mcp_server

from backend.app.domain import market_core


def test_fee_checker_keeps_legacy_exports() -> None:
    assert fee_checker.fetch_upbit is not None
    assert fee_checker.fetch_usd_krw_rate is not None
    assert fee_checker.get_scraped_withdrawal is not None
    assert fee_checker.get_withdrawal_source_url is not None
    assert fee_checker.refresh_withdrawal_cache is not None


def test_mcp_server_keeps_public_tools() -> None:
    tool_names = {tool.name for tool in asyncio.run(mcp_server.mcp.list_tools())}
    assert {
        'list_exchanges',
        'get_ticker',
        'get_withdrawal_fees',
        'compare_btc_prices',
        'get_exchange_summary',
        'calculate_btc_purchase_cost',
        'find_cheapest_path',
        'get_network_status',
    }.issubset(tool_names)


def test_backend_domain_core_exports_runtime_helpers() -> None:
    assert market_core.fetch_upbit is fee_checker.fetch_upbit
    assert market_core.fetch_usd_krw_rate is fee_checker.fetch_usd_krw_rate
    assert market_core.get_withdrawal_source_url is fee_checker.get_withdrawal_source_url
    assert market_core.refresh_withdrawal_cache is fee_checker.refresh_withdrawal_cache
