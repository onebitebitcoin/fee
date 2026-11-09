"""my-news 가 내보낸 비트코인 주요 이슈 순위 파일을 읽는다.

my-news 는 같은 서버에서 뉴스 수집 파이프라인이 끝날 때마다 같은 사건 기사를 묶어 이름 붙인 `btc_issues.json` 을 쓰고,
운영 컨테이너는 그 폴더를 읽기 전용으로 마운트한다. 컨테이너에서 my-news 웹으로 가는 네트워크 경로가 없기 때문이다.
가장 최근에 수집된 기사(`latest_at`, 없으면 파일 생성 시각)가 `STALE_AFTER` 보다 오래되면 응답에 stale 을 붙여
화면이 '갱신 지연'을 알리게 한다. 파일 생성 시각만 보면 수집이 멈춰도 파일은 계속 새로 쓰일 수 있어 지연을 놓친다.
3시간은 정상 운영 중 수집 간격이 최대 1.9시간이었던 실측(2026-11-09, 최근 72시간)에 여유를 둔 값이다.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

STALE_AFTER = timedelta(hours=3)


class KeywordsUnavailable(RuntimeError):
    pass


def load_keywords(path: Path, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
    except FileNotFoundError as e:
        raise KeywordsUnavailable('주요 이슈 파일이 아직 없습니다') from e
    except (OSError, ValueError) as e:
        raise KeywordsUnavailable(f'주요 이슈 파일을 읽지 못했습니다: {e}') from e
    if not isinstance(data, dict) or not isinstance(data.get('rank'), list) or 'generated_at' not in data:
        raise KeywordsUnavailable('주요 이슈 파일 형식이 올바르지 않습니다')
    try:
        basis = _parse_utc(data.get('latest_at') or data['generated_at'])
    except ValueError as e:
        raise KeywordsUnavailable(f'주요 이슈 파일의 시각 형식이 올바르지 않습니다: {e}') from e
    return {**data, 'stale': now - basis > STALE_AFTER}


def _parse_utc(value: object) -> datetime:
    parsed = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
