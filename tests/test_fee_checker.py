"""
fee_checker.py 단위 테스트
- 순수 함수: mock 없이 테스트
- HTTP 요청 함수: requests mock 사용
- 캐시 함수: 임시 파일/mock 사용
"""
import json
import inspect
import os
import sys
from datetime import datetime, timedelta
from unittest.mock import MagicMock

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import fee_checker
from fee_checker import (
    GROUPS,
    ALL_EXCHANGES,
    TRADING_FEES,
    SCRAPED_WITHDRAWAL_LABELS,
    SCRAPE_EXCHANGES,
    _get_cached_fee_with_meta,
    _fmt_price,
    _fmt_volume,
    _is_cache_valid,
    _is_maintenance_cache_valid,
    _detect_suspension,
    _load_cache,
    _save_cache,
    get_scraped_withdrawal,
    get_withdrawal_source_url,
)


# ─────────────────────────────────────────────────────────────
# 상수 / 설정 테스트
# ─────────────────────────────────────────────────────────────

class TestConstants:
    def test_all_exchanges_count(self):
        assert len(ALL_EXCHANGES) == 10

    def test_groups_korea(self):
        assert set(GROUPS["korea"]) == {"upbit", "bithumb", "korbit", "coinone", "gopax"}

    def test_groups_global(self):
        assert set(GROUPS["global"]) == {"binance", "okx", "coinbase", "kraken", "bitget"}

    def test_trading_fees_all_exchanges_present(self):
        for ex in ALL_EXCHANGES:
            assert ex in TRADING_FEES, f"{ex} 거래 수수료 없음"

    def test_trading_fees_korea_structure(self):
        for ex in GROUPS["korea"]:
            fees = TRADING_FEES[ex]
            assert "maker" in fees
            assert "taker" in fees
            assert 0 <= fees["maker"] <= 0.01
            assert 0 <= fees["taker"] <= 0.01

    def test_trading_fees_binance_structure(self):
        fees = TRADING_FEES["binance"]
        assert "spot" in fees
        assert "perpetual" in fees
        assert "maker" in fees["spot"]
        assert "taker" in fees["perpetual"]

    def test_scraped_withdrawal_btc_keys(self):
        expected = {"upbit", "korbit", "coinone", "kraken"}
        assert set(SCRAPED_WITHDRAWAL_LABELS.keys()) == expected

    def test_scrape_exchanges(self):
        assert SCRAPE_EXCHANGES == {"upbit", "korbit", "coinone", "kraken"}


# ─────────────────────────────────────────────────────────────
# 포맷 함수 테스트
# ─────────────────────────────────────────────────────────────

class TestFormatFunctions:
    def test_fmt_price_krw(self):
        result = _fmt_price(150000000.0, "KRW")
        assert "₩" in result
        assert "150,000,000" in result

    def test_fmt_price_usd(self):
        result = _fmt_price(95000.50, "USD")
        assert "$" in result
        assert "95,000.50" in result

    def test_fmt_price_none(self):
        assert _fmt_price(None, "KRW") == "N/A"
        assert _fmt_price(None, "USD") == "N/A"

    def test_fmt_volume_normal(self):
        result = _fmt_volume(1234.56, "BTC")
        assert "1,234.56" in result
        assert "BTC" in result

    def test_fmt_volume_none(self):
        assert _fmt_volume(None, "BTC") == "N/A"


# ─────────────────────────────────────────────────────────────
# 캐시 유효성 검사 테스트
# ─────────────────────────────────────────────────────────────

class TestCacheValidation:
    def test_cache_valid_recent(self):
        cache = {"last_updated": datetime.now().isoformat()}
        assert _is_cache_valid(cache) is True

    def test_cache_invalid_expired(self):
        old = (datetime.now() - timedelta(hours=25)).isoformat()
        cache = {"last_updated": old}
        assert _is_cache_valid(cache) is False

    def test_cache_invalid_no_key(self):
        assert _is_cache_valid({}) is False

    def test_cache_invalid_bad_format(self):
        assert _is_cache_valid({"last_updated": "not-a-date"}) is False

    def test_maintenance_cache_valid(self):
        cache = {"maintenance_checked_at": datetime.now().isoformat()}
        assert _is_maintenance_cache_valid(cache) is True

    def test_maintenance_cache_expired(self):
        old = (datetime.now() - timedelta(hours=2)).isoformat()
        cache = {"maintenance_checked_at": old}
        assert _is_maintenance_cache_valid(cache) is False

    def test_maintenance_cache_missing_key(self):
        assert _is_maintenance_cache_valid({}) is False


