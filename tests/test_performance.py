import time
from unittest.mock import patch


def test_mempool_cache_avoids_duplicate_http_calls():
    """동일 30초 내 호출은 HTTP를 1번만 한다."""
    from backend.app.domain import paths_sell
    # 캐시 초기화
    paths_sell._mempool_cache.clear()

    call_count = 0
    fake_fees = {'fastestFee': 20, 'halfHourFee': 10, 'hourFee': 5}

    def fake_get(url, **kwargs):
        nonlocal call_count
        call_count += 1

        class R:
            def raise_for_status(self): pass
            def json(self): return fake_fees
        return R()

    with patch('backend.app.domain.paths_sell.requests.get', fake_get):
        paths_sell._fetch_mempool_recommended_fees()
        paths_sell._fetch_mempool_recommended_fees()

    assert call_count == 1, f"Expected 1 HTTP call, got {call_count}"


def test_mempool_cache_expires_after_ttl(monkeypatch):
    """TTL 이후 재호출 시 HTTP를 다시 한다."""
    from backend.app.domain import paths_sell
    paths_sell._mempool_cache.clear()

    original_time = time.time()
    call_count = 0
    fake_fees = {'fastestFee': 20, 'halfHourFee': 10, 'hourFee': 5}

    def fake_get(url, **kwargs):
        nonlocal call_count
        call_count += 1

        class R:
            def raise_for_status(self): pass
            def json(self): return fake_fees
        return R()

    with patch('backend.app.domain.paths_sell.requests.get', fake_get):
        paths_sell._fetch_mempool_recommended_fees()

    # TTL 이후로 시간 이동
    monkeypatch.setattr(
        'backend.app.domain.paths_sell.time',
        type('T', (), {'time': staticmethod(lambda: original_time + paths_sell._MEMPOOL_CACHE_TTL + 1)})()
    )

    with patch('backend.app.domain.paths_sell.requests.get', fake_get):
        paths_sell._fetch_mempool_recommended_fees()

    assert call_count == 2, f"Expected 2 HTTP calls after TTL, got {call_count}"
