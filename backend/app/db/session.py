from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from backend.app.core.config import get_settings


settings = get_settings()
if settings.database_url.startswith('postgresql'):
    engine = create_engine(
        settings.database_url,
        pool_size=5,
        max_overflow=10,
        pool_timeout=30,
        pool_recycle=1800,
        pool_pre_ping=True,
    )
else:
    engine = create_engine(settings.database_url, connect_args={'check_same_thread': False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False, class_=Session)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
