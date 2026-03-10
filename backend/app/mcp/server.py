from fastmcp import FastMCP

from backend.app.services.live_market import (
    calculate_btc_purchase_cost,
    compare_btc_prices,
    find_cheapest_path,
    get_exchange_summary,
    get_network_status,
    get_ticker,
    get_withdrawal_fees,
    list_exchanges,
)

mcp = FastMCP(
    name='exchange-fee',
    instructions='한국/글로벌 암호화폐 거래소의 BTC/USDT 실시간 시세와 네트워크별 출금 수수료를 조회하는 도구입니다.',
)

mcp.tool()(list_exchanges)
mcp.tool()(get_ticker)
mcp.tool()(get_withdrawal_fees)
mcp.tool()(compare_btc_prices)
mcp.tool()(get_exchange_summary)
mcp.tool()(calculate_btc_purchase_cost)
mcp.tool()(find_cheapest_path)
mcp.tool()(get_network_status)
