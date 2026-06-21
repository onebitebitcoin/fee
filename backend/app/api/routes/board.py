"""게시판 API — 게시글/댓글 CRUD.

- 일반(general)/제보(report) 글: 닉네임 + 비밀번호(해시)로 작성, 수정/삭제 시 비밀번호 검증.
- 공지(notice) 글: admin X-API-Key 로만 작성/수정/삭제 (비밀번호 없음).
- 검색: 제목 + 내용. 공지는 모든 페이지 상단 고정(별도 반환).
"""
from __future__ import annotations

import os

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.app.core.security import hash_password, verify_password
from backend.app.db import board_repository as repo
from backend.app.db.models import BoardComment, BoardPost
from backend.app.db.session import get_db

router = APIRouter()

POST_CATEGORIES = ('general', 'report')  # 사용자가 직접 지정 가능한 카테고리
NOTICE = 'notice'
DEFAULT_PAGE_SIZE = 20


def _ts(dt_val) -> int | None:
    return int(dt_val.timestamp()) if dt_val else None


def _is_admin(x_api_key: str | None) -> bool:
    admin_key = os.environ.get('ADMIN_API_KEY', 'dev-secret-key')
    return bool(x_api_key) and x_api_key == admin_key


# ── 직렬화 (비밀번호 필드 절대 미포함) ───────────────────────────────────────

def _serialize_post_brief(post: BoardPost, comment_count: int) -> dict:
    return {
        'id': post.id,
        'category': post.category,
        'title': post.title,
        'nickname': post.nickname,
        'comment_count': comment_count,
        'created_at': _ts(post.created_at),
        'updated_at': _ts(post.updated_at),
    }


def _serialize_comment(comment: BoardComment) -> dict:
    return {
        'id': comment.id,
        'post_id': comment.post_id,
        'nickname': comment.nickname,
        'content': comment.content,
        'created_at': _ts(comment.created_at),
        'updated_at': _ts(comment.updated_at),
    }


def _serialize_post_detail(post: BoardPost, comments: list[BoardComment]) -> dict:
    return {
        'id': post.id,
        'category': post.category,
        'title': post.title,
        'content': post.content,
        'nickname': post.nickname,
        'created_at': _ts(post.created_at),
        'updated_at': _ts(post.updated_at),
        'comments': [_serialize_comment(c) for c in comments],
    }


# ── 요청 바디 ────────────────────────────────────────────────────────────────

class PostCreate(BaseModel):
    category: str = 'general'
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1)
    nickname: str = Field(min_length=1, max_length=50)
    password: str | None = Field(default=None, max_length=128)


class PostUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1)
    password: str | None = Field(default=None, max_length=128)


class PostDelete(BaseModel):
    password: str | None = Field(default=None, max_length=128)


class CommentCreate(BaseModel):
    nickname: str = Field(min_length=1, max_length=50)
    content: str = Field(min_length=1)
    password: str = Field(min_length=1, max_length=128)


class CommentUpdate(BaseModel):
    content: str = Field(min_length=1)
    password: str = Field(min_length=1, max_length=128)


class CommentDelete(BaseModel):
    password: str = Field(min_length=1, max_length=128)


# ── 게시글 ───────────────────────────────────────────────────────────────────

@router.get('/posts')
def list_posts(
    page: int = Query(1, ge=1),
    size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=100),
    q: str | None = None,
    category: str | None = None,
    db: Session = Depends(get_db),
) -> dict:
    notices = repo.list_notices(db, q=q)
    posts, total = repo.list_posts(db, page=page, size=size, q=q, category=category)
    counts = repo.comment_counts(db, [p.id for p in notices] + [p.id for p in posts])
    return {
        'notices': [_serialize_post_brief(p, counts.get(p.id, 0)) for p in notices],
        'items': [_serialize_post_brief(p, counts.get(p.id, 0)) for p in posts],
        'total': total,
        'page': page,
        'size': size,
    }


@router.get('/posts/{post_id}')
def get_post(post_id: int, db: Session = Depends(get_db)) -> dict:
    post = repo.get_post(db, post_id)
    if post is None:
        raise HTTPException(status_code=404, detail='게시글을 찾을 수 없습니다.')
    comments = repo.list_comments(db, post_id)
    return _serialize_post_detail(post, comments)


