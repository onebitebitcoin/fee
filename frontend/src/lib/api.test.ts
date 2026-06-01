import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';

describe('api.getTickers', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ last_run: null, items: [] }),
    } as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('GET /api/v1/market/tickers/latest 를 호출한다', async () => {
    await api.getTickers();
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/market/tickers/latest',
      expect.objectContaining({ headers: expect.anything() }),
    );
  });
});

describe('api request 에러 처리', () => {
  it('응답이 ok가 아니면 에러를 던진다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 422,
      json: () => Promise.resolve({}),
    } as Response);

    await expect(api.getTickers()).rejects.toThrow('API 요청 실패: 422');
    vi.restoreAllMocks();
  });
});
