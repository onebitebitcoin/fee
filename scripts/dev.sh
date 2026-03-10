#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-all}"
cd "$ROOT_DIR"

case "$TARGET" in
  backend)
    BACKEND_PORT="${BACKEND_PORT:-8000}"
    exec ./.venv/bin/uvicorn backend.app.main:app --reload --host 0.0.0.0 --port "$BACKEND_PORT"
    ;;
  worker)
    exec ./.venv/bin/python backend/worker.py serve
    ;;
  frontend)
    FRONTEND_PORT="${FRONTEND_PORT:-5173}"
    API_PROXY_TARGET="${API_PROXY_TARGET:-http://127.0.0.1:${BACKEND_PORT:-8000}}"
    cd frontend
    exec env FRONTEND_PORT="$FRONTEND_PORT" VITE_API_PROXY_TARGET="$API_PROXY_TARGET" npm run dev
    ;;
  all)
    echo "Run backend/worker/frontend in separate terminals:"
    echo "  bash scripts/dev.sh backend"
    echo "  bash scripts/dev.sh worker"
    echo "  bash scripts/dev.sh frontend"
    ;;
  *)
    echo "unknown target: $TARGET" >&2
    exit 1
    ;;
esac
