"""notice_scraper 유닛 테스트 (네트워크 없이 mock 사용)"""
from __future__ import annotations

from datetime import datetime
from unittest.mock import MagicMock, patch

from backend.app.services.notice_scraper import (
    _BINANCE_LOCALE_URL_PREFIX,
    _binance_catalog_filter,
    _is_relevant,
    _is_relevant_for_binance,
    _keyword_in_title,
    fetch_binance_notices,
    fetch_notices_for_exchange,
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
# 티커 부분 문자열 오탐 방지 (HUSDT·BTCUSDT 선물 페어)
# ---------------------------------------------------------------------------

# 실제 바이낸스 선물 공지 — 토큰 "H"의 USDⓈ 마진 무기한 계약. BTC/USDT 이송과 무관.
_HUSDT_FUTURES_TITLE = (
    'Binance Futures Will End Last Price Protected Period on '
    'USDⓈ-Margined HUSDT Perpetual Contract (2026-06-18)'
)


class TestTickerWordBoundary:
    def test_keyword_in_title_usdt_substring_rejected(self) -> None:
        """'HUSDT' 안의 'usdt'는 USDT 키워드로 매칭되면 안 된다."""
        assert _keyword_in_title('husdt perpetual contract', 'USDT') is False

    def test_keyword_in_title_btcusdt_pair_rejected(self) -> None:
        """'btcusdt' 선물 페어는 BTC/USDT 어느 쪽으로도 매칭되면 안 된다."""
        assert _keyword_in_title('btcusdt funding rate', 'USDT') is False
        assert _keyword_in_title('btcusdt funding rate', 'BTC') is False

    def test_keyword_in_title_standalone_usdt_passes(self) -> None:
        assert _keyword_in_title('usdt withdrawal suspended', 'USDT') is True

    def test_keyword_in_title_spot_pair_passes(self) -> None:
        """공백/슬래시로 분리된 스팟 페어는 정상 매칭."""
        assert _keyword_in_title('btc/usdt spot trading', 'BTC') is True
        assert _keyword_in_title('btc/usdt spot trading', 'USDT') is True

    def test_keyword_in_title_korean_particle_passes(self) -> None:
        """한글 조사 결합(BTC를)도 정상 매칭 — 라틴 문자 인접만 차단."""
        assert _keyword_in_title('btc를 출금합니다', 'BTC') is True

    def test_keyword_in_title_descriptive_substring(self) -> None:
        """서술형 키워드는 기존 substring 동작 유지."""
        assert _keyword_in_title('bitcoin network upgrade', 'Bitcoin') is True

    def test_husdt_futures_not_relevant(self) -> None:
        assert _is_relevant(_HUSDT_FUTURES_TITLE) is False
        assert _is_relevant_for_binance(_HUSDT_FUTURES_TITLE) is False

    def test_husdt_futures_rejected_by_catalog49(self) -> None:
        """catalog 49(keyword 전략)에서 HUSDT 선물 공지가 걸러져야 한다."""
        assert _binance_catalog_filter(49, _HUSDT_FUTURES_TITLE) is False

    def test_legitimate_usdt_notice_still_passes(self) -> None:
        assert _is_relevant('USDT Deposits Suspended on Tron (TRC20)') is True

    def test_targeted_fetch_excludes_husdt(self) -> None:
        """USDT 네트워크 변경 시 타깃 탐색이 HUSDT 선물 공지를 첨부하지 않는다."""
        husdt = {'exchange': 'binance', 'title': _HUSDT_FUTURES_TITLE, 'url': 'x', 'published_at': None}
        real = {'exchange': 'binance', 'title': 'USDT Withdrawal Suspended (BEP20)', 'url': 'y', 'published_at': None}
        with patch(
            'backend.app.services.notice_scraper.fetch_binance_notices',
            return_value=[husdt, real],
        ):
            result = fetch_notices_for_exchange('binance', ['USDT'])
        titles = [n['title'] for n in result]
        assert _HUSDT_FUTURES_TITLE not in titles
        assert 'USDT Withdrawal Suspended (BEP20)' in titles


# ---------------------------------------------------------------------------
# _binance_catalog_filter
# ---------------------------------------------------------------------------

class TestBinanceCatalogFilter:
    # catalog 48 — btc_only
    def test_catalog48_btc_passes(self) -> None:
        assert _binance_catalog_filter(48, 'Binance Will Launch BTC/USDT Spot Trading') is True

    def test_catalog48_usdt_perpetual_rejected(self) -> None:
        assert _binance_catalog_filter(48, 'Binance Futures Will Launch BILLUSDT Perpetual Contract') is False

    def test_catalog48_usdt_kzt_pair_rejected(self) -> None:
        assert _binance_catalog_filter(48, 'Binance Adds USDT/KZT Spot Trading Pair') is False

    # catalog 49 — keyword (BTC/USDT/fee)
    def test_catalog49_fee_update_passes(self) -> None:
        assert _binance_catalog_filter(49, 'Binance Trading Fee Update for March') is True

    def test_catalog49_usdt_news_passes(self) -> None:
        assert _binance_catalog_filter(49, 'USDT Network Upgrade Announcement') is True

    def test_catalog49_unrelated_rejected(self) -> None:
        assert _binance_catalog_filter(49, 'Binance Partners with Sports Club') is False

    # catalog 50, 51, 128 — skip
    def test_catalog50_always_rejected(self) -> None:
        assert _binance_catalog_filter(50, 'Buy BTC Directly Using Credit Card') is False

    def test_catalog51_always_rejected(self) -> None:
        assert _binance_catalog_filter(51, 'BTC WebSocket API Update') is False

    def test_catalog128_always_rejected(self) -> None:
        assert _binance_catalog_filter(128, 'BTC Airdrop for HODLers') is False

    # catalog 93 — fee_or_btc
    def test_catalog93_btc_reward_passes(self) -> None:
        assert _binance_catalog_filter(93, 'Binance Academy Bitcoin Page: Earn BTC Rewards') is True

    def test_catalog93_zero_fee_passes(self) -> None:
        assert _binance_catalog_filter(93, 'Zero fee trading event this week') is True

    def test_catalog93_usdt_earn_rejected(self) -> None:
        assert _binance_catalog_filter(93, 'Subscribe to USDT Simple Earn for New Users') is False

    def test_catalog93_usdt_loan_rejected(self) -> None:
        assert _binance_catalog_filter(93, 'Borrow USDT or USDC to Win a Share') is False

    # catalog 157 — maintenance
    def test_catalog157_btc_maintenance_passes(self) -> None:
        assert _binance_catalog_filter(157, 'Wallet Maintenance for Bitcoin (BTC) Network') is True

    def test_catalog157_usdt_withdrawal_passes(self) -> None:
        assert _binance_catalog_filter(157, 'Binance Will Cease USDT Withdrawal Support') is True

    def test_catalog157_altcoin_swap_rejected(self) -> None:
        assert _binance_catalog_filter(157, 'Binance Will Support the Chiliz Fan Tokens Contract Swap') is False

    # catalog 161 — btc_only
    def test_catalog161_btc_delisting_passes(self) -> None:
        assert _binance_catalog_filter(161, 'Notice of Removal of BTC Spot Trading Pairs') is True

    def test_catalog161_altcoin_delisting_rejected(self) -> None:
        assert _binance_catalog_filter(161, 'Notice of Removal of Spot Trading Pairs - 2026-05-08') is False

    # 미등록 카탈로그 — keyword 기본값
    def test_unknown_catalog_uses_keyword_strategy(self) -> None:
        assert _binance_catalog_filter(999, 'BTC deposit suspended') is True
        assert _binance_catalog_filter(999, 'New altcoin listing XYZ') is False


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
