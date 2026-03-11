# TEST.md

## Backend API / MCP 회귀 기준
- `/health` returns 200 and `{status: "ok"}`
- `/api/v1/market/*` existing response structures remain compatible
- `/api/v1/crawl-runs` list/create behavior remains compatible
- `mcp_server.py` exported MCP tools keep current names and return shapes
- `fee_checker.py` exported functions/constants used by tests remain import-compatible

## Frontend 회귀 기준
- `/` overview page renders metrics and manual crawl action states
- `/cheapest-path` renders best path, table, and sorting behavior
- existing routes keep rendering without URL changes
- loading / error / success UI behavior remains intact

## Build / Quality 기준
- `./.venv/bin/pytest -q` PASS
- `cd frontend && npm run lint` PASS
- `cd frontend && npm run test` PASS
- `cd frontend && npm run build` PASS
