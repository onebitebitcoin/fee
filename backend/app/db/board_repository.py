"""게시판(BoardPost/BoardComment) 데이터 접근 계층 — ORM 전용."""
from __future__ import annotations

from sqlalchemy import desc, func as sqlfunc, or_, select
from sqlalchemy.orm import Session

from backend.app.db.models import BoardComment, BoardPost

NOTICE = 'notice'


def _apply_search(stmt, q: str | None):
    if q:
        like = f'%{q.strip()}%'
        stmt = stmt.where(or_(BoardPost.title.ilike(like), BoardPost.content.ilike(like)))
    return stmt


# ── 게시글 ───────────────────────────────────────────────────────────────────

def list_notices(db: Session, q: str | None = None) -> list[BoardPost]:
    """공지글 전체 (최신순). 검색어가 있으면 제목+내용 필터."""
    stmt = _apply_search(select(BoardPost).where(BoardPost.category == NOTICE), q)
    stmt = stmt.order_by(desc(BoardPost.created_at), desc(BoardPost.id))
    return list(db.scalars(stmt))


def list_posts(
    db: Session,
    page: int = 1,
    size: int = 20,
    q: str | None = None,
    category: str | None = None,
) -> tuple[list[BoardPost], int]:
    """비공지 게시글 페이지네이션 (최신순) + 전체 개수 반환."""
    base = select(BoardPost).where(BoardPost.category != NOTICE)
    if category and category != NOTICE:
        base = base.where(BoardPost.category == category)
    base = _apply_search(base, q)
    total = db.scalar(select(sqlfunc.count()).select_from(base.subquery())) or 0
    stmt = (
        base.order_by(desc(BoardPost.created_at), desc(BoardPost.id))
        .offset(max(page - 1, 0) * size)
        .limit(size)
    )
    return list(db.scalars(stmt)), int(total)


def get_post(db: Session, post_id: int) -> BoardPost | None:
    return db.get(BoardPost, post_id)


def create_post(
    db: Session,
    *,
    category: str,
    title: str,
    content: str,
    nickname: str,
    password_hash: str | None,
    password_salt: str | None,
) -> BoardPost:
    post = BoardPost(
        category=category,
        title=title,
        content=content,
        nickname=nickname,
        password_hash=password_hash,
        password_salt=password_salt,
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    return post


def update_post(db: Session, post: BoardPost, *, title: str, content: str) -> BoardPost:
    post.title = title
    post.content = content
    db.commit()
    db.refresh(post)
    return post


def delete_post(db: Session, post: BoardPost) -> None:
    db.delete(post)
    db.commit()


def comment_counts(db: Session, post_ids: list[int]) -> dict[int, int]:
    """게시글 id 목록에 대한 댓글 수 매핑."""
    if not post_ids:
        return {}
    stmt = (
        select(BoardComment.post_id, sqlfunc.count(BoardComment.id))
        .where(BoardComment.post_id.in_(post_ids))
        .group_by(BoardComment.post_id)
    )
    return {pid: int(cnt) for pid, cnt in db.execute(stmt).all()}


# ── 댓글 ─────────────────────────────────────────────────────────────────────

def list_comments(db: Session, post_id: int) -> list[BoardComment]:
    stmt = (
        select(BoardComment)
        .where(BoardComment.post_id == post_id)
        .order_by(BoardComment.created_at, BoardComment.id)
    )
    return list(db.scalars(stmt))


def get_comment(db: Session, comment_id: int) -> BoardComment | None:
    return db.get(BoardComment, comment_id)


def create_comment(
    db: Session,
    *,
    post_id: int,
    nickname: str,
    content: str,
    password_hash: str,
    password_salt: str,
) -> BoardComment:
    comment = BoardComment(
        post_id=post_id,
        nickname=nickname,
        content=content,
        password_hash=password_hash,
        password_salt=password_salt,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment


def update_comment(db: Session, comment: BoardComment, *, content: str) -> BoardComment:
    comment.content = content
    db.commit()
    db.refresh(comment)
    return comment


def delete_comment(db: Session, comment: BoardComment) -> None:
    db.delete(comment)
    db.commit()
