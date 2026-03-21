from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import UTC, datetime

from sqlalchemy.orm import Session

import logging

from backend.app.db.models import CrawlError, CrawlRun, ExchangeCapabilitySnapshot, ExchangeNotice, LightningSwapFeeSnapshot, NetworkStatusSnapshot, TickerSnapshot, WithdrawalFeeSnapshot
from backend.app.services import live_market
from backend.app.services.lightning_scraper import get_all_lightning_swap_fees
from backend.app.services.notice_scraper import get_all_notices

# 지연 임포트: 순환 참조 방지용 (실제 호출은 run_full_crawl 내에서)
def _invalidate_market_cache() -> None:
    try:
        from backend.app.api.routes.market import invalidate_status_cache  # noqa: PLC0415
        invalidate_status_cache()
    except Exception:
        pass

logger = logging.getLogger(__name__)


class CrawlService:
    def __init__(self, db: Session):
        self.db = db

    def run_full_crawl(self, trigger: str = 'manual') -> CrawlRun:
        crawl_run = CrawlRun(trigger=trigger, status='running')
        self.db.add(crawl_run)
        self.db.commit()
        self.db.refresh(crawl_run)

        ticker_count = 0
        withdrawal_count = 0
        network_count = 0
        lightning_count = 0
        capability_count = 0
        error_count = 0
        _ln_btc_exchanges: set[str] = set()

        try:
            ticker_count, withdrawal_count, error_count, _ln_btc_exchanges = self._crawl_tickers_and_withdrawals(crawl_run)
            network_count = self._crawl_network_status(crawl_run)
            lightning_count = self._crawl_lightning_fees(crawl_run)
            capability_count = self._crawl_capabilities(crawl_run, _ln_btc_exchanges)
            self._crawl_notices(crawl_run)

            crawl_run.status = 'partial_success' if error_count else 'success'
            crawl_run.message = f'tickers={ticker_count}, withdrawals={withdrawal_count}, networks={network_count}, lightning_swaps={lightning_count}, capabilities={capability_count}, errors={error_count}'
            _invalidate_market_cache()
        except Exception as exc:
            self.db.rollback()          # 부분 커밋 방지
            self._add_error(crawl_run.id, None, None, 'crawl', str(exc))
            crawl_run.status = 'failed'
            crawl_run.message = str(exc)
        finally:
            crawl_run.completed_at = datetime.now(UTC)
            self.db.add(crawl_run)
            self.db.commit()
            self.db.refresh(crawl_run)
        return crawl_run

    def _crawl_tickers_and_withdrawals(self, crawl_run: CrawlRun) -> tuple[int, int, int, set[str]]:
        """티커 및 출금 수수료를 병렬 수집하고 (ticker_count, withdrawal_count, error_count, ln_btc_exchanges)를 반환한다."""
        usd_krw_rate = live_market.fetch_usd_krw_rate()
        crawl_run.usd_krw_rate = usd_krw_rate

        ticker_count = 0
        withdrawal_count = 0
        error_count = 0
        ln_btc_exchanges: set[str] = set()

        def _fetch_one(exchange: str) -> dict:
            """단일 거래소의 ticker + BTC/USDT withdrawal을 반환한다."""
            return {
                'exchange': exchange,
                'ticker': live_market.get_ticker(exchange),
                'btc_wd': live_market.get_withdrawal_fees(exchange, 'BTC'),
                'usdt_wd': live_market.get_withdrawal_fees(exchange, 'USDT'),
            }

        # 병렬 fetch (최대 10개 스레드)
        fetch_results: dict[str, dict] = {}
        with ThreadPoolExecutor(max_workers=10) as executor:
            future_to_exchange = {executor.submit(_fetch_one, ex): ex for ex in live_market.ALL_EXCHANGES}
            for future in as_completed(future_to_exchange):
                ex = future_to_exchange[future]
                try:
                    fetch_results[ex] = future.result()
                except Exception as exc:
                    logger.error('Exchange fetch failed for %s: %s', ex, exc)
                    fetch_results[ex] = {
                        'exchange': ex,
                        'ticker': {'error': str(exc)},
                        'btc_wd': {'error': str(exc)},
                        'usdt_wd': {'error': str(exc)},
                    }

        # DB 저장은 메인 스레드에서 순차적으로 (Session 스레드 안전 보장)
        for exchange in live_market.ALL_EXCHANGES:
            result = fetch_results[exchange]
            ticker_payload = result['ticker']

            if 'error' in ticker_payload:
                self._add_error(crawl_run.id, exchange, None, 'ticker', ticker_payload['error'])
                error_count += 1
            else:
                markets = ticker_payload.get('markets', [ticker_payload])
                for market in markets:
                    self.db.add(TickerSnapshot(
                        crawl_run_id=crawl_run.id,
                        exchange=market['exchange'],
                        pair=market['pair'],
                        market_type=market['market_type'],
                        currency=market['currency'],
                        price=market['price'],
                        high_24h=market.get('high_24h'),
                        low_24h=market.get('low_24h'),
                        volume_24h_btc=market.get('volume_24h_btc'),
                        maker_fee_pct=market.get('maker_fee_pct'),
                        taker_fee_pct=market.get('taker_fee_pct'),
                        maker_fee_usd=market.get('maker_fee_usd'),
                        maker_fee_krw=market.get('maker_fee_krw'),
                        taker_fee_usd=market.get('taker_fee_usd'),
                        taker_fee_krw=market.get('taker_fee_krw'),
                        usd_krw_rate=market.get('usd_krw_rate'),
                    ))
                    ticker_count += 1

            for coin, wd_key in [('BTC', 'btc_wd'), ('USDT', 'usdt_wd')]:
                withdrawal_payload = result[wd_key]
                if 'error' in withdrawal_payload:
                    self._add_error(crawl_run.id, exchange, coin, 'withdrawal', withdrawal_payload['error'])
                    error_count += 1
                    continue
                for network in withdrawal_payload['networks']:
                    label = network.get('label', 'unknown')
                    fee = network.get('fee')
                    enabled = network.get('enabled', True)
                    self.db.add(WithdrawalFeeSnapshot(
                        crawl_run_id=crawl_run.id,
                        exchange=exchange,
                        coin=coin,
                        source=withdrawal_payload['source'],
                        network_label=label,
                        fee=fee,
                        fee_usd=network.get('fee_usd'),
                        fee_krw=network.get('fee_krw'),
                        min_withdrawal=network.get('min'),
                        max_withdrawal=network.get('max'),
                        enabled=enabled,
                        note=network.get('note'),
                    ))
                    withdrawal_count += 1
                    if coin == 'BTC' and enabled and fee is not None and 'lightning' in label.lower():
                        ln_btc_exchanges.add(exchange)

        return ticker_count, withdrawal_count, error_count, ln_btc_exchanges

    def _crawl_network_status(self, crawl_run: CrawlRun) -> int:
        """네트워크 상태를 수집하고 저장 건수를 반환한다."""
        network_count = 0
        network_payload = live_market.get_network_status('all')
        exchanges = network_payload.get('exchanges', {}) if isinstance(network_payload, dict) else {}
        for exchange, data in exchanges.items():
            suspended = data.get('suspended_networks', [])
            if not suspended:
                self.db.add(NetworkStatusSnapshot(crawl_run_id=crawl_run.id, exchange=exchange, status='ok'))
                network_count += 1
                continue
            for item in suspended:
                self.db.add(NetworkStatusSnapshot(
                    crawl_run_id=crawl_run.id,
                    exchange=exchange,
                    coin=item.get('coin'),
                    network=item.get('network'),
                    status=item.get('status', 'maintenance_detected'),
                    reason=item.get('reason'),
                    source_url=item.get('source_url'),
                    detected_at=item.get('detected_at'),
                ))
                network_count += 1
        return network_count

    def _crawl_lightning_fees(self, crawl_run: CrawlRun) -> int:
        """Lightning 스왑 수수료를 수집하고 저장 건수를 반환한다. 오류가 나도 전체 크롤링 성공에 영향 없음."""
        lightning_count = 0
        lightning_fees = get_all_lightning_swap_fees()
        for fee_data in lightning_fees:
            if fee_data.get('error'):
                logger.warning('Lightning swap fee partial: %s - %s', fee_data.get('service_name'), fee_data['error'])
                self._add_error(crawl_run.id, None, None, 'lightning_swap', f"{fee_data.get('service_name', 'unknown')}: {fee_data['error']}")
                # lightning_swap 오류는 error_count에 포함하지 않음 (부가 정보)
            self.db.add(LightningSwapFeeSnapshot(
                crawl_run_id=crawl_run.id,
                service_name=fee_data.get('service_name', 'unknown'),
                fee_pct=fee_data.get('fee_pct'),
                fee_fixed_sat=fee_data.get('fee_fixed_sat'),
                min_amount_sat=fee_data.get('min_amount_sat'),
                max_amount_sat=fee_data.get('max_amount_sat'),
                enabled=fee_data.get('enabled', True),
                source_url=fee_data.get('source_url'),
                error_message=fee_data.get('error'),
                direction=fee_data.get('direction'),
            ))
            lightning_count += 1
        return lightning_count

    def _crawl_capabilities(self, crawl_run: CrawlRun, ln_btc_exchanges: set[str]) -> int:
        """거래소별 Lightning 입출금 지원 여부를 저장하고 저장 건수를 반환한다."""
        capability_count = 0
        for ex in live_market.ALL_EXCHANGES:
            has_ln = ex in ln_btc_exchanges
            self.db.add(ExchangeCapabilitySnapshot(
                crawl_run_id=crawl_run.id,
                exchange=ex,
                supports_lightning_deposit=has_ln,
                supports_lightning_withdrawal=has_ln,
            ))
            capability_count += 1
        return capability_count

    def _crawl_notices(self, crawl_run: CrawlRun) -> None:
        """공지사항을 스크래핑하여 저장한다. 오류가 나도 전체 크롤링 성공에 영향 없음."""
        try:
            notices = get_all_notices()
            for notice in notices:
                self.db.add(ExchangeNotice(
                    crawl_run_id=crawl_run.id,
                    exchange=notice.get('exchange', 'unknown'),
                    title=notice.get('title', ''),
                    url=notice.get('url'),
                    published_at=notice.get('published_at'),
                ))
        except Exception as exc:
            logger.warning('Notice scraping failed: %s', exc)

    def _add_error(self, crawl_run_id: int, exchange: str | None, coin: str | None, stage: str, error_message: str) -> None:
        self.db.add(CrawlError(crawl_run_id=crawl_run_id, exchange=exchange, coin=coin, stage=stage, error_message=error_message))
        self.db.flush()
