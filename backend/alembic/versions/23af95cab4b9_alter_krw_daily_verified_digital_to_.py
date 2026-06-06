"""alter_krw_daily_verified_digital_to_biginteger"""

from alembic import op
import sqlalchemy as sa

revision = '23af95cab4b9'
down_revision = '5174449ce07e'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('korea_withdrawal_limit_snapshots') as batch_op:
        batch_op.alter_column(
            'krw_daily_verified_digital',
            existing_type=sa.INTEGER(),
            type_=sa.BigInteger(),
            existing_nullable=True,
        )


def downgrade() -> None:
    with op.batch_alter_table('korea_withdrawal_limit_snapshots') as batch_op:
        batch_op.alter_column(
            'krw_daily_verified_digital',
            existing_type=sa.BigInteger(),
            type_=sa.INTEGER(),
            existing_nullable=True,
        )