@router.post('/posts')
def create_post(
    body: PostCreate,
    db: Session = Depends(get_db),
    x_api_key: str | None = Header(None, alias='X-API-Key'),
) -> dict:
    if body.category == NOTICE:
        if not _is_admin(x_api_key):
            raise HTTPException(status_code=403, detail='공지는 관리자만 작성할 수 있습니다.')
        post = repo.create_post(
            db, category=NOTICE, title=body.title, content=body.content,
            nickname=body.nickname or '관리자', password_hash=None, password_salt=None,
        )
        return _serialize_post_detail(post, [])

    if body.category not in POST_CATEGORIES:
        raise HTTPException(status_code=400, detail='잘못된 카테고리입니다.')
    if not body.password:
        raise HTTPException(status_code=400, detail='비밀번호를 입력하세요.')
    pw_hash, pw_salt = hash_password(body.password)
    post = repo.create_post(
        db, category=body.category, title=body.title, content=body.content,
        nickname=body.nickname, password_hash=pw_hash, password_salt=pw_salt,
    )
    return _serialize_post_detail(post, [])


@router.put('/posts/{post_id}')
def update_post(
    post_id: int,
    body: PostUpdate,
    db: Session = Depends(get_db),
    x_api_key: str | None = Header(None, alias='X-API-Key'),
) -> dict:
    post = repo.get_post(db, post_id)
    if post is None:
        raise HTTPException(status_code=404, detail='게시글을 찾을 수 없습니다.')
    _authorize_post(post, body.password, x_api_key)
    post = repo.update_post(db, post, title=body.title, content=body.content)
    return _serialize_post_detail(post, repo.list_comments(db, post_id))


@router.delete('/posts/{post_id}')
def delete_post(
    post_id: int,
    body: PostDelete | None = None,
    db: Session = Depends(get_db),
    x_api_key: str | None = Header(None, alias='X-API-Key'),
) -> dict:
    post = repo.get_post(db, post_id)
    if post is None:
        raise HTTPException(status_code=404, detail='게시글을 찾을 수 없습니다.')
    _authorize_post(post, body.password if body else None, x_api_key)
    repo.delete_post(db, post)
    return {'ok': True}


def _authorize_post(post: BoardPost, password: str | None, x_api_key: str | None) -> None:
    """공지는 admin 키, 일반/제보는 비밀번호로 권한 검증. 실패 시 403."""
    if post.category == NOTICE:
        if not _is_admin(x_api_key):
            raise HTTPException(status_code=403, detail='공지는 관리자만 수정/삭제할 수 있습니다.')
        return
    if _is_admin(x_api_key):
        return  # 관리자는 모든 글 관리 가능
    if not verify_password(password or '', post.password_hash, post.password_salt):
        raise HTTPException(status_code=403, detail='비밀번호가 일치하지 않습니다.')


# ── 댓글 ─────────────────────────────────────────────────────────────────────

@router.post('/posts/{post_id}/comments')
def create_comment(post_id: int, body: CommentCreate, db: Session = Depends(get_db)) -> dict:
    post = repo.get_post(db, post_id)
    if post is None:
        raise HTTPException(status_code=404, detail='게시글을 찾을 수 없습니다.')
    pw_hash, pw_salt = hash_password(body.password)
    comment = repo.create_comment(
        db, post_id=post_id, nickname=body.nickname, content=body.content,
        password_hash=pw_hash, password_salt=pw_salt,
    )
    return _serialize_comment(comment)


@router.put('/comments/{comment_id}')
def update_comment(comment_id: int, body: CommentUpdate, db: Session = Depends(get_db)) -> dict:
    comment = repo.get_comment(db, comment_id)
    if comment is None:
        raise HTTPException(status_code=404, detail='댓글을 찾을 수 없습니다.')
    if not verify_password(body.password, comment.password_hash, comment.password_salt):
        raise HTTPException(status_code=403, detail='비밀번호가 일치하지 않습니다.')
    comment = repo.update_comment(db, comment, content=body.content)
    return _serialize_comment(comment)


@router.delete('/comments/{comment_id}')
def delete_comment(
    comment_id: int,
    body: CommentDelete,
    db: Session = Depends(get_db),
    x_api_key: str | None = Header(None, alias='X-API-Key'),
) -> dict:
    comment = repo.get_comment(db, comment_id)
    if comment is None:
        raise HTTPException(status_code=404, detail='댓글을 찾을 수 없습니다.')
    if not _is_admin(x_api_key) and not verify_password(
        body.password, comment.password_hash, comment.password_salt
    ):
        raise HTTPException(status_code=403, detail='비밀번호가 일치하지 않습니다.')
    repo.delete_comment(db, comment)
    return {'ok': True}
