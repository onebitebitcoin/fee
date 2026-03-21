from __future__ import annotations


from fastapi import APIRouter, Depends, HTTPException
from openai import OpenAI
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.app.core.config import get_settings
from backend.app.db import repositories
from backend.app.db.session import get_db

router = APIRouter()


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []


class ChatResponse(BaseModel):
    reply: str


def _build_system_prompt(db: Session) -> str:
    latest_run = repositories.get_latest_successful_run(db)

    lines = [
        "당신은 한국 암호화폐 거래소 수수료 비교 서비스의 AI 어시스턴트입니다.",
        "이 서비스는 한국 거래소에서 개인 비트코인 지갑으로 BTC를 이동할 때 최저 수수료 경로를 찾아줍니다.",
        "답변 규칙:",
        "- 수수료, 출금 수수료, 시세, 네트워크 상태 관련 질문은 아래 제공된 최신 DB 데이터를 최우선으로 사용하세요.",
        "- 거래소 정책, 규제, CARF/세금/법률, 일반 암호화폐 지식 등 DB에 없는 주제는 당신의 학습 지식을 활용해 답변하세요.",
        "- DB 데이터와 당신의 지식이 충돌하면 DB 데이터를 우선합니다.",
        "- 모든 답변은 한국어로 간결하게 작성하세요.",
        "",
    ]

    if latest_run is None:
        lines.append("현재 최신 데이터가 없습니다. 아직 크롤링이 실행되지 않았습니다.")
        return "\n".join(lines)

    # 티커 데이터
    ticker_rows = repositories.list_ticker_snapshots_for_run(db, latest_run.id)
    if ticker_rows:
        lines.append("## 최신 BTC 시세 및 거래 수수료")
        for r in ticker_rows:
            fee_info = ""
            if r.taker_fee_pct is not None:
                fee_info = f", taker수수료={r.taker_fee_pct}%"
            if r.maker_fee_pct is not None:
                fee_info += f", maker수수료={r.maker_fee_pct}%"
            lines.append(f"- {r.exchange} ({r.pair}): {r.price:,.0f} {r.currency}{fee_info}")
        lines.append("")

    # 출금 수수료 데이터
    withdrawal_rows = repositories.list_withdrawal_snapshots_for_run(db, latest_run.id)
    if withdrawal_rows:
        lines.append("## 최신 BTC 출금 수수료")
        for r in withdrawal_rows:
            fee_str = f"{r.fee} BTC" if r.fee is not None else "미제공"
            krw_str = f" (약 {r.fee_krw:,.0f}원)" if r.fee_krw else ""
            enabled_str = "" if r.enabled else " [출금중단]"
            lines.append(f"- {r.exchange} / {r.network_label}: {fee_str}{krw_str}{enabled_str}")
        lines.append("")

    # 네트워크 상태
    network_rows = repositories.list_network_status_for_run(db, latest_run.id)
    suspended = [r for r in network_rows if r.status != 'ok']
    if suspended:
        lines.append("## 출금 중단/지연 네트워크")
        for r in suspended:
            reason = f" - {r.reason}" if r.reason else ""
            lines.append(f"- {r.exchange} / {r.network or r.coin}: {r.status}{reason}")
        lines.append("")
    else:
        lines.append("## 네트워크 상태: 모든 네트워크 정상")
        lines.append("")

    # Lightning 스왑 수수료
    lightning_rows = repositories.list_lightning_swap_fees_for_run(db, latest_run.id)
    active_ln = [r for r in lightning_rows if r.enabled and not r.error_message]
    if active_ln:
        lines.append("## Lightning 스왑 서비스 수수료")
        for r in active_ln:
            fee_str = f"{r.fee_pct}%" if r.fee_pct else ""
            if r.fee_fixed_sat:
                fee_str += f" + {r.fee_fixed_sat} sat"
            lines.append(f"- {r.service_name}: {fee_str}")
        lines.append("")

    return "\n".join(lines)


@router.post("/message", response_model=ChatResponse)
def chat_message(body: ChatRequest, db: Session = Depends(get_db)) -> ChatResponse:
    settings = get_settings()
    if not settings.openai_api_key:
        raise HTTPException(status_code=503, detail="OpenAI API 키가 설정되지 않았습니다.")

    client = OpenAI(api_key=settings.openai_api_key)
    system_prompt = _build_system_prompt(db)

    messages = [{"role": "system", "content": system_prompt}]
    for msg in body.history:
        messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": body.message})

    response = client.chat.completions.create(
        model="gpt-5-mini",
        messages=messages,
        max_completion_tokens=4096,
    )

    reply = response.choices[0].message.content or ""
    return ChatResponse(reply=reply)
