"""add_access_logs"""

# ruff: noqa: E402
revision = '2370af02d9e6'
down_revision = '52fdd263d2f9'
branch_labels = None
depends_on = None

from alembic import op  # noqa: E402
import sqlalchemy as sa  # noqa: E402


def upgrade() -> None:
    op.create_table(
        'access_logs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('accessed_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_access_logs_accessed_at'), 'access_logs', ['accessed_at'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_access_logs_accessed_at'), table_name='access_logs')
    op.drop_table('access_logs')