# ─────────────────────────────────────────────────────────────
# 캐시 파일 I/O 테스트
# ─────────────────────────────────────────────────────────────

class TestCacheIO:
    def test_load_cache_missing_file(self, tmp_path, monkeypatch):
        monkeypatch.setattr(fee_checker, "CACHE_FILE", str(tmp_path / "missing.json"))
        result = _load_cache()
        assert result == {"last_updated": None, "fees": {}}

    def test_load_cache_invalid_json(self, tmp_path, monkeypatch):
        cache_file = tmp_path / "cache.json"
        cache_file.write_text("not-json")
        monkeypatch.setattr(fee_checker, "CACHE_FILE", str(cache_file))
        result = _load_cache()
        assert result == {"last_updated": None, "fees": {}}

    def test_save_and_load_cache(self, tmp_path, monkeypatch):
        cache_file = tmp_path / "cache.json"
        monkeypatch.setattr(fee_checker, "CACHE_FILE", str(cache_file))
        data = {"last_updated": "2026-01-01T00:00:00", "fees": {"upbit_btc": 0.0002}}
        _save_cache(data)
        loaded = _load_cache()
        assert loaded["fees"]["upbit_btc"] == 0.0002

    def test_save_cache_permission_error(self, monkeypatch):
        monkeypatch.setattr(fee_checker, "CACHE_FILE", "/nonexistent/path/cache.json")
        # 예외 없이 조용히 실패해야 함
        _save_cache({"fees": {}})


# ─────────────────────────────────────────────────────────────
# 점검/중단 감지 테스트
# ─────────────────────────────────────────────────────────────

class TestDetectSuspension:
    def test_no_suspension_keywords(self):
        result = _detect_suspension("정상 운영 중입니다.", "http://example.com")
        assert result == []

    def test_suspension_with_btc_trc20(self):
        text = "BTC 비트코인 TRC20 출금 중단 안내"
        result = _detect_suspension(text, "http://example.com")
        assert len(result) > 0
        coins = {r["coin"] for r in result}
        assert "BTC" in coins

    def test_suspension_with_usdt_erc20(self):
        text = "USDT ERC20 입출금 중단 안내"
        result = _detect_suspension(text, "http://example.com")
        assert len(result) > 0
        assert all(r["status"] == "suspended" for r in result)

    def test_suspension_no_coin_no_network(self):
        text = "서비스 점검 중입니다."
        result = _detect_suspension(text, "http://example.com")
        # coin/network 없으면 빈 리스트
        assert result == []

    def test_suspension_english_keywords(self):
        text = "Bitcoin BTC withdrawal suspended temporarily"
        result = _detect_suspension(text, "http://example.com")
        assert len(result) > 0

    def test_suspension_result_structure(self):
        text = "USDT TRC20 출금 중단"
        result = _detect_suspension(text, "http://test.com")
        for item in result:
            assert "coin" in item
            assert "network" in item
            assert "status" in item
            assert "source_url" in item
            assert "detected_at" in item
            assert item["source_url"] == "http://test.com"


# ─────────────────────────────────────────────────────────────
# 스크래핑 기반 출금 수수료 조회 테스트
# ─────────────────────────────────────────────────────────────

