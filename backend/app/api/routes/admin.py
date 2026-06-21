"""Admin API — 게이트맨 레지스트리 관리 + 공지사항 조회."""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from backend.app.db.carf_seed import seed_carf_exchanges
from backend.app.db.models import AdminConfig, ExchangeNotice
from backend.app.db.session import get_db
from backend.app.services.crawl_service import CrawlService

logger = logging.getLogger(__name__)


def _iso_utc(dt: datetime | None) -> str | None:
    """naive datetime을 UTC ISO 문자열로 반환 (timezone 정보 보장)."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()

ADMIN_PASSWORD = '0000'
REGISTRY_KEY = 'gateman_registry'

router = APIRouter()

# ── default registry (mirrors frontend gatemanRegistry.ts) ────────────────────

DEFAULT_REGISTRY: dict = {
    'domestic': {
        'upbit': [
            {'label': '출금 주소 사전 등록 필수', 'desc': 'My Wallet에 출금 주소를 미리 등록해야 합니다.', 'level': 'required', 'condition': None},
            {'label': '본인 명의 지갑만 허용', 'desc': '타인 명의 거래소 주소 또는 서비스 주소로 출금이 불가합니다.', 'level': 'required', 'condition': None},
            {'label': '출금 주소 심사 1~3일 소요', 'desc': '1:1 문의를 통한 출금 주소 등록 심사에 10시간~3일이 소요될 수 있습니다. 미신고 거래소 주소는 등록 불가합니다.', 'level': 'conditional', 'condition': '신규 주소 등록 시'},
            {'label': '원화 입금 후 출금 지연', 'desc': '첫 원화 입금 시 72시간, 이후 각 입금마다 24시간 동안 해당 금액 상당의 가상자산 출금이 제한됩니다.', 'level': 'conditional', 'condition': '원화 입금 시'},
            {'label': '고액 출금 시 자금 출처 증명', 'desc': '일정 금액 이상 출금 시 자금 출처 서류 제출이 요구될 수 있습니다.', 'level': 'conditional', 'condition': '대규모 출금 시'},
        ],
        'bithumb': [
            {'label': '출금 주소 사전 등록 필수', 'desc': '출금 주소를 주소록에 미리 등록해야 합니다.', 'level': 'required', 'condition': None},
            {'label': 'KYC 실명 인증 필수', 'desc': '본인 인증이 완료된 계정에서만 출금 가능합니다.', 'level': 'required', 'condition': None},
            {'label': '트래블룰', 'desc': '100만원 이상 출금 시 수신 지갑 소유자 정보를 입력해야 합니다. 2025년 4월부터 100만원 미만도 주소 등록 필요.', 'level': 'conditional', 'condition': '100만원 이상 출금 시'},
            {'label': '고액 출금 자금 출처 증명', 'desc': '고액 출금 시 자금 출처 서류 제출이 요구될 수 있습니다.', 'level': 'conditional', 'condition': '고액 출금 시'},
        ],
        'korbit': [
            {'label': '출금 주소 사전 등록 필수', 'desc': '출금 주소를 미리 등록해야 합니다.', 'level': 'required', 'condition': None},
            {'label': 'KYC 실명 인증 필수', 'desc': '본인 인증 완료 필요합니다.', 'level': 'required', 'condition': None},
            {'label': '원화 입금 후 출금 지연', 'desc': '신규 고객은 첫 원화 입금 후 72시간, 기존 고객은 각 원화 입금 후 24시간 해당 금액 상당의 가상자산 출금이 제한됩니다.', 'level': 'conditional', 'condition': '원화 입금 시'},
            {'label': '트래블룰', 'desc': '100만원 이상 출금 시 수신자 정보 제출이 필요합니다.', 'level': 'conditional', 'condition': '100만원 이상 출금 시'},
        ],
        'coinone': [
            {'label': '출금 주소 사전 등록 필수', 'desc': '안심 주소록에 출금 주소를 등록해야 합니다.', 'level': 'required', 'condition': None},
            {'label': '원화 입금 후 72시간 출금 지연', 'desc': '원화 입금 후 72시간 동안 해당 금액 상당의 가상자산 출금이 제한됩니다. 2025년 5월부터 24시간 지연제도 병행 적용됩니다.', 'level': 'conditional', 'condition': '원화 입금 시'},
            {'label': '자금 출처 증명', 'desc': '고액 출금 시 자금 출처 서류 제출이 필요합니다.', 'level': 'conditional', 'condition': '고액 출금 시'},
        ],
        'gopax': [
            {'label': '출금 주소 사전 등록 필수', 'desc': '출금 주소를 미리 등록해야 합니다. 관리자 증빙 심사 후 승인됩니다.', 'level': 'required', 'condition': None},
            {'label': 'KYC 실명 인증 필수', 'desc': '본인 인증이 완료된 계정에서만 출금 가능합니다.', 'level': 'required', 'condition': None},
            {'label': '트래블룰', 'desc': '100만원 이상 출금 시 수신자 정보 입력이 필요합니다.', 'level': 'conditional', 'condition': '100만원 이상 출금 시'},
        ],
    },
    'global': {
        'binance': [
            {'label': 'KYC 인증 (Level 1 이상)', 'desc': '신분증 인증이 완료되어야 입출금이 가능합니다. 미인증 시 출금 불가.', 'level': 'required', 'condition': None},
            {'label': '일일 출금 한도', 'desc': 'KYC Level 1 (Basic): $1,000,000/day, Level 2 (Advanced): $2,000,000/day, 미인증: 출금 불가', 'level': 'info', 'condition': None},
            {'label': '트래블룰', 'desc': '한국 이용자의 경우 특정 거래소로 출금 시 수신자 정보 입력이 필요합니다.', 'level': 'conditional', 'condition': '한국 KYC 완료 사용자'},
        ],
        'okx': [
            {'label': 'KYC 인증 필수', 'desc': '개인 신원 인증 완료 필요합니다.', 'level': 'required', 'condition': None},
            {'label': '일일 출금 한도', 'desc': 'KYC1(기본 인증): $5,000/day, KYC2(고급·얼굴인식 추가): $10,000,000/day', 'level': 'info', 'condition': None},
            {'label': '신규 주소 24시간 지연', 'desc': '새로 등록한 주소는 24시간 후 출금이 가능합니다.', 'level': 'conditional', 'condition': '신규 주소 등록 시'},
        ],
        'bybit': [
            {'label': 'KYC 인증 필수', 'desc': '거주 국가 및 신분 인증 필요합니다.', 'level': 'required', 'condition': None},
            {'label': '신규 주소 24시간 지연', 'desc': '새로 등록한 주소는 24시간 후 사용 가능합니다.', 'level': 'conditional', 'condition': '신규 주소 등록 시'},
            {'label': '일일 출금 한도', 'desc': 'Level 1 (Standard): $1,000,000/day, Level 2 (Advanced): $2,000,000/day', 'level': 'info', 'condition': None},
        ],
        'bitget': [
            {'label': 'KYC 인증 필수', 'desc': '신분증 인증이 필요합니다.', 'level': 'required', 'condition': None},
            {'label': '일일 출금 한도', 'desc': '미인증: $20,000/day, KYC 완료(VIP0): $3,000,000/day, 고급 VIP: 최대 $15,000,000/day', 'level': 'info', 'condition': None},
            {'label': '신규 주소 24시간 지연', 'desc': '새로 추가한 주소는 24시간 후 출금 가능합니다.', 'level': 'conditional', 'condition': '신규 주소 등록 시'},
        ],
        'kraken': [
            {'label': 'KYC 인증 필수 (Intermediate 이상)', 'desc': '주소 및 신분 증명 완료 필요합니다.', 'level': 'required', 'condition': None},
            {'label': '일일 출금 한도', 'desc': 'Intermediate: $500,000/day, Pro: 무제한', 'level': 'info', 'condition': None},
        ],
        'coinbase': [
            {'label': 'KYC 인증 필수', 'desc': '신분 인증 및 거주지 인증 완료 필요합니다.', 'level': 'required', 'condition': None},
            {'label': '한국 법정화폐 서비스 미제공', 'desc': 'Coinbase는 한국 거주자에게 법정화폐 입출금 서비스를 제공하지 않습니다. 크립토 간 거래는 제한적으로 가능합니다.', 'level': 'required', 'condition': None},
            {'label': '일일 출금 한도', 'desc': '계정 등급에 따라 한도 상이', 'level': 'info', 'condition': None},
        ],
        'gate': [
            {'label': 'KYC 인증 필수', 'desc': '신분증 인증이 필요합니다. KYC 미완료 시 출금 불가.', 'level': 'required', 'condition': None},
            {'label': '트래블룰 지원 (VerifyVASP·CODE)', 'desc': 'Gate.io는 VerifyVASP 및 CODE 트래블룰 솔루션을 지원합니다. 국내 거래소와의 이전이 가능합니다.', 'level': 'info', 'condition': None},
            {'label': '신규 주소 24시간 지연', 'desc': '새로 추가한 출금 주소는 24시간 후 사용 가능합니다.', 'level': 'conditional', 'condition': '신규 주소 등록 시'},
            {'label': '일일 출금 한도', 'desc': 'KYC Lv1: $2,000,000/day, Lv2: $5,000,000/day', 'level': 'info', 'condition': None},
        ],
    },
    'onchain': [
        {'label': '주소 오입력 시 복구 불가', 'desc': 'Bitcoin 블록체인 트랜잭션은 한번 전송되면 취소하거나 되돌릴 수 없습니다. 반드시 주소를 확인하세요.', 'level': 'required', 'condition': None},
        {'label': '네트워크 수수료(Network Fee) 발생', 'desc': '네트워크 혼잡도에 따라 네트워크 수수료가 변동됩니다. 혼잡 시 수수료가 높아질 수 있습니다.', 'level': 'info', 'condition': None},
        {'label': '입금 확인 시간 소요', 'desc': '1 블록 확인에 약 10분, 거래소 입금 반영까지 1~6 블록(10분~1시간) 소요됩니다.', 'level': 'info', 'condition': None},
    ],
}


# ── helpers ───────────────────────────────────────────────────────────────────

def _check_password(x_admin_password: str = Header(..., alias='X-Admin-Password')) -> None:
    if x_admin_password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail='관리자 비밀번호가 틀렸습니다')


def _get_or_create_registry(db: Session) -> AdminConfig:
    row = db.query(AdminConfig).filter(AdminConfig.key == REGISTRY_KEY).first()
    if row is None:
        row = AdminConfig(
            key=REGISTRY_KEY,
            value_json=json.dumps(DEFAULT_REGISTRY, ensure_ascii=False),
            updated_source='default',
        )
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.get('/registry')
def get_registry(db: Session = Depends(get_db)) -> dict:
    """게이트맨 레지스트리 조회 (공개)."""
    row = _get_or_create_registry(db)
    return {
        'data': json.loads(row.value_json),
        'updated_at': _iso_utc(row.updated_at),
        'updated_source': row.updated_source,
    }


@router.put('/registry')
def update_registry(
    body: dict,
    db: Session = Depends(get_db),
    _: None = Depends(_check_password),
) -> dict:
    """게이트맨 레지스트리 업데이트 (관리자 전용)."""
    row = _get_or_create_registry(db)
    row.value_json = json.dumps(body, ensure_ascii=False)
    row.updated_at = datetime.now(timezone.utc)
    row.updated_source = 'manual'
    db.commit()
    return {'ok': True, 'updated_at': _iso_utc(row.updated_at)}


@router.post('/registry/refresh')
def refresh_registry(
    db: Session = Depends(get_db),
    _: None = Depends(_check_password),
) -> dict:
    """크롤링 실행 후 레지스트리를 기본값으로 초기화."""
    try:
        run = CrawlService(db).run_full_crawl(trigger='admin_refresh')
    except Exception as exc:
        logger.error('Admin refresh crawl failed: %s', exc)
        raise HTTPException(status_code=500, detail=f'크롤링 실패: {exc}') from exc

    row = _get_or_create_registry(db)
    row.value_json = json.dumps(DEFAULT_REGISTRY, ensure_ascii=False)
    row.updated_at = datetime.now(timezone.utc)
    row.updated_source = 'crawl'
    db.commit()

    return {
        'ok': True,
        'crawl_id': run.id,
        'crawl_status': run.status,
        'updated_at': _iso_utc(row.updated_at),
    }


@router.post('/carf/seed')
def reseed_carf(
    _: None = Depends(_check_password),
) -> dict:
    """CARF 거래소 정보 시드 재실행 (관리자 전용)."""
    try:
        seed_carf_exchanges()
    except Exception as exc:
        logger.error('CARF seed failed: %s', exc)
        raise HTTPException(status_code=500, detail=f'시드 실패: {exc}') from exc
    return {'ok': True}


@router.get('/notices')
def get_notices(limit: int = 50, db: Session = Depends(get_db)) -> dict:
    """최신 공지사항 조회 (관리자 전용)."""
    rows = (
        db.query(ExchangeNotice)
        .order_by(ExchangeNotice.noticed_at.desc())
        .limit(min(limit, 200))
        .all()
    )
    return {
        'items': [
            {
                'id': r.id,
                'exchange': r.exchange,
                'title': r.title,
                'url': r.url,
                'published_at': _iso_utc(r.published_at),
                'noticed_at': _iso_utc(r.noticed_at),
            }
            for r in rows
        ]
    }
