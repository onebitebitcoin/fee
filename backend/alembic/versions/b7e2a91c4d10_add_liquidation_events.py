"""add liquidation events"""

from alembic import op
import sqlalchemy as sa

revision = 'b7e2a91c4d10'
down_revision = '741332710e93'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'liquidation_events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('event_key', sa.String(length=96), nullable=False),
        sa.Column('exchange', sa.String(length=16), nullable=False),
        sa.Column('side', sa.String(length=8), nullable=False),
        sa.Column('usd', sa.Float(), nullable=False),
        sa.Column('occurred_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('event_key'),
    )
    op.create_index(op.f('ix_liquidation_events_occurred_at'), 'liquidation_events', ['occurred_at'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_liquidation_events_occurred_at'), table_name='liquidation_events')
    op.drop_table('liquidation_events')
