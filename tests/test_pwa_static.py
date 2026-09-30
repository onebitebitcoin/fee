"""PWA 정적 파일 서빙 검증.

서비스워커(/app-sw.js)와 매니페스트는 올바른 Content-Type 과 no-cache 로 응답해야
브라우저가 설치 가능 여부를 판단하고 갱신을 매번 확인한다. index.html 도 no-cache 여야
오래된 화면이 붙잡히지 않는다.
"""

import pytest
from fastapi.testclient import TestClient

from backend.app.core.config import get_settings
from backend.app.main import create_app


@pytest.fixture
def client(tmp_path, monkeypatch):
    dist = tmp_path / 'dist'
    (dist / 'assets').mkdir(parents=True)
    (dist / 'icons').mkdir()
    (dist / 'index.html').write_text('<!doctype html><title>app</title>')
    (dist / 'assets' / 'x.js').write_text('console.log(1)')
    (dist / 'app-sw.js').write_text('self.addEventListener("fetch", () => {})')
    (dist / 'manifest.webmanifest').write_text('{"name": "app"}')
    (dist / 'icons' / 'icon-192.png').write_bytes(b'\x89PNG')
    (tmp_path / 'secret.txt').write_text('secret')

    monkeypatch.setenv('FRONTEND_DIST_DIR', str(dist))
    get_settings.cache_clear()
    yield TestClient(create_app())
    get_settings.cache_clear()


def test_service_worker_served_as_javascript_no_cache(client):
    response = client.get('/app-sw.js')

    assert response.status_code == 200
    assert response.headers['content-type'].startswith('application/javascript')
    assert response.headers['cache-control'] == 'no-cache'
    assert 'addEventListener' in response.text


def test_manifest_served_as_manifest_json(client):
    response = client.get('/manifest.webmanifest')

    assert response.status_code == 200
    assert response.headers['content-type'].startswith('application/manifest+json')
    assert response.headers['cache-control'] == 'no-cache'


@pytest.mark.parametrize('path', ['/', '/explorer/sell', '/no/such/page'])
def test_index_and_spa_fallback_no_cache(client, path):
    response = client.get(path)

    assert response.status_code == 200
    assert '<title>app</title>' in response.text
    assert response.headers['cache-control'] == 'no-cache'


def test_icon_served_as_file(client):
    response = client.get('/icons/icon-192.png')

    assert response.status_code == 200
    assert response.headers['content-type'] == 'image/png'


def test_path_traversal_falls_back_to_index(client):
    response = client.get('/..%2Fsecret.txt')

    assert 'secret' not in response.text
    assert '<title>app</title>' in response.text


def test_kill_switch_path_still_served(client):
    response = client.get('/sw.js')

    assert response.headers['cache-control'] == 'no-store'
    assert 'self.registration.unregister()' in response.text