class TestGetScrapedWithdrawal:
    def test_unknown_exchange_raises(self):
        with pytest.raises(ValueError, match="스크래핑/API 미지원"):
            get_scraped_withdrawal("unknown_exchange", "BTC")

    def test_result_structure(self, tmp_path, monkeypatch):
        cache_data = {
            "last_updated": datetime.now().isoformat(),
            "fees": {"upbit_btc": 0.0002},
        }
        cache_file = tmp_path / "cache.json"
        cache_file.write_text(json.dumps(cache_data))
        monkeypatch.setattr(fee_checker, "CACHE_FILE", str(cache_file))
        result = get_scraped_withdrawal("upbit", "BTC")
        for item in result:
            assert "label" in item
            assert "enabled" in item
            assert "fee" in item
            assert "scraped_at" in item

    def test_cache_fee_used_when_valid(self, tmp_path, monkeypatch):
        """캐시에 유효한 BTC 수수료가 있으면 사용한다"""
        cache_data = {
            "last_updated": datetime.now().isoformat(),
            "fees": {"upbit_btc": 0.0002},
        }
        cache_file = tmp_path / "cache.json"
        cache_file.write_text(json.dumps(cache_data))
        monkeypatch.setattr(fee_checker, "CACHE_FILE", str(cache_file))

        result = get_scraped_withdrawal("upbit", "BTC")
        btc_entry = next((r for r in result if "Bitcoin" in r.get("label", "")), None)
        assert btc_entry is not None
        assert btc_entry["fee"] == 0.0002

    def test_upbit_usdt_uses_official_fee_page_cache(self, tmp_path, monkeypatch):
        cache_data = {
            "last_updated": datetime.now().isoformat(),
            "fees": {
                "upbit_usdt_aptos": 0.1,
                "upbit_usdt_ethereum": 4.0,
                "upbit_usdt_kaia": 0.1,
                "upbit_usdt_tron": 0.0,
            },
        }
        cache_file = tmp_path / "cache.json"
        cache_file.write_text(json.dumps(cache_data))
        monkeypatch.setattr(fee_checker, "CACHE_FILE", str(cache_file))

        result = get_scraped_withdrawal("upbit", "USDT")
        labels = {row["label"]: row["fee"] for row in result}
        assert labels["TRC20"] == 0.0
        assert labels["ERC20"] == 4.0

    def test_coinone_usdt_uses_official_fee_page_cache(self, tmp_path, monkeypatch):
        cache_data = {
            "last_updated": datetime.now().isoformat(),
            "fees": {"coinone_usdt_tron": 2.0},
        }
        cache_file = tmp_path / "cache.json"
        cache_file.write_text(json.dumps(cache_data))
        monkeypatch.setattr(fee_checker, "CACHE_FILE", str(cache_file))

        result = get_scraped_withdrawal("coinone", "USDT")
        assert result == [
            {
                "label": "TRC20",
                "fee": 2.0,
                "min": None,
                "enabled": True,
                "note": "Playwright 스크래핑",
                "scraped_at": cache_data["last_updated"],
                "source_url": "https://coinone.co.kr/support/fee-guide",
            }
        ]

    def test_korbit_usdt_uses_official_fee_page_cache(self, tmp_path, monkeypatch):
        cache_data = {
            "last_updated": datetime.now().isoformat(),
            "fees": {"korbit_usdt_tron": 1.0},
        }
        cache_file = tmp_path / "cache.json"
        cache_file.write_text(json.dumps(cache_data))
        monkeypatch.setattr(fee_checker, "CACHE_FILE", str(cache_file))

        result = get_scraped_withdrawal("korbit", "USDT")
        assert result == [
            {
                "label": "TRC20",
                "fee": 1.0,
                "min": None,
                "enabled": True,
                "note": "Playwright 스크래핑",
                "scraped_at": cache_data["last_updated"],
                "source_url": "https://lightning.korbit.co.kr/info/fee/?tab=transfer",
            }
        ]

    def test_missing_cache_key_triggers_refresh(self, monkeypatch):
        monkeypatch.setattr(
            fee_checker,
            "_load_cache",
            lambda: {"last_updated": datetime.now().isoformat(), "fees": {"upbit_btc": 0.0002}},
        )
        monkeypatch.setattr(
            fee_checker,
            "refresh_withdrawal_cache",
            lambda: {"last_updated": "2026-03-10T00:00:00", "fees": {"upbit_usdt_tron": 0.0}},
        )
        fee, scraped_at = _get_cached_fee_with_meta("upbit_usdt_tron")
        assert fee == 0.0
        assert scraped_at == "2026-03-10T00:00:00"

    def test_upbit_usdt_missing_multi_keys_refreshes_once(self, monkeypatch):
        refresh_calls = []
        monkeypatch.setattr(
            fee_checker,
            "_load_cache",
            lambda: {"last_updated": datetime.now().isoformat(), "fees": {"upbit_usdt_tron": 0.0}},
        )

        def fake_refresh():
            refresh_calls.append(True)
            return {
                "last_updated": "2026-03-10T00:00:00",
                "fees": {
                    "upbit_usdt_aptos": 0.1,
                    "upbit_usdt_ethereum": 4.0,
                    "upbit_usdt_kaia": 0.1,
                    "upbit_usdt_tron": 0.0,
                },
            }

        monkeypatch.setattr(fee_checker, "refresh_withdrawal_cache", fake_refresh)
        result = get_scraped_withdrawal("upbit", "USDT")
        assert len(refresh_calls) == 1
        assert {row["label"] for row in result} == {"Aptos", "ERC20", "Kaia", "TRC20"}

    def test_upbit_usdt_source_url_matches_actual_scrape_entrypoint(self, tmp_path, monkeypatch):
        cache_data = {
            "last_updated": datetime.now().isoformat(),
            "fees": {
                "upbit_usdt_aptos": 0.1,
                "upbit_usdt_ethereum": 4.0,
                "upbit_usdt_kaia": 0.1,
                "upbit_usdt_tron": 0.0,
            },
        }
        cache_file = tmp_path / "cache.json"
        cache_file.write_text(json.dumps(cache_data))
        monkeypatch.setattr(fee_checker, "CACHE_FILE", str(cache_file))

        result = get_scraped_withdrawal("upbit", "USDT")
        assert {row["source_url"] for row in result} == {"https://upbit.com/service_center/fees?tab=dtw_fees"}

    def test_korbit_source_url_matches_actual_scrape_entrypoint(self):
        source = inspect.getsource(fee_checker._pw_scrape_korbit)
        assert "https://lightning.korbit.co.kr/info/fee/?tab=transfer" in source

    def test_bithumb_api_source_url_is_exposed(self):
        assert get_withdrawal_source_url("bithumb", "USDT", "TRC20") == "https://gw.bithumb.com/exchange/v1/coin-inout/info"


