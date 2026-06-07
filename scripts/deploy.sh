#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE="sudo /usr/local/bin/fee-compose"
APP_PORT="$(grep -E '^APP_PORT=' .env 2>/dev/null | tail -1 | cut -d= -f2- || true)"
APP_PORT="${APP_PORT:-8000}"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  fee Docker 배포                         ║"
echo "╠══════════════════════════════════════════╣"
echo "║  경로: $ROOT_DIR"
echo "║  포트: $APP_PORT"
echo "║  도메인: nav.onebitebitcoin.com"
echo "╚══════════════════════════════════════════╝"
echo ""

if [ ! -f .env ]; then
    echo "오류: .env 파일이 없습니다. .env.example 참고해 생성하세요."
    exit 1
fi

if [ ! -x /usr/local/bin/fee-compose ]; then
    echo "오류: /usr/local/bin/fee-compose wrapper가 없습니다."
    exit 1
fi

echo "[1/5] git 업데이트..."
git fetch origin main
git reset --hard origin/main

echo "[2/5] 이미지 빌드..."
$COMPOSE build app

echo "[3/5] 컨테이너 시작(db/app only)..."
$COMPOSE up -d db app

echo "[4/5] 헬스체크 대기..."
for i in $(seq 1 60); do
    if curl -sf "http://127.0.0.1:${APP_PORT}/api/v1/health" > /tmp/fee-health.json 2>/dev/null; then
        echo "서비스 정상 시작: $(cat /tmp/fee-health.json)"
        break
    fi
    if [ "$i" -eq 60 ]; then
        echo "오류: 헬스체크 실패"
        $COMPOSE logs app | tail -200
        exit 1
    fi
    sleep 2
done

echo "[5/5] 상태 확인..."
$COMPOSE ps
curl -skf --resolve nav.onebitebitcoin.com:443:127.0.0.1 \
    https://nav.onebitebitcoin.com/api/v1/health > /tmp/fee-nav-health.json

echo "nav HTTPS(origin) 정상: $(cat /tmp/fee-nav-health.json)"
echo "✅ 배포 완료"
