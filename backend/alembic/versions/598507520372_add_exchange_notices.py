"""add_exchange_notices"""

from alembic import op
import sqlalchemy as sa

revision = '598507520372'
down_revision = '2370af02d9e6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'exchange_notices',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('crawl_run_id', sa.Integer(), nullable=False),
        sa.Column('exchange', sa.String(length=32), nullable=False),
        sa.Column('title', sa.Text(), nullable=False),
        sa.Column('url', sa.Text(), nullable=True),
        sa.Column('published_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('noticed_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['crawl_run_id'], ['crawl_runs.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_exchange_notices_crawl_run_id'), 'exchange_notices', ['crawl_run_id'], unique=False)
    op.create_index(op.f('ix_exchange_notices_exchange'), 'exchange_notices', ['exchange'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_exchange_notices_exchange'), table_name='exchange_notices')
    op.drop_index(op.f('ix_exchange_notices_crawl_run_id'), table_name='exchange_notices')
    op.drop_table('exchange_notices')