# ─────────────────────────────────────────────────────────────
# HTTP fetch 함수 테스트 (requests mock)
# ─────────────────────────────────────────────────────────────

class TestFetchUsdKrwRate:
    def test_success(self, mocker):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"result": "success", "rates": {"KRW": 1380.5}}
        mocker.patch("fee_checker._get", return_value=mock_resp)

        rate = fee_checker.fetch_usd_krw_rate()
        assert rate == 1380.5

    def test_http_error(self, mocker):
        mock_resp = MagicMock()
        mock_resp.status_code = 500
        mocker.patch("fee_checker._get", return_value=mock_resp)

        with pytest.raises(ValueError, match="환율 조회 오류"):
            fee_checker.fetch_usd_krw_rate()

    def test_api_failure(self, mocker):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"result": "error"}
        mocker.patch("fee_checker._get", return_value=mock_resp)

        with pytest.raises(ValueError, match="환율 조회 실패"):
            fee_checker.fetch_usd_krw_rate()


class TestFetchUpbit:
    def test_success(self, mocker):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = [{
            "trade_price": 150000000,
            "high_price": 155000000,
            "low_price": 148000000,
            "acc_trade_volume_24h": 1234.56,
        }]
        mocker.patch("fee_checker._get", return_value=mock_resp)

        result = fee_checker.fetch_upbit()
        assert result["price"] == 150000000.0
        assert result["currency"] == "KRW"
        assert result["volume"] == 1234.56

    def test_http_error(self, mocker):
        mock_resp = MagicMock()
        mock_resp.status_code = 400
        mocker.patch("fee_checker._get", return_value=mock_resp)

        with pytest.raises(ValueError, match="Upbit 오류"):
            fee_checker.fetch_upbit()


