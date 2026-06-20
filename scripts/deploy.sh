#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE="sudo /usr/local/bin/fee-compose"
UPSTREAM_CONF="/etc/nginx/fee-upstream.conf"
BLUE_PORT=18080
GREEN_PORT=18081

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  fee 무중단 배포 (Blue-Green)            ║"
echo "╠══════════════════════════════════════════╣"
echo "║  경로: $ROOT_DIR"
echo "║  도메인: fee.onebitebitcoin.com"
echo "╚══════════════════════════════════════════╝"
echo ""

[ ! -f .env ] && echo "오류: .env 파일이 없습니다." && exit 1

# ============================================================
# [1/7] 현재 활성 슬롯 감지
# ============================================================
echo "[1/7] 현재 활성 슬롯 감지..."
if grep -q "${GREEN_PORT}" "${UPSTREAM_CONF}" 2>/dev/null; then
    ACTIVE_SLOT="green"
    ACTIVE_PORT="${GREEN_PORT}"
    INACTIVE_SLOT="blue"
    INACTIVE_PORT="${BLUE_PORT}"
else
    # 기본값: blue 활성(혹은 레거시 단일 app 운용 중) → green에 배포
    ACTIVE_SLOT="blue"
    ACTIVE_PORT="${BLUE_PORT}"
    INACTIVE_SLOT="green"
    INACTIVE_PORT="${GREEN_PORT}"
fi
echo "  현재 활성: ${ACTIVE_SLOT}(${ACTIVE_PORT})"
echo "  신규 배포: ${INACTIVE_SLOT}(${INACTIVE_PORT})"

# ============================================================
# [2/7] git 업데이트
# ============================================================
echo "[2/7] git 업데이트..."
git fetch origin main
git reset --hard origin/main

# ============================================================
# [3/7] 이미지 빌드 (비활성 슬롯 기준으로 빌드)
# ============================================================
echo "[3/7] 이미지 빌드..."
$COMPOSE build "app_${INACTIVE_SLOT}"

# ============================================================
# [4/7] 사전 테스트 (새 이미지, 현재 서비스 중단 없음)
# ============================================================
echo "[4/7] 사전 테스트 (새 이미지 검증)..."
TEST_PASS=0
$COMPOSE run --rm --no-deps \
    -e DATABASE_URL="sqlite://" \
    -e ENVIRONMENT="test" \
    -e ADMIN_API_KEY="0000" \
    -e CRAWL_INTERVAL_MINUTES="999" \
    -e MANUAL_CRAWL_ENABLED="true" \
    -e CORS_ORIGINS="*" \
    -e POSTGRES_PASSWORD="unused" \
    "app_${INACTIVE_SLOT}" \
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
# [5/7] DB 확인
# ============================================================
echo "[5/7] DB 확인..."
$COMPOSE up -d db
for i in $(seq 1 30); do
    if $COMPOSE exec -T db pg_isready -U exchange_fee > /dev/null 2>&1; then
        echo "  DB 정상"
        break
    fi
    [ "$i" -eq 30 ] && echo "오류: DB 응답 없음" && exit 1
    sleep 2
done

# ============================================================
# [6/7] 신규 슬롯 시작 → 헬스체크 → nginx 전환
# ============================================================
echo "[6/7] ${INACTIVE_SLOT}(${INACTIVE_PORT}) 슬롯 시작..."

# 비활성 슬롯에 잔여 컨테이너 있으면 제거
$COMPOSE stop "app_${INACTIVE_SLOT}" 2>/dev/null || true
$COMPOSE rm -f "app_${INACTIVE_SLOT}" 2>/dev/null || true

# 신규 슬롯 시작
$COMPOSE up -d --no-deps "app_${INACTIVE_SLOT}"

# 헬스체크 (최대 120초)
echo "  신규 슬롯 헬스체크 대기..."
APP_OK=0
for i in $(seq 1 60); do
    if curl -sf --max-time 3 "http://127.0.0.1:${INACTIVE_PORT}/api/v1/health" > /tmp/fee-health-new.json 2>/dev/null; then
        echo "  ✅ 신규 슬롯 정상: $(cat /tmp/fee-health-new.json)"
        APP_OK=1
        break
    fi
    sleep 2
done

if [ "$APP_OK" -eq 0 ]; then
    echo "❌ 신규 슬롯 헬스체크 실패 — 배포 중단 (기존 서비스 유지)"
    $COMPOSE logs "app_${INACTIVE_SLOT}" --tail=50
    $COMPOSE stop "app_${INACTIVE_SLOT}" 2>/dev/null || true
    exit 1
fi

# nginx upstream 전환 (무중단 — reload는 graceful)
echo "  nginx upstream 전환: ${ACTIVE_PORT} → ${INACTIVE_PORT}..."
sudo tee "${UPSTREAM_CONF}" > /dev/null <<EOF
upstream fee_app { server 127.0.0.1:${INACTIVE_PORT}; keepalive 32; }
EOF
sudo /usr/sbin/nginx -s reload
echo "  ✅ nginx upstream 전환 완료"

# ============================================================
# [7/7] 기존 슬롯 정리 및 최종 검증
# ============================================================
echo "[7/7] 기존 ${ACTIVE_SLOT} 슬롯 정리..."

# 레거시 단일 app 컨테이너 정리 (구 시스템 → 신 시스템 최초 마이그레이션 시)
LEGACY_CONTAINER="${COMPOSE_PROJECT_NAME:-fee}-app-1"
if docker ps -q --filter "name=^${LEGACY_CONTAINER}$" 2>/dev/null | grep -q .; then
    echo "  레거시 컨테이너(${LEGACY_CONTAINER}) 포트 해제..."
    docker stop "${LEGACY_CONTAINER}" 2>/dev/null || true
    docker rm "${LEGACY_CONTAINER}" 2>/dev/null || true
fi

# 기존 활성 슬롯 중지
$COMPOSE stop "app_${ACTIVE_SLOT}" 2>/dev/null || true

sleep 3
$COMPOSE ps

# 공개 도메인 최종 확인
if curl -sf --max-time 8 "https://fee.onebitebitcoin.com/api/v1/health" > /tmp/fee-health-public.json 2>/dev/null; then
    echo "✅ 공개 도메인 정상: $(cat /tmp/fee-health-public.json)"
else
    echo "⚠️  공개 도메인 헬스체크 실패 — app 직접 확인:"
    curl -sf --max-time 5 "http://127.0.0.1:${INACTIVE_PORT}/api/v1/health" \
        && echo "  (app 정상 → nginx/도메인 설정 확인 필요)" \
        || echo "  (app 응답 없음)"
fi

echo ""
echo "✅ 배포 완료 — 활성 슬롯: ${INACTIVE_SLOT}(${INACTIVE_PORT})"
