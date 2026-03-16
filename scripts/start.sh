#!/bin/sh
set -e

export PYTHONPATH=/app

# alembic_version 테이블이 없으면 현재 상태를 head로 stamp (이미 테이블이 존재하는 경우)
python - <<'EOF'
import os
from sqlalchemy import create_engine, text

db_url = os.environ.get("DATABASE_URL", "sqlite:///./exchange_fee.db")
engine = create_engine(db_url)
with engine.connect() as conn:
    result = conn.execute(text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'alembic_version')"
        if "postgresql" in db_url else
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='alembic_version'"
    ))
    exists = result.scalar()
    if not exists:
        # 테이블은 있지만 alembic_version이 없는 경우 → stamp
        result2 = conn.execute(text(
            "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'crawl_runs')"
            if "postgresql" in db_url else
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='crawl_runs'"
        ))
        tables_exist = result2.scalar()
        if tables_exist:
            print("[start.sh] DB tables exist but no alembic_version → stamping head")
            import subprocess
            subprocess.run(["alembic", "-c", "backend/alembic.ini", "stamp", "head"], check=True)
        else:
            print("[start.sh] Fresh DB → will run full migration")
    else:
        print("[start.sh] alembic_version found → running upgrade head")
EOF

alembic -c backend/alembic.ini upgrade head

exec uvicorn backend.app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
