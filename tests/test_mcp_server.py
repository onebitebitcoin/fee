"""
mcp_server.py 단위 테스트
- MCP 도구 함수들의 입력/출력/에러 처리 검증
- 실제 HTTP 요청은 모두 mock으로 대체
"""
import os
import sys
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import mcp_server
from mcp_server import (
    list_exchanges,
    get_ticker,
    get_withdrawal_fees,
    compare_btc_prices,
    get_exchange_summary,
    calculate_btc_purchase_cost,
    find_cheapest_path,
    _enrich_ticker_fees,
    _get_ticker_data,
    _get_withdrawal_data,
)
from fee_checker import GROUPS, ALL_EXCHANGES


# ─────────────────────────────────────────────────────────────
# list_exchanges 테스트
# ─────────────────────────────────────────────────────────────

class TestListExchanges:
    def test_returns_all_groups(self):
        result = list_exchanges()
        assert "korea" in result
        assert "global" in result
        assert "all" in result
        assert "total" in result

    def test_total_count(self):
        result = list_exchanges()
        assert result["total"] == 10

    def test_korea_exchanges(self):
        result = list_exchanges()
        assert set(result["korea"]) == {"upbit", "bithumb", "korbit", "coinone", "gopax"}

    def test_global_exchanges(self):
        result = list_exchanges()
        assert set(result["global"]) == {"binance", "okx", "coinbase", "kraken", "bitget"}


# ─────────────────────────────────────────────────────────────
# _enrich_ticker_fees 테스트 (순수 계산)
# ─────────────────────────────────────────────────────────────

class TestEnrichTickerFees:
    def test_usd_exchange(self):
        data = {
            "price": 100000.0,
            "currency": "USD",
            "maker_fee_pct": 0.1,
            "taker_fee_pct": 0.1,
        }
        _enrich_ticker_fees(data, usd_krw_rate=1380.0)
        assert data["maker_fee_usd"] == 100.0
        assert data["taker_fee_usd"] == 100.0
        assert data["maker_fee_krw"] == 138000
        assert "maker_role" in data
        assert "taker_role" in data
        assert data["usd_krw_rate"] == 1380

    def test_krw_exchange(self):
        data = {
            "price": 138000000.0,
            "currency": "KRW",
            "maker_fee_pct": 0.05,
            "taker_fee_pct": 0.05,
        }
        _enrich_ticker_fees(data, usd_krw_rate=1380.0)
        # 138,000,000 KRW / 1380 = 100,000 USD → fee = 50 USD
        assert data["maker_fee_usd"] == 50.0
        assert data["maker_fee_krw"] == 69000


# ─────────────────────────────────────────────────────────────
# _get_ticker_data 테스트
# ─────────────────────────────────────────────────────────────

class TestGetTickerData:
    def test_korea_exchange(self, mocker):
        mocker.patch.dict(mcp_server.KOREA_FETCHERS, {
            "upbit": lambda: {
                "price": 150000000.0, "high": 155000000.0,
                "low": 148000000.0, "volume": 500.0, "currency": "KRW",
            }
        })
        result = _get_ticker_data("upbit")
        assert result["exchange"] == "upbit"
        assert result["price"] == 150000000.0
        assert result["currency"] == "KRW"
        assert "maker_fee_pct" in result
        assert "taker_fee_pct" in result

    def test_global_exchange_single(self, mocker):
        mocker.patch.dict(mcp_server.GLOBAL_FETCHERS, {
            "coinbase": {"spot": lambda: {
                "price": 95000.0, "high": None, "low": None, "volume": 10000.0, "currency": "USD"
            }}
        })
        result = _get_ticker_data("coinbase")
        # 단일 마켓이면 dict, 복수면 list → 여기선 list[0]
        if isinstance(result, list):
            result = result[0]
        assert result["price"] == 95000.0

    def test_global_exchange_multi(self, mocker):
        mocker.patch.dict(mcp_server.GLOBAL_FETCHERS, {
            "binance": {
                "spot": lambda: {"price": 95000.0, "high": 97000.0, "low": 93000.0, "volume": 50000.0, "currency": "USD"},
                "perpetual": lambda: {"price": 94900.0, "high": 96900.0, "low": 92900.0, "volume": 80000.0, "currency": "USD"},
            }
        })
        result = _get_ticker_data("binance")
        # 2개 마켓이면 list 반환
        assert isinstance(result, list)
        assert len(result) == 2

    def test_unknown_exchange(self):
        with pytest.raises(ValueError, match="알 수 없는 거래소"):
            _get_ticker_data("unknown_xyz")


