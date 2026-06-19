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
echo "║  도메인: fee.onebitebitcoin.com"
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
    -e MANUAL_CRAWL_ENABLED="true" \
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
#   인그레스는 호스트 시스템 nginx(/etc/nginx)가 담당하며 127.0.0.1:18080 으로 프록시한다.
#   app 컨테이너만 교체 → 시스템 nginx 의 proxy_next_upstream 재시도로 무중단.
#   (이 레포에는 더 이상 docker nginx 서비스가 없다)
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

# 호스트 시스템 nginx reload (설정 변경 없이 업스트림 재확인용, 무중단)
#   설정 자체는 변하지 않으므로 reload 실패해도 배포는 계속한다.
echo "시스템 nginx reload..."
if sudo /usr/sbin/nginx -s reload > /dev/null 2>&1; then
    echo "✅ 시스템 nginx reload 완료 (무중단)"
else
    echo "⚠️  시스템 nginx reload 생략/실패 (인그레스 설정 불변 → 영향 없음)"
fi

# ============================================================
# [6/6] 최종 검증
# ============================================================
echo "[6/6] 최종 검증..."
sleep 3
$COMPOSE ps

# 공개 도메인(시스템 nginx → 127.0.0.1:18080) 경유 헬스체크
if curl -sf --max-time 8 "https://fee.onebitebitcoin.com/api/v1/health" > /tmp/fee-health-public.json 2>/dev/null; then
    echo "✅ 공개 도메인 정상: $(cat /tmp/fee-health-public.json)"
else
    echo "⚠️  공개 도메인 헬스체크 실패 — app 직접 확인:"
    curl -sf --max-time 5 "http://127.0.0.1:${APP_PORT}/api/v1/health" \
        && echo " (app 자체는 정상 → nginx/도메인 설정 확인 필요)" \
        || echo " (app 응답 없음)"
fi

echo ""
echo "✅ 배포 완료"
