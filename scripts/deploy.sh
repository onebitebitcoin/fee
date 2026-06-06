#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f .env ]; then
    echo "오류: .env 파일이 없습니다. .env.example 참고해 생성하세요."
    exit 1
fi

echo "=== 이미지 빌드 중 ==="
docker compose build --no-cache

echo "=== 컨테이너 시작 중 ==="
docker compose up -d

echo "=== 헬스체크 대기 중 ==="
APP_PORT=$(grep APP_PORT .env | cut -d= -f2 || echo 8000)
for i in $(seq 1 30); do
    if curl -sf "http://localhost:${APP_PORT:-8000}/api/v1/health" > /dev/null 2>&1; then
        echo "서비스 정상 시작!"
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "오류: 헬스체크 실패"
        docker compose logs app
        exit 1
    fi
    sleep 3
done

echo "=== 배포 완료 ==="
docker compose ps
