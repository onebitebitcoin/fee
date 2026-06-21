"""route_inspect.py 유닛 테스트."""
import pytest
from backend.app.domain.route_inspect import InspectResult, inspect_all, inspect_path


def _valid_entry(**overrides) -> dict:
    base = {
        'path_id': 'upbit|BTC|binance|onchain',
        'transfer_coin': 'BTC',
        'global_exchange': 'binance',
        'btc_received': 0.009,
        'total_fee_krw': 15000,
        'fee_pct': 1.5,
        'breakdown': {
            'total_fee_krw': 15000,
            'components': [
                {'label': '출금 수수료', 'amount_krw': 15000},
            ],
        },
    }
    base.update(overrides)
    return base


class TestInspectPath:
    def test_valid_entry_returns_ok(self):
        result = inspect_path(_valid_entry())
        assert result.severity == 'ok'
        assert result.issues == []
        assert result.path_id == 'upbit|BTC|binance|onchain'

    def test_missing_path_id_is_error(self):
        entry = _valid_entry()
        del entry['path_id']
        result = inspect_path(entry)
        assert result.severity == 'error'
        assert any('path_id' in i for i in result.issues)
        assert result.path_id == '<unknown>'

    def test_negative_total_fee_is_error(self):
        result = inspect_path(_valid_entry(total_fee_krw=-1, breakdown={'total_fee_krw': -1, 'components': [{'x': 1}]}))
        assert result.severity == 'error'
        assert any('음수' in i for i in result.issues)

    def test_zero_btc_received_is_error(self):
        result = inspect_path(_valid_entry(btc_received=0))
        assert result.severity == 'error'
        assert any('btc_received' in i for i in result.issues)

    def test_negative_btc_received_is_error(self):
        result = inspect_path(_valid_entry(btc_received=-0.001))
        assert result.severity == 'error'

    def test_invalid_transfer_coin_is_error(self):
        result = inspect_path(_valid_entry(transfer_coin='ETH'))
        assert any('transfer_coin' in i for i in result.issues)

    def test_invalid_global_exchange_is_warning(self):
        result = inspect_path(_valid_entry(global_exchange='unknown_exchange'))
        assert any('global_exchange' in i for i in result.issues)

    def test_empty_breakdown_components_is_error(self):
        entry = _valid_entry()
        entry['breakdown']['components'] = []
        result = inspect_path(entry)
        assert any('components' in i for i in result.issues)

    def test_fee_pct_over_100_is_warning(self):
        result = inspect_path(_valid_entry(fee_pct=150))
        assert any('fee_pct' in i for i in result.issues)

    def test_breakdown_total_mismatch_is_warning(self):
        entry = _valid_entry()
        entry['breakdown']['total_fee_krw'] = 99999
        result = inspect_path(entry)
        assert any('불일치' in i for i in result.issues)

    def test_missing_global_exchange_no_issue(self):
        """global_exchange가 없는 경로(직접출금 등)는 이슈 없음."""
        entry = _valid_entry()
        del entry['global_exchange']
        result = inspect_path(entry)
        assert result.severity == 'ok'

    def test_usdt_transfer_coin_is_valid(self):
        result = inspect_path(_valid_entry(transfer_coin='USDT'))
        assert result.severity == 'ok'


class TestInspectAll:
    def test_empty_list_returns_empty(self):
        assert inspect_all([]) == []

    def test_returns_result_per_entry(self):
        entries = [_valid_entry(), _valid_entry(path_id='p2|BTC|okx|onchain')]
        results = inspect_all(entries)
        assert len(results) == 2
        assert all(isinstance(r, InspectResult) for r in results)

    def test_mixed_ok_and_error(self):
        entries = [
            _valid_entry(),
            _valid_entry(btc_received=0),
        ]
        results = inspect_all(entries)
        severities = [r.severity for r in results]
        assert 'ok' in severities
        assert 'error' in severities
