"""add_korea_withdrawal_limit_snapshots"""

from alembic import op
import sqlalchemy as sa

revision = '5174449ce07e'
down_revision = '37316ce8474b'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('korea_withdrawal_limit_snapshots',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('crawl_run_id', sa.Integer(), nullable=False),
    sa.Column('exchange', sa.String(length=32), nullable=False),
    sa.Column('krw_daily_verified_digital', sa.Integer(), nullable=True),
    sa.Column('btc_per_tx_max', sa.Float(), nullable=True),
    sa.Column('source', sa.String(length=32), nullable=False),
    sa.Column('recorded_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.ForeignKeyConstraint(['crawl_run_id'], ['crawl_runs.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_korea_withdrawal_limit_snapshots_crawl_run_id'), 'korea_withdrawal_limit_snapshots', ['crawl_run_id'], unique=False)
    op.create_index(op.f('ix_korea_withdrawal_limit_snapshots_exchange'), 'korea_withdrawal_limit_snapshots', ['exchange'], unique=False)
    op.create_index(op.f('ix_korea_withdrawal_limit_snapshots_recorded_at'), 'korea_withdrawal_limit_snapshots', ['recorded_at'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_korea_withdrawal_limit_snapshots_recorded_at'), table_name='korea_withdrawal_limit_snapshots')
    op.drop_index(op.f('ix_korea_withdrawal_limit_snapshots_exchange'), table_name='korea_withdrawal_limit_snapshots')
    op.drop_index(op.f('ix_korea_withdrawal_limit_snapshots_crawl_run_id'), table_name='korea_withdrawal_limit_snapshots')
    op.drop_table('korea_withdrawal_limit_snapshots')
