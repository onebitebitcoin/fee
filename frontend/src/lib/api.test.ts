import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';

describe('api.triggerCrawl', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 1, trigger: 'manual', status: 'success' }),
    } as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POST /api/v1/crawl-runs 를 호출한다', async () => {
    await api.triggerCrawl();
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/crawl-runs',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('X-API-Key 헤더를 포함한다', async () => {
    await api.triggerCrawl();
    const [, options] = fetchSpy.mock.calls[0];
    const headers = (options as RequestInit).headers as Record<string, string>;
    expect(headers['X-API-Key']).toBeDefined();
    expect(headers['X-API-Key']).not.toBe('');
  });
});

describe('api.request 에러 처리', () => {
  it('응답이 ok가 아니면 에러를 던진다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 422,
      json: () => Promise.resolve({}),
    } as Response);

    await expect(api.triggerCrawl()).rejects.toThrow('API 요청 실패: 422');
    vi.restoreAllMocks();
  });
});
