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

# 단일 워커 유지(--workers 미지정): 경로 계산 캐시(_cheapest_path_cache)와 single-flight,
# kimp 폴링이 모두 프로세스-로컬 인메모리 상태이므로 멀티 워커는 캐시를 워커별로 쪼개
# stampede를 워커마다 유발한다. 수십 명 동시 접속 규모에서는 단일 워커 + 강한 캐시가 최적.
# (멀티 워커 전환이 필요해지면 Redis 등 공유 캐시 도입이 선행되어야 한다.)
exec uvicorn backend.app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
