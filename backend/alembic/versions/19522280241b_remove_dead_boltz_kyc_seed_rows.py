"""remove dead boltz kyc seed rows

Boltz 스왑 service_name을 'Boltz'로 통일한 뒤, KYC 레지스트리에서
정규화 형태 'boltzsubmarine'/'boltzmutual'은 더 이상 도달하지 않는 죽은 키가 되었다
(kyc_registry._SERVICE_ALIASES / _STATIC_KYC에서도 제거됨).
seed 마이그레이션 f527d08979a4가 kyc_config 테이블에 넣어둔 두 죽은 행을 정리한다.
'boltz' 행은 정규 키이므로 그대로 유지한다.
"""

from alembic import op
import sqlalchemy as sa

revision = '19522280241b'
down_revision = 'f527d08979a4'
branch_labels = None
depends_on = None


_DEAD_KEYS = ['boltzsubmarine', 'boltzmutual']

# downgrade 시 원래 seed(f527d08979a4)와 동일하게 복원
_RESTORE_ROWS = [
    {'key': 'boltzsubmarine', 'is_kyc': False, 'note': '비수탁형 원자 스왑, KYC 없음'},
    {'key': 'boltzmutual', 'is_kyc': False, 'note': '비수탁형 원자 스왑, KYC 없음'},
]


def _kyc_table() -> sa.Table:
    return sa.table(
        'kyc_config',
        sa.column('key', sa.String),
        sa.column('is_kyc', sa.Boolean),
        sa.column('note', sa.Text),
    )


def upgrade() -> None:
    table = _kyc_table()
    op.execute(table.delete().where(table.c.key.in_(_DEAD_KEYS)))


def downgrade() -> None:
    op.bulk_insert(_kyc_table(), _RESTORE_ROWS)
