import threading
import time


def _make_cache(ttl: int):
    from backend.app.services.cache import _TtlCache
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
        'backend.app.services.cache.time',
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


def test_get_or_compute_caches_result():
    cache = _make_cache(ttl=60)
    calls = []

    def compute():
        calls.append(1)
        return {'v': 42}

    assert cache.get_or_compute('k', compute) == {'v': 42}
    assert cache.get_or_compute('k', compute) == {'v': 42}  # 2번째는 캐시 히트
    assert len(calls) == 1  # compute는 1회만 실행


def test_get_or_compute_does_not_cache_on_exception():
    cache = _make_cache(ttl=60)

    def boom():
        raise ValueError('fail')

    # 예외는 전파되고 캐시는 비어 있어야 함(다음 호출에서 재시도)
    for _ in range(2):
        try:
            cache.get_or_compute('k', boom)
            raise AssertionError('예외가 전파되어야 함')
        except ValueError:
            pass
    assert cache.get('k') is None


def test_get_or_compute_single_flight_concurrent_miss():
    """동시 미스 N개가 들어와도 compute는 1회만 실행되어야 한다(stampede 방어)."""
    cache = _make_cache(ttl=60)
    compute_count = []
    start = threading.Barrier(10)

    def slow_compute():
        compute_count.append(1)
        time.sleep(0.1)  # 계산이 느린 동안 다른 스레드가 대기에 들어가도록
        return {'v': 'computed'}

    results = []

    def worker():
        start.wait()  # 10개 스레드가 동시에 출발
        results.append(cache.get_or_compute('k', slow_compute))

    threads = [threading.Thread(target=worker) for _ in range(10)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert len(compute_count) == 1  # 10개 동시 요청 → 계산 1회
    assert all(r == {'v': 'computed'} for r in results)  # 모두 같은 결과 공유
    assert len(results) == 10
