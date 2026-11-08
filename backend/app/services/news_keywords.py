"""my-news 가 내보낸 비트코인 주요 이슈 순위 파일을 읽는다.

my-news 는 같은 서버에서 10분마다 같은 사건 기사를 묶어 이름 붙인 `btc_issues.json` 을 쓰고, 운영 컨테이너는 그 폴더를
읽기 전용으로 마운트한다. 컨테이너에서 my-news 웹으로 가는 네트워크 경로가 없기 때문이다.
파일이 오래되면(`STALE_AFTER`) 응답에 stale 을 붙여 화면이 '갱신 지연'을 알리게 한다.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

STALE_AFTER = timedelta(hours=1)


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
    generated = datetime.fromisoformat(str(data['generated_at']).replace('Z', '+00:00'))
    return {**data, 'stale': now - generated > STALE_AFTER}