# ─────────────────────────────────────────────────────────────
# get_ticker 도구 테스트
# ─────────────────────────────────────────────────────────────

class TestGetTicker:
    def _mock_upbit_ticker(self, mocker):
        mocker.patch.dict(mcp_server.KOREA_FETCHERS, {
            "upbit": lambda: {
                "price": 150000000.0, "high": 155000000.0,
                "low": 148000000.0, "volume": 500.0, "currency": "KRW",
            }
        })
        mocker.patch("mcp_server.fetch_usd_krw_rate", return_value=1380.0)

    def test_valid_exchange(self, mocker):
        self._mock_upbit_ticker(mocker)
        result = get_ticker("upbit")
        assert "price" in result
        assert "error" not in result

    def test_invalid_exchange(self):
        result = get_ticker("invalid_exchange")
        assert "error" in result

    def test_case_insensitive(self, mocker):
        self._mock_upbit_ticker(mocker)
        result = get_ticker("UPBIT")
        assert "error" not in result

    def test_error_returns_dict_with_error_key(self, mocker):
        mocker.patch.dict(mcp_server.KOREA_FETCHERS, {
            "upbit": MagicMock(side_effect=Exception("API down"))
        })
        mocker.patch("mcp_server.fetch_usd_krw_rate", return_value=1380.0)
        result = get_ticker("upbit")
        assert "error" in result
        assert result["exchange"] == "upbit"

    def test_binance_returns_markets_key(self, mocker):
        mocker.patch.dict(mcp_server.GLOBAL_FETCHERS, {
            "binance": {
                "spot": lambda: {"price": 95000.0, "high": 97000.0, "low": 93000.0, "volume": 50000.0, "currency": "USD"},
                "perpetual": lambda: {"price": 94900.0, "high": 96900.0, "low": 92900.0, "volume": 80000.0, "currency": "USD"},
            }
        })
        mocker.patch("mcp_server.fetch_usd_krw_rate", return_value=1380.0)
        result = get_ticker("binance")
        assert "markets" in result
        assert len(result["markets"]) == 2


# ─────────────────────────────────────────────────────────────
# _get_withdrawal_data 테스트
# ─────────────────────────────────────────────────────────────

class TestGetWithdrawalData:
    def test_binance_uses_api(self, mocker):
        mock_fn = mocker.patch.dict(mcp_server.WITHDRAWAL_FETCHERS, {
            "binance": MagicMock(return_value=[{"label": "BTC", "fee": 0.0001}])
        })
        result = _get_withdrawal_data("binance", "BTC")
        assert result[0]["fee"] == 0.0001

    def test_static_exchange_uses_static(self, mocker):
        mock_static = mocker.patch("mcp_server.get_static_withdrawal",
                                   return_value=[{"label": "Bitcoin", "fee": 0.0008}])
        result = _get_withdrawal_data("upbit", "BTC")
        mock_static.assert_called_once_with("upbit", "BTC")


# ─────────────────────────────────────────────────────────────
# get_withdrawal_fees 도구 테스트
# ─────────────────────────────────────────────────────────────

class TestGetWithdrawalFees:
    def test_valid_btc(self, mocker):
        mocker.patch("mcp_server._get_withdrawal_data",
                     return_value=[{"label": "Bitcoin", "fee": 0.0002, "note": "test"}])
        mocker.patch("mcp_server.fetch_kraken",
                     return_value={"price": 95000.0})
        mocker.patch("mcp_server.fetch_usd_krw_rate", return_value=1380.0)

        result = get_withdrawal_fees("upbit", "BTC")
        assert result["exchange"] == "upbit"
        assert result["coin"] == "BTC"
        assert "networks" in result
        assert result["networks"][0]["fee_usd"] == round(0.0002 * 95000.0, 2)

    def test_valid_usdt(self, mocker):
        mocker.patch("mcp_server._get_withdrawal_data",
                     return_value=[{"label": "TRC20", "fee": 1.0, "note": "test"}])
        mocker.patch("mcp_server.fetch_usd_krw_rate", return_value=1380.0)

        result = get_withdrawal_fees("upbit", "USDT")
        assert result["coin"] == "USDT"
        assert result["networks"][0]["fee_usd"] == 1.0
        assert result["networks"][0]["fee_krw"] == 1380

    def test_invalid_exchange(self):
        result = get_withdrawal_fees("unknown", "BTC")
        assert "error" in result

    def test_invalid_coin(self):
        result = get_withdrawal_fees("upbit", "ETH")
        assert "error" in result

    def test_none_fee_handled(self, mocker):
        mocker.patch("mcp_server._get_withdrawal_data",
                     return_value=[{"label": "Dynamic", "fee": None, "note": "dynamic"}])
        mocker.patch("mcp_server.fetch_kraken",
                     return_value={"price": 95000.0})
        mocker.patch("mcp_server.fetch_usd_krw_rate", return_value=1380.0)

        result = get_withdrawal_fees("upbit", "BTC")
        assert result["networks"][0]["fee_usd"] is None
        assert result["networks"][0]["fee_krw"] is None


