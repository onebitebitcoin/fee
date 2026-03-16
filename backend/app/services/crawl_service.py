from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.orm import Session

import logging

from backend.app.db.models import CrawlError, CrawlRun, ExchangeNotice, LightningSwapFeeSnapshot, NetworkStatusSnapshot, TickerSnapshot, WithdrawalFeeSnapshot
from backend.app.services import live_market
from backend.app.services.lightning_scraper import get_all_lightning_swap_fees
from backend.app.services.notice_scraper import get_all_notices

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
        error_count = 0

        try:
            usd_krw_rate = live_market.fetch_usd_krw_rate()
            crawl_run.usd_krw_rate = usd_krw_rate
            for exchange in live_market.ALL_EXCHANGES:
                ticker_payload = live_market.get_ticker(exchange)
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
                for coin in ['BTC', 'USDT']:
                    withdrawal_payload = live_market.get_withdrawal_fees(exchange, coin)
                    if 'error' in withdrawal_payload:
                        self._add_error(crawl_run.id, exchange, coin, 'withdrawal', withdrawal_payload['error'])
                        error_count += 1
                        continue
                    for network in withdrawal_payload['networks']:
                        self.db.add(WithdrawalFeeSnapshot(
                            crawl_run_id=crawl_run.id,
                            exchange=exchange,
                            coin=coin,
                            source=withdrawal_payload['source'],
                            network_label=network.get('label', 'unknown'),
                            fee=network.get('fee'),
                            fee_usd=network.get('fee_usd'),
                            fee_krw=network.get('fee_krw'),
                            enabled=network.get('enabled', True),
                            note=network.get('note'),
                        ))
                        withdrawal_count += 1
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
            # Lightning 스왑 수수료 수집 (오류가 나도 전체 크롤링 성공에 영향 없음)
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
                ))
                lightning_count += 1

            # 공지사항 스크래핑 (오류가 나도 전체 크롤링 성공에 영향 없음)
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

            crawl_run.status = 'partial_success' if error_count else 'success'
            crawl_run.message = f'tickers={ticker_count}, withdrawals={withdrawal_count}, networks={network_count}, lightning_swaps={lightning_count}, errors={error_count}'
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

    def _add_error(self, crawl_run_id: int, exchange: str | None, coin: str | None, stage: str, error_message: str) -> None:
        self.db.add(CrawlError(crawl_run_id=crawl_run_id, exchange=exchange, coin=coin, stage=stage, error_message=error_message))
        self.db.flush()