class TestFetchBithumb:
    def test_success(self, mocker):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "status": "0000",
            "data": {
                "closing_price": "148000000",
                "max_price": "153000000",
                "min_price": "146000000",
                "units_traded": "500.5",
            },
        }
        mocker.patch("fee_checker._get", return_value=mock_resp)

        result = fee_checker.fetch_bithumb()
        assert result["price"] == 148000000.0
        assert result["currency"] == "KRW"

    def test_api_error_status(self, mocker):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"status": "5100", "message": "Bad Request"}
        mocker.patch("fee_checker._get", return_value=mock_resp)

        with pytest.raises(ValueError, match="Bithumb 오류"):
            fee_checker.fetch_bithumb()


class TestFetchKorbit:
    def test_success(self, mocker):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "last": "149000000",
            "high": "154000000",
            "low": "147000000",
            "volume": "200.3",
        }
        mocker.patch("fee_checker._get", return_value=mock_resp)

        result = fee_checker.fetch_korbit()
        assert result["price"] == 149000000.0
        assert result["currency"] == "KRW"

    def test_http_error(self, mocker):
        mock_resp = MagicMock()
        mock_resp.status_code = 503
        mocker.patch("fee_checker._get", return_value=mock_resp)

        with pytest.raises(ValueError, match="Korbit 오류"):
            fee_checker.fetch_korbit()


class TestFetchCoinone:
    def test_success(self, mocker):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "result": "success",
            "data": {
                "close_24h": "147000000",
                "high_24h": "152000000",
                "low_24h": "145000000",
                "volume_24h": "300.1",
            },
        }
        mocker.patch("fee_checker._get", return_value=mock_resp)

        result = fee_checker.fetch_coinone()
        assert result["price"] == 147000000.0

    def test_api_error(self, mocker):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"result": "error", "errorCode": "42"}
        mocker.patch("fee_checker._get", return_value=mock_resp)

        with pytest.raises(ValueError, match="Coinone 오류"):
            fee_checker.fetch_coinone()


class TestFetchGopax:
    def test_success(self, mocker):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"price": "148500000", "volume": "180.0"}
        mocker.patch("fee_checker._get", return_value=mock_resp)

        result = fee_checker.fetch_gopax()
        assert result["price"] == 148500000.0
        assert result["high"] is None  # gopax는 high/low 없음


class TestFetchBinanceSpot:
    def test_success(self, mocker):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "lastPrice": "95000.00",
            "highPrice": "97000.00",
            "lowPrice": "93000.00",
            "volume": "50000.0",
        }
        mocker.patch("fee_checker._get", return_value=mock_resp)

        result = fee_checker.fetch_binance_spot()
        assert result["price"] == 95000.0
        assert result["currency"] == "USD"

    def test_http_error(self, mocker):
        mock_resp = MagicMock()
        mock_resp.status_code = 400
        mock_resp.json.return_value = {"msg": "Invalid symbol"}
        mocker.patch("fee_checker._get", return_value=mock_resp)

        with pytest.raises(ValueError, match="Invalid symbol"):
            fee_checker.fetch_binance_spot()


class TestFetchBinancePerp:
    def test_success(self, mocker):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "lastPrice": "94800.00",
            "highPrice": "96800.00",
            "lowPrice": "92800.00",
            "volume": "120000.0",
        }
        mocker.patch("fee_checker._get", return_value=mock_resp)

        result = fee_checker.fetch_binance_perp()
        assert result["price"] == 94800.0


class TestFetchOkxSpot:
    def test_success(self, mocker):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "code": "0",
            "data": [{"last": "95100", "high24h": "97100", "low24h": "93100", "vol24h": "40000"}],
        }
        mocker.patch("fee_checker._get", return_value=mock_resp)

        result = fee_checker.fetch_okx_spot()
        assert result["price"] == 95100.0

    def test_api_error(self, mocker):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"code": "1", "msg": "OKX error"}
        mocker.patch("fee_checker._get", return_value=mock_resp)

        with pytest.raises(ValueError, match="OKX error"):
            fee_checker.fetch_okx_spot()