# ─────────────────────────────────────────────────────────────
# compare_btc_prices 도구 테스트
# ─────────────────────────────────────────────────────────────

class TestCompareBtcPrices:
    def _mock_all_tickers(self, mocker):
        def mock_get_ticker(exchange):
            if exchange in GROUPS["korea"]:
                return {"exchange": exchange, "price": 150000000.0, "currency": "KRW",
                        "pair": "BTC/KRW", "market_type": "spot"}
            return {"exchange": exchange, "price": 95000.0, "currency": "USD",
                    "pair": "BTC/USD", "market_type": "spot"}
        mocker.patch("mcp_server._get_ticker_data", side_effect=mock_get_ticker)

    def test_all_exchanges(self, mocker):
        self._mock_all_tickers(mocker)
        result = compare_btc_prices("all")
        assert "results" in result
        assert "errors" in result

    def test_korea_group(self, mocker):
        self._mock_all_tickers(mocker)
        result = compare_btc_prices("korea")
        assert "krw" in result
        assert result["krw"]["lowest"]["currency"] == "KRW"
        assert result["krw"]["highest"]["currency"] == "KRW"

    def test_global_group(self, mocker):
        self._mock_all_tickers(mocker)
        result = compare_btc_prices("global")
        assert "usd" in result

    def test_custom_exchanges(self, mocker):
        self._mock_all_tickers(mocker)
        result = compare_btc_prices("upbit,binance")
        assert "results" in result

    def test_invalid_exchange(self):
        result = compare_btc_prices("invalid_xyz")
        assert "error" in result

    def test_exchange_error_goes_to_errors_list(self, mocker):
        mocker.patch("mcp_server._get_ticker_data", side_effect=Exception("API down"))
        result = compare_btc_prices("korea")
        assert len(result["errors"]) > 0

    def test_spread_calculation(self, mocker):
        def mock_get_ticker(exchange):
            prices = {"upbit": 150000000.0, "bithumb": 152000000.0, "korbit": 151000000.0,
                      "coinone": 149000000.0, "gopax": 148000000.0}
            return {"exchange": exchange, "price": prices[exchange], "currency": "KRW",
                    "pair": "BTC/KRW", "market_type": "spot"}
        mocker.patch("mcp_server._get_ticker_data", side_effect=mock_get_ticker)
        result = compare_btc_prices("korea")
        assert result["krw"]["spread_krw"] == 4000000.0


# ─────────────────────────────────────────────────────────────
# get_exchange_summary 도구 테스트
# ─────────────────────────────────────────────────────────────

class TestGetExchangeSummary:
    def test_valid_exchange(self, mocker):
        mocker.patch("mcp_server._get_ticker_data",
                     return_value={"price": 150000000.0, "currency": "KRW"})
        mocker.patch("mcp_server._get_withdrawal_data",
                     return_value=[{"label": "Bitcoin", "fee": 0.0002}])

        result = get_exchange_summary("upbit")
        assert result["exchange"] == "upbit"
        assert "ticker" in result
        assert "withdrawal_btc" in result
        assert "withdrawal_usdt" in result

    def test_invalid_exchange(self):
        result = get_exchange_summary("xyz")
        assert "error" in result

    def test_ticker_error_graceful(self, mocker):
        mocker.patch("mcp_server._get_ticker_data", side_effect=Exception("down"))
        mocker.patch("mcp_server._get_withdrawal_data", return_value=[])

        result = get_exchange_summary("upbit")
        assert "ticker_error" in result
        assert "error" not in result  # 전체 실패가 아닌 부분 실패


# ─────────────────────────────────────────────────────────────
# calculate_btc_purchase_cost 도구 테스트
# ─────────────────────────────────────────────────────────────

