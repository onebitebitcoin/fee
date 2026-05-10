"""notice_scraper 유닛 테스트 (네트워크 없이 mock 사용)"""
from __future__ import annotations

from datetime import datetime
from unittest.mock import MagicMock, patch

from backend.app.services.notice_scraper import (
    _BINANCE_LOCALE_URL_PREFIX,
    _is_relevant_for_binance,
    fetch_binance_notices,
    get_all_notices,
)


# ---------------------------------------------------------------------------
# _is_relevant_for_binance
# ---------------------------------------------------------------------------

class TestIsRelevantForBinance:
    def test_btc_keyword_passes(self) -> None:
        assert _is_relevant_for_binance('BTC Spot Trading Update') is True

    def test_usdt_keyword_passes(self) -> None:
        assert _is_relevant_for_binance('USDT Network Maintenance') is True

    def test_zero_fee_keyword_passes(self) -> None:
        assert _is_relevant_for_binance('Zero fee trading event for March') is True

    def test_fdusd_keyword_passes(self) -> None:
        assert _is_relevant_for_binance('BTC/FDUSD trading pair update') is True

    def test_trading_fee_keyword_passes(self) -> None:
        assert _is_relevant_for_binance('Trading fee structure changes') is True

    def test_fee_update_keyword_passes(self) -> None:
        assert _is_relevant_for_binance('Fee update for VIP users') is True

    def test_unrelated_notice_fails(self) -> None:
        assert _is_relevant_for_binance('New altcoin listing: DOGE/TRY') is False

    def test_empty_string_fails(self) -> None:
        assert _is_relevant_for_binance('') is False

    def test_case_insensitive(self) -> None:
        assert _is_relevant_for_binance('ZERO FEE PROMOTION') is True
        assert _is_relevant_for_binance('zero-fee event') is True


# ---------------------------------------------------------------------------
# fetch_binance_notices
# ---------------------------------------------------------------------------

def _make_mock_response(articles: list[dict], code: str = '000000') -> MagicMock:
    mock = MagicMock()
    mock.raise_for_status.return_value = None
    mock.json.return_value = {
        'code': code,
        'data': {
            'catalogs': [
                {'catalogId': 49, 'articles': articles}
            ]
        },
    }
    return mock


class TestFetchBinanceNotices:
    def test_returns_relevant_articles(self) -> None:
        articles = [
            {'id': 1, 'code': 'btc-fee-update-001', 'title': 'BTC Trading Fee Update', 'releaseDate': 1700000000000},
            {'id': 2, 'code': 'altcoin-news-002', 'title': 'New altcoin listing XYZ', 'releaseDate': 1700000001000},
        ]
        with patch('requests.get', return_value=_make_mock_response(articles)):
            result = fetch_binance_notices()

        assert len(result) == 1
        assert result[0]['exchange'] == 'binance'
        assert result[0]['title'] == 'BTC Trading Fee Update'
        assert result[0]['url'] == f"{_BINANCE_LOCALE_URL_PREFIX['en']}/btc-fee-update-001"
        assert isinstance(result[0]['published_at'], datetime)

    def test_returns_empty_on_api_error_code(self) -> None:
        with patch('requests.get', return_value=_make_mock_response([], code='100001')):
            result = fetch_binance_notices()
        assert result == []

    def test_returns_empty_on_network_exception(self) -> None:
        with patch('requests.get', side_effect=Exception('connection refused')):
            result = fetch_binance_notices()
        assert result == []

    def test_respects_max_notices_limit(self) -> None:
        articles = [
            {'id': i, 'code': f'btc-event-{i:03d}', 'title': f'BTC Fee Event {i}', 'releaseDate': 1700000000000}
            for i in range(10)
        ]
        with patch('requests.get', return_value=_make_mock_response(articles)):
            result = fetch_binance_notices()
        assert len(result) <= 5  # _MAX_NOTICES

    def test_skips_items_without_title(self) -> None:
        articles = [
            {'id': 1, 'code': 'btc-001', 'title': '', 'releaseDate': 1700000000000},
            {'id': 2, 'code': 'btc-002', 'title': 'Zero fee trading launch', 'releaseDate': 1700000001000},
        ]
        with patch('requests.get', return_value=_make_mock_response(articles)):
            result = fetch_binance_notices()
        assert len(result) == 1
        assert result[0]['title'] == 'Zero fee trading launch'

    def test_handles_missing_release_date(self) -> None:
        articles = [
            {'id': 1, 'code': 'btc-001', 'title': 'BTC withdrawal update'},
        ]
        with patch('requests.get', return_value=_make_mock_response(articles)):
            result = fetch_binance_notices()
        assert len(result) == 1
        assert result[0]['published_at'] is None

    def test_korean_locale_uses_ko_url_prefix(self) -> None:
        articles = [
            {'id': 1, 'code': 'btc-kr-001', 'title': 'BTC 수수료 업데이트', 'releaseDate': 1700000000000},
        ]
        with patch('requests.get', return_value=_make_mock_response(articles)):
            result = fetch_binance_notices(locale='ko')

        assert result[0]['url'].startswith(_BINANCE_LOCALE_URL_PREFIX['ko'])

    def test_handles_flat_articles_structure(self) -> None:
        """catalogs 없이 data.articles 바로 있는 응답 구조도 처리"""
        mock = MagicMock()
        mock.raise_for_status.return_value = None
        mock.json.return_value = {
            'code': '000000',
            'data': {
                'articles': [
                    {'id': 1, 'code': 'btc-flat-001', 'title': 'BTC fee waiver event', 'releaseDate': 1700000000000},
                ]
            },
        }
        with patch('requests.get', return_value=mock):
            result = fetch_binance_notices()
        assert len(result) == 1


# ---------------------------------------------------------------------------
# get_all_notices — Binance 포함 여부 통합 확인
# ---------------------------------------------------------------------------

class TestGetAllNoticesIncludesBinance:
    def test_binance_included_in_aggregation(self) -> None:
        def _make_fetcher_patch(name: str, result: list[dict]):
            return patch(f'backend.app.services.notice_scraper.{name}', return_value=result)

        binance_notice = {
            'exchange': 'binance',
            'title': 'Zero fee BTC/FDUSD promotion',
            'url': 'https://www.binance.com/en/support/announcement/abc-123',
            'published_at': None,
        }

        with (
            _make_fetcher_patch('fetch_upbit_notices', []),
            _make_fetcher_patch('fetch_bithumb_notices', []),
            _make_fetcher_patch('fetch_coinone_notices', []),
            _make_fetcher_patch('fetch_korbit_notices', []),
            _make_fetcher_patch('fetch_binance_notices', [binance_notice]),
        ):
            result = get_all_notices()

        exchanges = {n['exchange'] for n in result}
        assert 'binance' in exchanges
