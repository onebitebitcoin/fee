"""옛 서비스워커 제거용 kill-switch 라우트 검증.

과거 이 origin 에 남아있던 서비스워커가 갱신 시 올바른 JS(application/javascript)를
받아 자기 자신을 unregister 하도록, /sw.js 등이 SPA index.html(HTML) 대신
kill-switch 스크립트를 응답해야 한다.
"""

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app

SW_PATHS = [
    '/sw.js',
    '/service-worker.js',
    '/serviceworker.js',
    '/ngsw-worker.js',
    '/firebase-messaging-sw.js',
]


@pytest.mark.parametrize('path', SW_PATHS)
def test_kill_switch_served_as_javascript(path):
    # Arrange
    client = TestClient(app)

    # Act
    response = client.get(path)

    # Assert
    assert response.status_code == 200
    assert response.headers['content-type'].startswith('application/javascript')
    assert response.headers.get('cache-control') == 'no-store'


@pytest.mark.parametrize('path', SW_PATHS)
def test_kill_switch_body_unregisters_and_clears_cache(path):
    # Arrange
    client = TestClient(app)

    # Act
    body = client.get(path).text

    # Assert: 캐시 비우기 + 자기 자신 unregister 로직 포함, HTML 이 아니어야 한다
    assert 'self.registration.unregister()' in body
    assert 'caches.keys()' in body
    assert '<!doctype html>' not in body.lower()