class TestCalculateBtcPurchaseCost:
    def _setup_mocks(self, mocker, korean_price=150000000.0, global_price=95000.0,
                     usd_krw=1380.0, withdrawal_fee=0.0002):
        mocker.patch("mcp_server.fetch_usd_krw_rate", return_value=usd_krw)
        mocker.patch.dict(mcp_server.KOREA_FETCHERS, {
            "upbit": MagicMock(return_value={"price": korean_price})
        })
        mocker.patch.dict(mcp_server.GLOBAL_FETCHERS, {
            "binance": {"spot": MagicMock(return_value={"price": global_price})}
        })
        mocker.patch("mcp_server._get_withdrawal_data", return_value=[
            {"label": "Bitcoin (On-chain)", "fee": withdrawal_fee, "note": "test", "enabled": True}
        ])

    def test_btc_path_basic(self, mocker):
        self._setup_mocks(mocker)
        result = calculate_btc_purchase_cost(
            amount_krw=1000000, korean_exchange="upbit",
            global_exchange="binance", transfer_coin="BTC"
        )
        assert "error" not in result
        assert result["amount_krw"] == 1000000
        assert result["btc_received"] is not None
        assert result["btc_received"] > 0
        assert "kimchi_premium_pct" in result

    def test_kimchi_premium_positive(self, mocker):
        # 한국이 더 비쌈
        self._setup_mocks(mocker, korean_price=150000000.0, global_price=95000.0, usd_krw=1380.0)
        result = calculate_btc_purchase_cost()
        assert result["kimchi_premium_pct"] > 0
        assert "프리미엄" in result["kimchi_direction"]

    def test_kimchi_premium_negative(self, mocker):
        # 글로벌이 더 비쌈 (역프리미엄)
        self._setup_mocks(mocker, korean_price=140000000.0, global_price=110000.0, usd_krw=1380.0)
        result = calculate_btc_purchase_cost()
        assert result["kimchi_premium_pct"] < 0
        assert "역프리미엄" in result["kimchi_direction"]

    def test_invalid_korean_exchange(self):
        result = calculate_btc_purchase_cost(korean_exchange="binance")
        assert "error" in result

    def test_invalid_global_exchange(self):
        result = calculate_btc_purchase_cost(global_exchange="upbit")
        assert "error" in result

    def test_invalid_transfer_coin(self):
        result = calculate_btc_purchase_cost(transfer_coin="ETH")
        assert "error" in result

    def test_cost_breakdown_structure_btc(self, mocker):
        self._setup_mocks(mocker)
        result = calculate_btc_purchase_cost(transfer_coin="BTC")
        bd = result["cost_breakdown"]
        assert "korean_trading_fee_krw" in bd
        assert "withdrawal_fee_krw" in bd
        assert "total_fee_krw" in bd

    def test_usdt_path(self, mocker):
        mocker.patch("mcp_server.fetch_usd_krw_rate", return_value=1380.0)
        mocker.patch.dict(mcp_server.KOREA_FETCHERS, {
            "upbit": MagicMock(return_value={"price": 150000000.0})
        })
        mocker.patch.dict(mcp_server.GLOBAL_FETCHERS, {
            "binance": {"spot": MagicMock(return_value={"price": 95000.0})}
        })
        mocker.patch("mcp_server._get_withdrawal_data", return_value=[
            {"label": "TRC20", "fee": 1.0, "note": "test", "enabled": True}
        ])
        result = calculate_btc_purchase_cost(transfer_coin="USDT")
        assert "error" not in result
        assert result["transfer_coin"] == "USDT"
        assert "global_trading_fee_krw" in result["cost_breakdown"]

    def test_no_withdrawal_fee_available(self, mocker):
        mocker.patch("mcp_server.fetch_usd_krw_rate", return_value=1380.0)
        mocker.patch.dict(mcp_server.KOREA_FETCHERS, {
            "upbit": MagicMock(return_value={"price": 150000000.0})
        })
        mocker.patch.dict(mcp_server.GLOBAL_FETCHERS, {
            "binance": {"spot": MagicMock(return_value={"price": 95000.0})}
        })
        mocker.patch("mcp_server._get_withdrawal_data", return_value=[
            {"label": "Dynamic", "fee": None, "note": "dynamic", "enabled": True}
        ])
        result = calculate_btc_purchase_cost(transfer_coin="BTC")
        assert result["btc_received"] is None

    def test_effective_btc_price_calculation(self, mocker):
        self._setup_mocks(mocker, korean_price=150000000.0)
        result = calculate_btc_purchase_cost(amount_krw=1000000)
        # effective_btc_price_krw는 amount_krw / btc_received 기반 — 한국 시세보다 높아야 함 (수수료 포함)
        if result.get("btc_received") and result.get("effective_btc_price_krw"):
            assert result["effective_btc_price_krw"] > 150000000.0


# ─────────────────────────────────────────────────────────────
# find_cheapest_path 도구 테스트
# ─────────────────────────────────────────────────────────────

