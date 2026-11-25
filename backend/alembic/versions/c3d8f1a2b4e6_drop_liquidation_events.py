"""drop liquidation events

첫 화면 청산 규모를 선물 시장 신호(펀딩비·미결제약정)로 바꾸면서 청산 수집을 그만둔다.
"""

from alembic import op
import sqlalchemy as sa

revision = 'c3d8f1a2b4e6'
down_revision = 'b7e2a91c4d10'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index(op.f('ix_liquidation_events_occurred_at'), table_name='liquidation_events')
    op.drop_table('liquidation_events')


def downgrade() -> None:
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
