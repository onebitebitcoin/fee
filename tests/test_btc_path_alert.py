import scripts.btc_path_alert as alert


def _path(*, mode="lightning_swap", kyc=False, fee=1000, btc=0.001):
    return {
        "korean_exchange": "bithumb",
        "global_exchange": "binance",
        "transfer_coin": "USDT",
        "network": "TRC20",
        "global_exit_mode": mode,
        "quote_strategy": "usdt_taker",
        "ln_swap_display": "Boltz" if mode == "lightning_swap" else "",
        "ln_swap_kyc": kyc,
        "btc_received": btc,
        "total_fee_krw": fee,
        "fee_pct": 0.1,
        "breakdown": {"components": []},
    }


def _result(paths):
    return {
        "promo_context": {},
        "total_paths_evaluated": len(paths),
        "global_exchanges_searched": ["binance"],
        "all_paths": paths,
        "top10": paths,
        "global_btc_price_krw_ref": 100_000_000,
    }


def test_lightning_mode_message_uses_lightning_paths_without_eligible_name_error(monkeypatch):
    monkeypatch.setattr(alert, "fetch_mempool_fees", lambda: None, raising=False)
    message = alert._build_telegram_message_all(
        _result([_path(mode="lightning_swap"), _path(mode="onchain", fee=500)]),
        amount_krw=1_000_000,
        mode="lightning",
    )

    assert "Lightning 출금 TOP 5" in message
    assert "Boltz" in message
    assert "NameError" not in message


def test_cheapest_mode_excludes_btc_direct_unless_travel_rule(monkeypatch):
    monkeypatch.setattr(alert, "fetch_mempool_fees", lambda: None, raising=False)
    btc_direct = _path(mode="direct", fee=100, btc=0.002)
    btc_direct["quote_strategy"] = "btc_direct"
    btc_direct["transfer_coin"] = "BTC"
    usdt_path = _path(mode="onchain", fee=2000, btc=0.001)

    without_travel_rule = alert._build_telegram_message_all(
        _result([btc_direct, usdt_path]),
        amount_krw=1_000_000,
        mode="cheapest",
        travel_rule=False,
    )
    with_travel_rule = alert._build_telegram_message_all(
        _result([btc_direct, usdt_path]),
        amount_krw=1_000_000,
        mode="cheapest",
        travel_rule=True,
    )

    first_rank_without = without_travel_rule.split("1️⃣", 1)[1].split("\n", 1)[0]
    first_rank_with = with_travel_rule.split("1️⃣", 1)[1].split("\n", 1)[0]

    assert "USDT/TRC20" in first_rank_without
    assert "BTC/TRC20" in first_rank_with


def test_exchange_summary_reports_lowest_fee_not_first_by_btc(monkeypatch):
    from backend.app.domain import paths_dynamic

    paths_by_exchange = {
        "binance": [
            {"btc_received": 0.002, "total_fee_krw": 3000, "fee_pct": 0.3, "quote_strategy": "usdt_taker"},
            {"btc_received": 0.001, "total_fee_krw": 1000, "fee_pct": 0.1, "quote_strategy": "fdusd_maker"},
        ],
        "okx": [
            {"btc_received": 0.0015, "total_fee_krw": 2000, "fee_pct": 0.2, "quote_strategy": "usdt_taker"},
        ],
    }

    monkeypatch.setattr(paths_dynamic, "GROUPS", {"global": ["binance", "okx"]})

    def fake_dynamic(amount_krw, exchange, promo_ctx, include_fdusd):
        return {"all_paths": [p.copy() for p in paths_by_exchange[exchange]]}

    monkeypatch.setattr(paths_dynamic, "find_cheapest_path_dynamic", fake_dynamic)

    result = paths_dynamic.find_cheapest_path_all_exchanges(amount_krw=1_000_000, promo_ctx=paths_dynamic.PromoContext())

    assert result["exchange_summaries"]["binance"]["best_fee_krw"] == 1000
    assert result["exchange_summaries"]["binance"]["best_strategy"] == "fdusd_maker"
