#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MODE="${1:-all}"
cd "$ROOT_DIR"

run_backend_lint() { ./.venv/bin/ruff check backend mcp_server.py fee_checker.py tests; }
run_backend_test() { ./.venv/bin/pytest -q; }
run_frontend_lint() { (cd "$ROOT_DIR/frontend" && npm run lint); }
run_frontend_test() { (cd "$ROOT_DIR/frontend" && npm run test); }
run_frontend_build() { (cd "$ROOT_DIR/frontend" && npm run build); }

case "$MODE" in
  lint)
    run_backend_lint
    run_frontend_lint
    ;;
  backend)
    run_backend_lint
    run_backend_test
    ;;
  frontend)
    run_frontend_lint
    run_frontend_test
    run_frontend_build
    ;;
  all)
    run_backend_lint
    run_backend_test
    run_frontend_lint
    run_frontend_test
    run_frontend_build
    ;;
  *)
    echo "unknown mode: $MODE" >&2
    exit 1
    ;;
esac
