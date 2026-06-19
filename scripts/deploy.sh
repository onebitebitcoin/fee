#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE="sudo /usr/local/bin/fee-compose"
APP_PORT="$(grep -E '^APP_PORT=' .env 2>/dev/null | tail -1 | cut -d= -f2- || true)"
APP_PORT="${APP_PORT:-8000}"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  fee 무중단 배포                         ║"
echo "╠══════════════════════════════════════════╣"
echo "║  경로: $ROOT_DIR"
echo "║  앱포트: $APP_PORT"
echo "║  도메인: nav.onebitebitcoin.com"
echo "╚══════════════════════════════════════════╝"
echo ""

[ ! -f .env ] && echo "오류: .env 파일이 없습니다." && exit 1
[ ! -x /usr/local/bin/fee-compose ] && echo "오류: fee-compose wrapper 없음." && exit 1

# ============================================================
# [1/6] git 업데이트
# ============================================================
echo "[1/6] git 업데이트..."
git fetch origin main
git reset --hard origin/main

# ============================================================
# [2/6] 이미지 빌드
# ============================================================
echo "[2/6] 이미지 빌드..."
$COMPOSE build app

# ============================================================
# [3/6] 사전 테스트 (새 이미지, 현재 서비스 중단 없음)
#   - 새로 빌드된 이미지를 임시 컨테이너로 실행해 테스트
#   - SQLite 인메모리 DB 사용 (PostgreSQL 불필요)
#   - 테스트 실패 시 배포 중단 → 현재 서비스 유지
# ============================================================
echo "[3/6] 사전 테스트 (새 이미지 검증)..."
TEST_PASS=0
$COMPOSE run --rm --no-deps \
    -e DATABASE_URL="sqlite://" \
    -e ENVIRONMENT="test" \
    -e ADMIN_API_KEY="0000" \
    -e CRAWL_INTERVAL_MINUTES="999" \
    -e MANUAL_CRAWL_ENABLED="false" \
    -e CORS_ORIGINS="*" \
    -e POSTGRES_PASSWORD="unused" \
    app \
    python -m pytest tests/ \
        --ignore=tests/test_crawl_service.py \
        --ignore=tests/test_notice_scraper.py \
        -x -q --tb=short 2>&1 \
    && TEST_PASS=1 || TEST_PASS=0

if [ "$TEST_PASS" -eq 0 ]; then
    echo ""
    echo "❌ 사전 테스트 실패 — 배포 중단 (현재 서비스 계속 유지)"
    exit 1
fi
echo "✅ 사전 테스트 통과"

# ============================================================
# [4/6] DB 확인 (재시작 없이 상태만 확인)
# ============================================================
echo "[4/6] DB 확인..."
$COMPOSE up -d db
for i in $(seq 1 30); do
    if $COMPOSE exec -T db pg_isready -U exchange_fee > /dev/null 2>&1; then
        echo "DB 정상"
        break
    fi
    [ "$i" -eq 30 ] && echo "오류: DB 응답 없음" && exit 1
    sleep 2
done

# ============================================================
# [5/6] App 무중단 교체
#   핵심: nginx는 건드리지 않음 → 포트 80 충돌 없음
#   app만 교체 → nginx가 proxy_next_upstream으로 30초 재시도
#   → 사용자는 502 대신 잠깐 느린 응답을 경험 (또는 영향 없음)
# ============================================================
echo "[5/6] App 무중단 교체..."
$COMPOSE up -d --no-deps app

# 새 app 헬스체크 (최대 120초)
echo "새 app 헬스체크 대기..."
APP_OK=0
for i in $(seq 1 60); do
    if curl -sf --max-time 3 "http://127.0.0.1:${APP_PORT}/api/v1/health" > /tmp/fee-health.json 2>/dev/null; then
        echo "✅ 새 app 정상: $(cat /tmp/fee-health.json)"
        APP_OK=1
        break
    fi
    sleep 2
done

if [ "$APP_OK" -eq 0 ]; then
    echo "❌ 새 app 헬스체크 실패"
    $COMPOSE logs app --tail=100
    exit 1
fi

# nginx 처리:
#   실행 중 → reload (포트 재바인딩 없음 = 완전 무중단)
#   미실행  → 시작 (포트 80 점유 시 먼저 정리)
echo "nginx 처리..."
if $COMPOSE exec -T nginx nginx -s reload > /dev/null 2>&1; then
    echo "✅ nginx reload 완료 (포트 80 유지, 무중단)"
else
    echo "nginx 미실행 → 새로 시작..."
    # 포트 80을 점유 중인 외부 프로세스 정리
    if command -v ss > /dev/null 2>&1 && ss -tlnp 2>/dev/null | grep -q ':80 '; then
        echo "포트 80 점유 중 → 정리 시도"
        sudo fuser -k 80/tcp 2>/dev/null || true
        sleep 2
    fi
    $COMPOSE up -d --no-deps nginx
fi

# ============================================================
# [6/6] 최종 검증
# ============================================================
echo "[6/6] 최종 검증..."
sleep 3
$COMPOSE ps

if curl -sf --max-time 5 "http://127.0.0.1:80/api/v1/health" > /tmp/fee-nav-health.json 2>/dev/null; then
    echo "✅ nginx 프록시 정상: $(cat /tmp/fee-nav-health.json)"
else
    echo "⚠️  nginx 직접 헬스체크 실패 (외부 프록시 경유 시 정상일 수 있음)"
fi

echo ""
echo "✅ 배포 완료"
