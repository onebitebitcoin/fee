"""게시판 API 통합 테스트."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.db.base import Base
from backend.app.db.session import get_db
from backend.app.main import app

ADMIN_HEADERS = {'X-API-Key': 'test-admin-key'}


@pytest.fixture(autouse=True)
def _admin_key(monkeypatch):
    """ADMIN_API_KEY를 테스트 범위에서만 설정 (다른 테스트 모듈로 누수 방지, 자동 복원)."""
    monkeypatch.setenv('ADMIN_API_KEY', 'test-admin-key')


def make_client() -> TestClient:
    engine = create_engine(
        'sqlite://', future=True,
        connect_args={'check_same_thread': False}, poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app)


def _create_post(client, *, title='제목', content='내용', nickname='닉', password='pw123', category='general'):
    return client.post('/api/v1/board/posts', json={
        'category': category, 'title': title, 'content': content,
        'nickname': nickname, 'password': password,
    })


# ── 작성/조회 ────────────────────────────────────────────────────────────────

def test_create_general_post_returns_no_password_fields():
    client = make_client()
    res = _create_post(client)
    assert res.status_code == 200
    data = res.json()
    assert data['category'] == 'general'
    assert data['title'] == '제목'
    assert 'password' not in data
    assert 'password_hash' not in data
    assert 'password_salt' not in data


def test_create_general_post_without_password_fails():
    client = make_client()
    res = client.post('/api/v1/board/posts', json={
        'category': 'general', 'title': 't', 'content': 'c', 'nickname': 'n',
    })
    assert res.status_code == 400


def test_list_posts_pagination_newest_first():
    client = make_client()
    for i in range(25):
        _create_post(client, title=f'글{i}')
    res = client.get('/api/v1/board/posts?page=1&size=20')
    assert res.status_code == 200
    data = res.json()
    assert data['total'] == 25
    assert len(data['items']) == 20
    # 최신순: 마지막에 만든 글24가 맨 앞
    assert data['items'][0]['title'] == '글24'
    page2 = client.get('/api/v1/board/posts?page=2&size=20').json()
    assert len(page2['items']) == 5


def test_post_detail_404():
    client = make_client()
    assert client.get('/api/v1/board/posts/999').status_code == 404


# ── 공지(notice) ─────────────────────────────────────────────────────────────

def test_notice_requires_admin_key():
    client = make_client()
    res = client.post('/api/v1/board/posts', json={
        'category': 'notice', 'title': '공지', 'content': 'c', 'nickname': '관리자',
    })
    assert res.status_code == 403


def test_notice_created_with_admin_and_pinned_every_page():
    client = make_client()
    res = client.post('/api/v1/board/posts', json={
        'category': 'notice', 'title': '서비스 점검', 'content': 'c', 'nickname': '관리자',
    }, headers=ADMIN_HEADERS)
    assert res.status_code == 200
    for i in range(25):
        _create_post(client, title=f'일반{i}')
    page2 = client.get('/api/v1/board/posts?page=2&size=20').json()
    assert len(page2['notices']) == 1
    assert page2['notices'][0]['title'] == '서비스 점검'
    assert page2['notices'][0]['category'] == 'notice'


# ── 검색 ─────────────────────────────────────────────────────────────────────

def test_search_matches_title_and_content():
    client = make_client()
    _create_post(client, title='수수료 질문', content='바이낸스')
    _create_post(client, title='일반글', content='업비트 수수료 관련')
    _create_post(client, title='무관', content='무관')
    by_title = client.get('/api/v1/board/posts?q=수수료').json()
    assert by_title['total'] == 2


# ── 수정/삭제 비밀번호 검증 ──────────────────────────────────────────────────

def test_update_post_wrong_password_403():
    client = make_client()
    pid = _create_post(client, password='right').json()['id']
    res = client.put(f'/api/v1/board/posts/{pid}', json={
        'title': '수정', 'content': 'x', 'password': 'wrong',
    })
    assert res.status_code == 403


def test_update_and_delete_post_with_correct_password():
    client = make_client()
    pid = _create_post(client, password='right').json()['id']
    upd = client.put(f'/api/v1/board/posts/{pid}', json={
        'title': '수정됨', 'content': 'x', 'password': 'right',
    })
    assert upd.status_code == 200
    assert upd.json()['title'] == '수정됨'
    dele = client.request('DELETE', f'/api/v1/board/posts/{pid}', json={'password': 'right'})
    assert dele.status_code == 200
    assert client.get(f'/api/v1/board/posts/{pid}').status_code == 404


# ── 댓글 ─────────────────────────────────────────────────────────────────────

def test_comment_crud_with_password():
    client = make_client()
    pid = _create_post(client).json()['id']
    cres = client.post(f'/api/v1/board/posts/{pid}/comments', json={
        'nickname': '댓글러', 'content': '안녕', 'password': 'cpw',
    })
    assert cres.status_code == 200
    cid = cres.json()['id']
    assert 'password_hash' not in cres.json()
    # 상세에 댓글 노출
    detail = client.get(f'/api/v1/board/posts/{pid}').json()
    assert len(detail['comments']) == 1
    # 오답 수정 403
    assert client.put(f'/api/v1/board/comments/{cid}', json={'content': 'x', 'password': 'no'}).status_code == 403
    # 정답 수정 200
    ok = client.put(f'/api/v1/board/comments/{cid}', json={'content': '수정댓글', 'password': 'cpw'})
    assert ok.status_code == 200
    assert ok.json()['content'] == '수정댓글'
    # 삭제
    assert client.request('DELETE', f'/api/v1/board/comments/{cid}', json={'password': 'cpw'}).status_code == 200
    assert len(client.get(f'/api/v1/board/posts/{pid}').json()['comments']) == 0