class TestFetchOkxPerp:
    def test_success(self, mocker):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "code": "0",
            "data": [{"last": "94900", "high24h": "96900", "low24h": "92900", "vol24h": "80000"}],
        }
        mocker.patch("fee_checker._get", return_value=mock_resp)

        result = fee_checker.fetch_okx_perp()
        assert result["price"] == 94900.0


class TestFetchCoinbase:
    def test_success(self, mocker):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"price": "95200", "volume_24h": "30000"}
        mocker.patch("fee_checker._get", return_value=mock_resp)

        result = fee_checker.fetch_coinbase()
        assert result["price"] == 95200.0
        assert result["currency"] == "USD"
        assert result["high"] is None

    def test_http_error(self, mocker):
        mock_resp = MagicMock()
        mock_resp.status_code = 401
        mocker.patch("fee_checker._get", return_value=mock_resp)

        with pytest.raises(ValueError, match="Coinbase 오류"):
            fee_checker.fetch_coinbase()


class TestFetchKraken:
    def test_success(self, mocker):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "error": [],
            "result": {
                "XXBTZUSD": {
                    "c": ["95300.00", "1"],
                    "h": ["97300.00", "97300.00"],
                    "l": ["93300.00", "93300.00"],
                    "v": ["20000.0", "20000.0"],
                }
            },
        }
        mocker.patch("fee_checker._get", return_value=mock_resp)

        result = fee_checker.fetch_kraken()
        assert result["price"] == 95300.0
        assert result["currency"] == "USD"

    def test_api_error(self, mocker):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"error": ["EGeneral:Invalid arguments"]}
        mocker.patch("fee_checker._get", return_value=mock_resp)

        with pytest.raises(ValueError, match="Kraken 오류"):
            fee_checker.fetch_kraken()


class TestFetchBitget:
    def test_success(self, mocker):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "code": "00000",
            "data": [{
                "lastPr": "95400",
                "high24h": "97400",
                "low24h": "93400",
                "baseVolume": "25000",
            }],
        }
        mocker.patch("fee_checker._get", return_value=mock_resp)

        result = fee_checker.fetch_bitget()
        assert result["price"] == 95400.0

    def test_api_error(self, mocker):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"code": "40001", "msg": "access denied"}
        mocker.patch("fee_checker._get", return_value=mock_resp)

        with pytest.raises(ValueError, match="access denied"):
            fee_checker.fetch_bitget()


# ─────────────────────────────────────────────────────────────
# 출금 수수료 fetch 테스트
# ─────────────────────────────────────────────────────────────

class TestFetchBinanceWithdrawal:
    def test_success_btc(self, mocker):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "success": True,
            "data": [
                {
                    "coin": "BTC",
                    "networkList": [
                        {
                            "name": "BTC",
                            "withdrawFee": "0.0001",
                            "withdrawMin": "0.001",
                            "withdrawEnable": True,
                        }
                    ],
                }
            ],
        }
        mocker.patch("fee_checker._get", return_value=mock_resp)

        result = fee_checker.fetch_binance_withdrawal("BTC")
        assert len(result) == 1
        assert result[0]["fee"] == 0.0001
        assert result[0]["enabled"] is True

    def test_coin_not_found(self, mocker):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"success": True, "data": []}
        mocker.patch("fee_checker._get", return_value=mock_resp)

        result = fee_checker.fetch_binance_withdrawal("XYZ")
        assert result == []

    def test_api_failure(self, mocker):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"success": False}
        mocker.patch("fee_checker._get", return_value=mock_resp)

        with pytest.raises(ValueError, match="Binance 출금 API 오류"):
            fee_checker.fetch_binance_withdrawal("BTC")


