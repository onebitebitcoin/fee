#!/bin/sh
set -e

export PYTHONPATH=/app

python - <<'EOF'
import os, subprocess
from sqlalchemy import create_engine, text, inspect

db_url = os.environ.get("DATABASE_URL", "sqlite:///./exchange_fee.db")
engine = create_engine(db_url)

def table_exists(conn, name):
    if "postgresql" in db_url:
        r = conn.execute(text(
            "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = :n)"
        ), {"n": name})
    else:
        r = conn.execute(text(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=:n"
        ), {"n": name})
    return bool(r.scalar())

def column_exists(conn, table, column):
    if "postgresql" in db_url:
        r = conn.execute(text(
            "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=:t AND column_name=:c)"
        ), {"t": table, "c": column})
    else:
        r = conn.execute(text(f"PRAGMA table_info({table})"))
        cols = [row[1] for row in r.fetchall()]
        return column in cols
    return bool(r.scalar())

with engine.connect() as conn:
    if not table_exists(conn, "crawl_runs"):
        print("[start.sh] Fresh DB → full migration")
    elif not table_exists(conn, "alembic_version"):
        print("[start.sh] No alembic_version → stamp 598507520372")
        subprocess.run(["alembic", "-c", "backend/alembic.ini", "stamp", "598507520372"], check=True)
    elif not column_exists(conn, "lightning_swap_fee_snapshots", "direction"):
        # alembic_version이 있지만 실제 컬럼이 없음 → 잘못 stamp된 경우
        print("[start.sh] direction column missing → re-stamp 598507520372")
        subprocess.run(["alembic", "-c", "backend/alembic.ini", "stamp", "598507520372"], check=True)
    else:
        print("[start.sh] DB up to date → running upgrade head")
EOF

alembic -c backend/alembic.ini upgrade head

exec uvicorn backend.app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
