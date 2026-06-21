"""인메모리 TTL 캐시 — single-flight 동시 미스 방어 포함."""
import threading
import time


class _TtlCache:
    def __init__(self, ttl: int):
        self._ttl = ttl
        self._store: dict = {}
        self._locks: dict[str, threading.Lock] = {}
        self._guard = threading.Lock()

    def get(self, key: str):
        entry = self._store.get(key)
        if entry and time.time() - entry['ts'] < self._ttl:
            return entry['data']
        return None

    def set(self, key: str, data) -> None:
        self._store[key] = {'data': data, 'ts': time.time()}

    def _key_lock(self, key: str) -> threading.Lock:
        with self._guard:
            lock = self._locks.get(key)
            if lock is None:
                lock = threading.Lock()
                self._locks[key] = lock
            return lock

    def get_or_compute(self, key: str, compute_fn):
        """캐시 히트면 즉시 반환, 미스면 키별 락으로 1회만 계산(single-flight).

        동시 미스가 N개 들어와도 compute_fn은 1회만 실행되고, 나머지는
        완성된 결과를 공유한다(cache stampede 방어). 동기 핸들러가
        anyio threadpool에서 실행되므로 threading.Lock으로 동기화한다.
        """
        cached = self.get(key)
        if cached is not None:
            return cached
        lock = self._key_lock(key)
        with lock:
            cached = self.get(key)
            if cached is not None:
                return cached
            data = compute_fn()
            self.set(key, data)
            return data

    def invalidate(self, key: str) -> None:
        self._store.pop(key, None)

    def clear(self) -> None:
        self._store.clear()
        with self._guard:
            self._locks.clear()