class TestFetchOkxWithdrawal:
    def test_success_btc(self, mocker):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "data": [
                {
                    "symbol": "BTC",
                    "networkName": ["Bitcoin"],
                    "minFee": ["0.0002"],
                    "minAmount": ["0.001"],
                }
            ]
        }
        mocker.patch("fee_checker._get", return_value=mock_resp)

        result = fee_checker.fetch_okx_withdrawal("BTC")
        assert any(r["label"] == "Bitcoin" for r in result)
        # BTC인 경우 Lightning Network 항목 추가
        assert any("Lightning" in r["label"] for r in result)

    def test_not_found(self, mocker):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"data": []}
        mocker.patch("fee_checker._get", return_value=mock_resp)

        result = fee_checker.fetch_okx_withdrawal("XYZ")
        assert result == []


class TestFetchGopaxWithdrawal:
    def test_success(self, mocker):
        mock_resp = MagicMock()
        mock_resp.json.return_value = [
            {"id": "BTC", "networkName": "Bitcoin", "withdrawalFee": "0.0005", "withdrawalAmountMin": "0.001"}
        ]
        mocker.patch("fee_checker._get", return_value=mock_resp)

        result = fee_checker.fetch_gopax_withdrawal("BTC")
        assert len(result) == 1
        assert result[0]["fee"] == 0.0005

    def test_not_found(self, mocker):
        mock_resp = MagicMock()
        mock_resp.json.return_value = []
        mocker.patch("fee_checker._get", return_value=mock_resp)

        result = fee_checker.fetch_gopax_withdrawal("BTC")
        assert result == []


class TestFetchBithumbWithdrawal:
    def test_success_btc_and_usdt(self, mocker):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "status": 200,
            "data": [
                {
                    "coinSymbol": "BTC",
                    "networkInfoList": [
                        {
                            "networkName": "Bitcoin",
                            "withdrawFeeQuantity": "0.0002",
                            "withdrawMinimumQuantity": "0.001",
                            "isWithdrawAvailable": True,
                        }
                    ],
                },
                {
                    "coinSymbol": "USDT",
                    "networkInfoList": [
                        {
                            "networkName": "Tron",
                            "withdrawFeeQuantity": "0",
                            "withdrawMinimumQuantity": "0.000001",
                            "isWithdrawAvailable": True,
                        },
                        {
                            "networkName": "Ethereum",
                            "withdrawFeeQuantity": "4",
                            "withdrawMinimumQuantity": "4",
                            "isWithdrawAvailable": True,
                        },
                    ],
                },
            ],
        }
        mocker.patch("fee_checker._get", return_value=mock_resp)

        btc = fee_checker.fetch_bithumb_withdrawal("BTC")
        usdt = fee_checker.fetch_bithumb_withdrawal("USDT")
        assert btc == [{"label": "Bitcoin (On-chain)", "fee": 0.0002, "min": 0.001, "enabled": True}]
        assert usdt[0]["label"] == "TRC20"
        assert usdt[0]["fee"] == 0.0
        assert usdt[1]["label"] == "ERC20"
        assert usdt[1]["fee"] == 4.0

    def test_api_error(self, mocker):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"status": 500}
        mocker.patch("fee_checker._get", return_value=mock_resp)

        with pytest.raises(ValueError, match="Bithumb 출금 API 오류"):
            fee_checker.fetch_bithumb_withdrawal("BTC")


class TestFetchBitgetWithdrawal:
    def test_success(self, mocker):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "code": "00000",
            "data": [
                {
                    "chains": [
                        {
                            "chain": "BTC",
                            "withdrawFee": "0.0002",
                            "minWithdrawAmount": "0.001",
                            "withdrawable": "true",
                        }
                    ]
                }
            ],
        }
        mocker.patch("fee_checker._get", return_value=mock_resp)

        result = fee_checker.fetch_bitget_withdrawal("BTC")
        assert len(result) == 1
        assert result[0]["fee"] == 0.0002

    def test_api_error(self, mocker):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"code": "40001", "data": None}
        mocker.patch("fee_checker._get", return_value=mock_resp)

        result = fee_checker.fetch_bitget_withdrawal("BTC")
        assert result == []
