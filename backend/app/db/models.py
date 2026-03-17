from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.base import Base


class CrawlRun(Base):
    __tablename__ = 'crawl_runs'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    trigger: Mapped[str] = mapped_column(String(32), default='manual')
    status: Mapped[str] = mapped_column(String(32), default='running', index=True)
    message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    usd_krw_rate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    ticker_snapshots: Mapped[list['TickerSnapshot']] = relationship(back_populates='crawl_run', cascade='all, delete-orphan')
    withdrawal_fee_snapshots: Mapped[list['WithdrawalFeeSnapshot']] = relationship(back_populates='crawl_run', cascade='all, delete-orphan')
    network_status_snapshots: Mapped[list['NetworkStatusSnapshot']] = relationship(back_populates='crawl_run', cascade='all, delete-orphan')
    crawl_errors: Mapped[list['CrawlError']] = relationship(back_populates='crawl_run', cascade='all, delete-orphan')
    lightning_swap_fee_snapshots: Mapped[list['LightningSwapFeeSnapshot']] = relationship(back_populates='crawl_run', cascade='all, delete-orphan')
    exchange_notices: Mapped[list['ExchangeNotice']] = relationship(back_populates='crawl_run', cascade='all, delete-orphan')


class TickerSnapshot(Base):
    __tablename__ = 'ticker_snapshots'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    crawl_run_id: Mapped[int] = mapped_column(ForeignKey('crawl_runs.id', ondelete='CASCADE'), index=True)
    exchange: Mapped[str] = mapped_column(String(32), index=True)
    pair: Mapped[str] = mapped_column(String(32))
    market_type: Mapped[str] = mapped_column(String(32), default='spot')
    currency: Mapped[str] = mapped_column(String(16))
    price: Mapped[float] = mapped_column(Float)
    high_24h: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    low_24h: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    volume_24h_btc: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    maker_fee_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    taker_fee_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    maker_fee_usd: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    maker_fee_krw: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    taker_fee_usd: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    taker_fee_krw: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    usd_krw_rate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    crawl_run: Mapped['CrawlRun'] = relationship(back_populates='ticker_snapshots')


class WithdrawalFeeSnapshot(Base):
    __tablename__ = 'withdrawal_fee_snapshots'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    crawl_run_id: Mapped[int] = mapped_column(ForeignKey('crawl_runs.id', ondelete='CASCADE'), index=True)
    exchange: Mapped[str] = mapped_column(String(32), index=True)
    coin: Mapped[str] = mapped_column(String(16), index=True)
    source: Mapped[str] = mapped_column(String(32))
    network_label: Mapped[str] = mapped_column(String(128))
    fee: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    fee_usd: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    fee_krw: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    min_withdrawal: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    max_withdrawal: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    crawl_run: Mapped['CrawlRun'] = relationship(back_populates='withdrawal_fee_snapshots')


class NetworkStatusSnapshot(Base):
    __tablename__ = 'network_status_snapshots'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    crawl_run_id: Mapped[int] = mapped_column(ForeignKey('crawl_runs.id', ondelete='CASCADE'), index=True)
    exchange: Mapped[str] = mapped_column(String(32), index=True)
    coin: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    network: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default='ok')
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    detected_at: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    crawl_run: Mapped['CrawlRun'] = relationship(back_populates='network_status_snapshots')


class CrawlError(Base):
    __tablename__ = 'crawl_errors'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    crawl_run_id: Mapped[int] = mapped_column(ForeignKey('crawl_runs.id', ondelete='CASCADE'), index=True)
    exchange: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    coin: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    stage: Mapped[str] = mapped_column(String(64))
    error_message: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    crawl_run: Mapped['CrawlRun'] = relationship(back_populates='crawl_errors')


class LightningSwapFeeSnapshot(Base):
    __tablename__ = 'lightning_swap_fee_snapshots'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    crawl_run_id: Mapped[int] = mapped_column(ForeignKey('crawl_runs.id', ondelete='CASCADE'), index=True)
    service_name: Mapped[str] = mapped_column(String(64), index=True)
    fee_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    fee_fixed_sat: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    min_amount_sat: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    max_amount_sat: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    source_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    direction: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    crawl_run: Mapped['CrawlRun'] = relationship(back_populates='lightning_swap_fee_snapshots')


class AccessLog(Base):
    __tablename__ = 'access_logs'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    accessed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class ExchangeNotice(Base):
    __tablename__ = 'exchange_notices'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    crawl_run_id: Mapped[int] = mapped_column(ForeignKey('crawl_runs.id', ondelete='CASCADE'), index=True)
    exchange: Mapped[str] = mapped_column(String(32), index=True)
    title: Mapped[str] = mapped_column(Text)
    url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    noticed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    crawl_run: Mapped['CrawlRun'] = relationship(back_populates='exchange_notices')
