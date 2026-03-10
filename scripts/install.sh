#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

python3 -m venv .venv
./.venv/bin/pip install --upgrade pip
./.venv/bin/pip install -r backend/requirements.txt
if [ -f package.json ]; then
  npm install
fi
if [ -f frontend/package.json ]; then
  cd frontend
  npm install
fi
