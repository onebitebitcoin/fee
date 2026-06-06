#!/usr/bin/env python3
"""Railway PostgreSQL → 로컬 PostgreSQL 일회성 데이터 백필 스크립트.

실행 조건:
  - RAILWAY_DATABASE_URL 환경변수 설정
  - 로컬 DB의 crawl_runs 테이블이 비어있음 (첫 배포 판단 기준)

두 조건 중 하나라도 아니면 자동 skip.
"""

import logging
import os
import sys

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine

logging.basicConfig(
    level=logging.INFO,
    format="[backfill] %(levelname)s %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger(__name__)

# FK 의존성 순서대로 정의 (부모 테이블이 먼저)
COPY_ORDER: list[str] = [
    "carf_exchange_info",              # 독립, String PK
    "admin_config",                    # 독립
    "access_logs",                     # 독립
    "crawl_runs",                      # 다른 스냅샷 테이블들의 부모
    "ticker_snapshots",
    "withdrawal_fee_snapshots",
    "network_status_snapshots",
    "crawl_errors",
    "lightning_swap_fee_snapshots",
    "exchange_capability_snapshots",
    "exchange_volume_snapshots",
    "korea_withdrawal_limit_snapshots",
    "exchange_notices",
]

# Integer 시퀀스 재설정이 불필요한 테이블 (String PK)
STRING_PK_TABLES: frozenset[str] = frozenset({"carf_exchange_info"})

BATCH_SIZE = 500


def _to_psycopg2_url(url: str) -> str:
    return (
        url
        .replace("postgres://", "postgresql+psycopg2://")
        .replace("postgresql://", "postgresql+psycopg2://")
    )


def is_fresh_db(dst_engine: Engine) -> bool:
    with dst_engine.connect() as conn:
        count = conn.execute(text("SELECT COUNT(*) FROM crawl_runs")).scalar()
    return count == 0


def get_common_columns(src_engine: Engine, dst_engine: Engine, table: str) -> list[str]:
    src_ordered = [col["name"] for col in inspect(src_engine).get_columns(table)]
    dst_names = {col["name"] for col in inspect(dst_engine).get_columns(table)}
    return [c for c in src_ordered if c in dst_names]


def copy_table(src_engine: Engine, dst_engine: Engine, table: str) -> int:
    cols = get_common_columns(src_engine, dst_engine, table)
    if not cols:
        log.warning(f"  {table}: 공통 컬럼 없음 → skip")
        return 0

    col_str = ", ".join(f'"{c}"' for c in cols)
    placeholders = ", ".join(f":{c}" for c in cols)
    insert_sql = text(
        f'INSERT INTO "{table}" ({col_str}) VALUES ({placeholders}) ON CONFLICT DO NOTHING'
    )

    total = 0
    offset = 0

    with src_engine.connect() as src_conn:
        while True:
            rows = src_conn.execute(
                text(f'SELECT {col_str} FROM "{table}" ORDER BY 1 OFFSET :o LIMIT :l'),
                {"o": offset, "l": BATCH_SIZE},
            ).fetchall()
            if not rows:
                break

            params = [dict(zip(cols, row)) for row in rows]
            with dst_engine.begin() as dst_conn:
                dst_conn.execute(insert_sql, params)

            total += len(rows)
            offset += len(rows)
            log.info(f"  {table}: {total}행 복사 중...")

            if len(rows) < BATCH_SIZE:
                break

    return total


def reset_sequence(dst_engine: Engine, table: str) -> None:
    """Integer PK 테이블의 시퀀스를 MAX(id)에 맞게 재설정."""
    with dst_engine.begin() as conn:
        try:
            conn.execute(text(
                f"SELECT setval("
                f"  pg_get_serial_sequence('{table}', 'id'),"
                f"  GREATEST((SELECT COALESCE(MAX(id), 0) FROM \"{table}\"), 1)"
                f")"
            ))
        except Exception as exc:
            log.debug(f"  {table} 시퀀스 재설정 실패 (무시): {exc}")


def main() -> None:
    src_raw = os.environ.get("RAILWAY_DATABASE_URL", "")
    dst_raw = os.environ.get("DATABASE_URL", "")

    if not src_raw:
        log.info("RAILWAY_DATABASE_URL 미설정 → backfill skip")
        return

    if "postgresql" not in dst_raw and "postgres" not in dst_raw:
        log.warning("DATABASE_URL이 PostgreSQL이 아님 → backfill skip")
        return

    dst_engine = create_engine(_to_psycopg2_url(dst_raw))

    try:
        if not is_fresh_db(dst_engine):
            log.info("crawl_runs 데이터 존재 → 이미 배포된 환경 → backfill skip")
            dst_engine.dispose()
            return
    except Exception as exc:
        log.error(f"대상 DB 확인 실패: {exc}")
        dst_engine.dispose()
        sys.exit(1)

    log.info("첫 배포 감지 → Railway DB에서 로컬 DB로 백필 시작")

    src_engine = create_engine(
        _to_psycopg2_url(src_raw),
        connect_args={"connect_timeout": 30, "sslmode": "require"},
    )

    try:
        src_tables = set(inspect(src_engine).get_table_names())
        dst_tables = set(inspect(dst_engine).get_table_names())

        for table in COPY_ORDER:
            if table not in src_tables:
                log.info(f"  {table}: source에 없음 → skip")
                continue
            if table not in dst_tables:
                log.info(f"  {table}: target에 없음 → skip")
                continue

            count = copy_table(src_engine, dst_engine, table)
            log.info(f"  {table}: {count}행 완료")

            if table not in STRING_PK_TABLES and count > 0:
                reset_sequence(dst_engine, table)

        log.info("백필 완료")

    except Exception as exc:
        log.error(f"백필 실패: {exc}")
        sys.exit(1)
    finally:
        src_engine.dispose()
        dst_engine.dispose()


if __name__ == "__main__":
    main()
