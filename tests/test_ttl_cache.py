import time


def _make_cache(ttl: int):
    from backend.app.api.routes.market import _TtlCache
    return _TtlCache(ttl=ttl)


def test_cache_miss_returns_none():
    cache = _make_cache(ttl=60)
    assert cache.get('status') is None


def test_cache_hit_returns_data():
    cache = _make_cache(ttl=60)
    cache.set('status', {'data': 'ok'})
    assert cache.get('status') == {'data': 'ok'}


def test_cache_expires_after_ttl(monkeypatch):
    cache = _make_cache(ttl=1)
    original_time = time.time()
    cache.set('status', {'data': 'ok'})
    monkeypatch.setattr(
        'backend.app.api.routes.market.time',
        type('T', (), {'time': staticmethod(lambda: original_time + 2)})()
    )
    assert cache.get('status') is None


def test_cache_invalidate_removes_entry():
    cache = _make_cache(ttl=60)
    cache.set('status', {'data': 'ok'})
    cache.invalidate('status')
    assert cache.get('status') is None


def test_cache_invalidate_nonexistent_key_no_error():
    cache = _make_cache(ttl=60)
    cache.invalidate('nonexistent')  # 오류 없이 실행되어야 함


def test_cache_clear_removes_all_entries():
    cache = _make_cache(ttl=60)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.clear()
    assert cache.get('a') is None
    assert cache.get('b') is None
