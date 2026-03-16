import logging

logger = logging.getLogger(__name__)


def init_db() -> None:
    """DB 초기화. Alembic 마이그레이션은 배포 시 별도 실행."""
    logger.info('DB session initialized (schema managed by Alembic)')
