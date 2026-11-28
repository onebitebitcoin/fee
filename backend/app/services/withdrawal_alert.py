"""직전 성공 크롤과 비교해 출금이 막히거나 풀린 망을 텔레그램으로 알린다."""
from __future__ import annotations

import json
import logging
from urllib.request import Request, urlopen

from sqlalchemy.orm import Session

from backend.app.core.config import get_settings
from backend.app.db import repositories

logger = logging.getLogger(__name__)

TIMEOUT_SECONDS = 10


def notify_withdrawal_changes(db: Session, crawl_run_id: int) -> None:
    settings = get_settings()
    if not settings.telegram_bot_token or not settings.telegram_chat_id:
        return
    prev_run_id = repositories.get_prev_success_run_id(db, crawl_run_id)
    if prev_run_id is None:
        return
    suspended, resumed = _changes(
        repositories.list_withdrawal_snapshots_for_run(db, prev_run_id),
        repositories.list_withdrawal_snapshots_for_run(db, crawl_run_id),
    )
    if suspended or resumed:
        _send(settings.telegram_bot_token, settings.telegram_chat_id, _message(suspended, resumed))


def _changes(prev_rows: list, new_rows: list) -> tuple[list, list]:
    """두 크롤에 모두 있는 망만 비교한다. 수집이 실패해 빠진 망은 상태를 알 수 없으므로 건너뛴다."""
    prev_enabled = {(r.exchange, r.coin, r.network_label): r.enabled for r in prev_rows}
    suspended, resumed = [], []
    for row in new_rows:
        before = prev_enabled.get((row.exchange, row.coin, row.network_label))
        if before is True and not row.enabled:
            suspended.append(row)
        elif before is False and row.enabled:
            resumed.append(row)
    return suspended, resumed


def _line(row, with_reason: bool) -> str:
    reason = f' ({row.suspension_reason})' if with_reason and row.suspension_reason else ''
    return f'• {row.exchange} {row.coin} {row.network_label}{reason}'


def _message(suspended: list, resumed: list) -> str:
    lines = ['[출금 상태 변경]']
    if suspended:
        lines += [f'중단 {len(suspended)}건', *(_line(r, True) for r in suspended)]
    if resumed:
        lines += [f'재개 {len(resumed)}건', *(_line(r, False) for r in resumed)]
    return '\n'.join(lines)


def _send(token: str, chat_id: str, text: str) -> None:
    request = Request(
        f'https://api.telegram.org/bot{token}/sendMessage',
        data=json.dumps({'chat_id': chat_id, 'text': text}).encode(),
        headers={'Content-Type': 'application/json'},
    )
    try:
        with urlopen(request, timeout=TIMEOUT_SECONDS):
            pass
    except OSError as exc:
        # URLError·타임아웃 모두 OSError다. URL에 봇 토큰이 들어 있으므로 예외 종류와 상태 코드만 남긴다
        logger.error('출금 상태 알림 실패: %s %s', type(exc).__name__, getattr(exc, 'code', ''))
