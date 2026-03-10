"""initial schema"""

from alembic import op
import sqlalchemy as sa


revision = '0001_initial_schema'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'crawl_runs',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('trigger', sa.String(length=32), nullable=False),
        sa.Column('status', sa.String(length=32), nullable=False),
        sa.Column('message', sa.Text(), nullable=True),
        sa.Column('usd_krw_rate', sa.Float(), nullable=True),
        sa.Column('started_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_crawl_runs_status', 'crawl_runs', ['status'])
    op.create_table(
        'ticker_snapshots',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('crawl_run_id', sa.Integer(), sa.ForeignKey('crawl_runs.id', ondelete='CASCADE'), nullable=False),
        sa.Column('exchange', sa.String(length=32), nullable=False),
        sa.Column('pair', sa.String(length=32), nullable=False),
        sa.Column('market_type', sa.String(length=32), nullable=False),
        sa.Column('currency', sa.String(length=16), nullable=False),
        sa.Column('price', sa.Float(), nullable=False),
        sa.Column('high_24h', sa.Float(), nullable=True),
        sa.Column('low_24h', sa.Float(), nullable=True),
        sa.Column('volume_24h_btc', sa.Float(), nullable=True),
        sa.Column('maker_fee_pct', sa.Float(), nullable=True),
        sa.Column('taker_fee_pct', sa.Float(), nullable=True),
        sa.Column('maker_fee_usd', sa.Float(), nullable=True),
        sa.Column('maker_fee_krw', sa.Float(), nullable=True),
        sa.Column('taker_fee_usd', sa.Float(), nullable=True),
        sa.Column('taker_fee_krw', sa.Float(), nullable=True),
        sa.Column('usd_krw_rate', sa.Float(), nullable=True),
        sa.Column('recorded_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_ticker_snapshots_crawl_run_id', 'ticker_snapshots', ['crawl_run_id'])
    op.create_index('ix_ticker_snapshots_exchange', 'ticker_snapshots', ['exchange'])
    op.create_table(
        'withdrawal_fee_snapshots',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('crawl_run_id', sa.Integer(), sa.ForeignKey('crawl_runs.id', ondelete='CASCADE'), nullable=False),
        sa.Column('exchange', sa.String(length=32), nullable=False),
        sa.Column('coin', sa.String(length=16), nullable=False),
        sa.Column('source', sa.String(length=32), nullable=False),
        sa.Column('network_label', sa.String(length=128), nullable=False),
        sa.Column('fee', sa.Float(), nullable=True),
        sa.Column('fee_usd', sa.Float(), nullable=True),
        sa.Column('fee_krw', sa.Float(), nullable=True),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default=sa.text('1')),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('recorded_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_withdrawal_fee_snapshots_crawl_run_id', 'withdrawal_fee_snapshots', ['crawl_run_id'])
    op.create_index('ix_withdrawal_fee_snapshots_exchange', 'withdrawal_fee_snapshots', ['exchange'])
    op.create_index('ix_withdrawal_fee_snapshots_coin', 'withdrawal_fee_snapshots', ['coin'])
    op.create_table(
        'network_status_snapshots',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('crawl_run_id', sa.Integer(), sa.ForeignKey('crawl_runs.id', ondelete='CASCADE'), nullable=False),
        sa.Column('exchange', sa.String(length=32), nullable=False),
        sa.Column('coin', sa.String(length=16), nullable=True),
        sa.Column('network', sa.String(length=128), nullable=True),
        sa.Column('status', sa.String(length=32), nullable=False),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('source_url', sa.Text(), nullable=True),
        sa.Column('detected_at', sa.String(length=64), nullable=True),
        sa.Column('recorded_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_network_status_snapshots_crawl_run_id', 'network_status_snapshots', ['crawl_run_id'])
    op.create_index('ix_network_status_snapshots_exchange', 'network_status_snapshots', ['exchange'])
    op.create_table(
        'crawl_errors',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('crawl_run_id', sa.Integer(), sa.ForeignKey('crawl_runs.id', ondelete='CASCADE'), nullable=False),
        sa.Column('exchange', sa.String(length=32), nullable=True),
        sa.Column('coin', sa.String(length=16), nullable=True),
        sa.Column('stage', sa.String(length=64), nullable=False),
        sa.Column('error_message', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_crawl_errors_crawl_run_id', 'crawl_errors', ['crawl_run_id'])


def downgrade() -> None:
    op.drop_index('ix_crawl_errors_crawl_run_id', table_name='crawl_errors')
    op.drop_table('crawl_errors')
    op.drop_index('ix_network_status_snapshots_exchange', table_name='network_status_snapshots')
    op.drop_index('ix_network_status_snapshots_crawl_run_id', table_name='network_status_snapshots')
    op.drop_table('network_status_snapshots')
    op.drop_index('ix_withdrawal_fee_snapshots_coin', table_name='withdrawal_fee_snapshots')
    op.drop_index('ix_withdrawal_fee_snapshots_exchange', table_name='withdrawal_fee_snapshots')
    op.drop_index('ix_withdrawal_fee_snapshots_crawl_run_id', table_name='withdrawal_fee_snapshots')
    op.drop_table('withdrawal_fee_snapshots')
    op.drop_index('ix_ticker_snapshots_exchange', table_name='ticker_snapshots')
    op.drop_index('ix_ticker_snapshots_crawl_run_id', table_name='ticker_snapshots')
    op.drop_table('ticker_snapshots')
    op.drop_index('ix_crawl_runs_status', table_name='crawl_runs')
    op.drop_table('crawl_runs')
