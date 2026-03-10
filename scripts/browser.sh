#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -x "$ROOT_DIR/node_modules/.bin/agent-browser" ]; then
  echo "agent-browser is not installed. Run 'npm install' and 'npm run browser:install' first." >&2
  exit 1
fi

if [ "$#" -eq 0 ]; then
  set -- open "${AGENT_BROWSER_DEFAULT_URL:-http://127.0.0.1:5173}"
elif [ "$1" = "open" ] && [ "$#" -eq 1 ]; then
  set -- open "${AGENT_BROWSER_DEFAULT_URL:-http://127.0.0.1:5173}"
fi

exec "$ROOT_DIR/node_modules/.bin/agent-browser" --config "$ROOT_DIR/agent-browser.json" "$@"