class TestFindCheapestPath:
    def _setup_mocks(self, mocker):
        mocker.patch("mcp_server.fetch_usd_krw_rate", return_value=1380.0)
        mocker.patch.dict(mcp_server.GLOBAL_FETCHERS, {
            "binance": {"spot": MagicMock(return_value={"price": 95000.0})}
        })
        mocker.patch.dict(mcp_server.KOREA_FETCHERS, {
            "upbit":   MagicMock(return_value={"price": 150000000.0}),
            "bithumb": MagicMock(return_value={"price": 151000000.0}),
            "korbit":  MagicMock(return_value={"price": 149000000.0}),
            "coinone": MagicMock(return_value={"price": 150500000.0}),
            "gopax":   MagicMock(return_value={"price": 148000000.0}),
        })

        def mock_withdrawal(exchange, coin):
            if coin == "BTC":
                return [{"label": "Bitcoin (On-chain)", "fee": 0.0002, "enabled": True}]
            return [{"label": "TRC20", "fee": 1.0, "enabled": True}]

        mocker.patch("mcp_server._get_withdrawal_data", side_effect=mock_withdrawal)
        mocker.patch("mcp_server.check_maintenance_status", return_value={})

    def test_returns_paths(self, mocker):
        self._setup_mocks(mocker)
        result = find_cheapest_path(amount_krw=1000000, global_exchange="binance")
        assert "error" not in result
        assert result["total_paths_evaluated"] > 0
        assert result["best_path"] is not None

    def test_top5_sorted_by_btc_received(self, mocker):
        self._setup_mocks(mocker)
        result = find_cheapest_path(amount_krw=1000000)
        top5 = result["top5"]
        for i in range(len(top5) - 1):
            assert top5[i]["btc_received"] >= top5[i + 1]["btc_received"]

    def test_invalid_global_exchange(self):
        result = find_cheapest_path(global_exchange="upbit")
        assert "error" in result

    def test_result_structure(self, mocker):
        self._setup_mocks(mocker)
        result = find_cheapest_path(amount_krw=1000000)
        assert "amount_krw" in result
        assert "global_exchange" in result
        assert "global_btc_price_usd" in result
        assert "usd_krw_rate" in result
        assert "all_paths" in result
        assert "disabled_paths" in result

    def test_best_path_structure(self, mocker):
        self._setup_mocks(mocker)
        result = find_cheapest_path(amount_krw=1000000)
        path = result["best_path"]
        assert "korean_exchange" in path
        assert "transfer_coin" in path
        assert "network" in path
        assert "btc_received" in path
        assert "total_fee_krw" in path
        assert "fee_pct" in path
        assert "breakdown" in path

    def test_maintenance_suspended_paths_excluded(self, mocker):
        self._setup_mocks(mocker)
        mocker.patch("mcp_server.check_maintenance_status", return_value={
            "upbit": [{"coin": "BTC", "network": "Bitcoin (On-chain)", "reason": "점검 중"}]
        })
        result = find_cheapest_path(amount_krw=1000000)
        # upbit BTC 경로는 disabled_paths에 있어야 함
        disabled = result["disabled_paths"]
        upbit_btc_disabled = [p for p in disabled
                              if p["korean_exchange"] == "upbit" and p["transfer_coin"] == "BTC"]
        assert len(upbit_btc_disabled) > 0

    def test_zero_btc_received_excluded(self, mocker):
        mocker.patch("mcp_server.fetch_usd_krw_rate", return_value=1380.0)
        mocker.patch.dict(mcp_server.GLOBAL_FETCHERS, {
            "binance": {"spot": MagicMock(return_value={"price": 95000.0})}
        })
        mocker.patch.dict(mcp_server.KOREA_FETCHERS, {
            "upbit": MagicMock(return_value={"price": 150000000.0}),
            "bithumb": MagicMock(side_effect=Exception("API down")),
            "korbit": MagicMock(side_effect=Exception("API down")),
            "coinone": MagicMock(side_effect=Exception("API down")),
            "gopax": MagicMock(side_effect=Exception("API down")),
        })
        # 출금 수수료가 매수 BTC보다 큰 경우 → 경로 제외
        mocker.patch("mcp_server._get_withdrawal_data",
                     return_value=[{"label": "BTC", "fee": 999.0, "enabled": True}])
        mocker.patch("mcp_server.check_maintenance_status", return_value={})
        result = find_cheapest_path(amount_krw=1000000)
        # btc_received <= 0인 경로는 포함되지 않아야 함
        for path in result.get("all_paths", []):
            assert path["btc_received"] > 0
