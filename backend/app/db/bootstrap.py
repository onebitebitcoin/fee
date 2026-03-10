from backend.app.db.base import Base
from backend.app.db.session import engine
from backend.app.db import models  # noqa: F401


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
