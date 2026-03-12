import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, vi } from 'vitest';

import { RunsPage } from './RunsPage';

vi.mock('../lib/api', () => ({
  api: {
    getRuns: vi.fn(),
    triggerCrawl: vi.fn(),
  },
}));

const { api } = await import('../lib/api');

describe('RunsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders fetched runs', async () => {
    vi.mocked(api.getRuns).mockResolvedValueOnce({
      items: [
        {
          id: 12,
          trigger: 'manual',
          status: 'success',
          message: 'done',
          started_at: '2026-03-11T00:00:00Z',
          completed_at: '2026-03-11T00:10:00Z',
        },
      ],
    });

    render(
      <BrowserRouter>
        <RunsPage />
      </BrowserRouter>,
    );

    expect(await screen.findByText('수집 실행 이력')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '수동 크롤링 실행' })).toBeInTheDocument();
    expect(screen.getAllByText('manual').length).toBeGreaterThan(0);
    expect(screen.getAllByText('정상').length).toBeGreaterThan(0);
  });

  it('runs manual crawl and refreshes the list', async () => {
    const user = userEvent.setup();

    vi.mocked(api.getRuns)
      .mockResolvedValueOnce({
        items: [],
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: 21,
            trigger: 'manual',
            status: 'success',
            message: 'refreshed',
            started_at: '2026-03-11T01:00:00Z',
            completed_at: '2026-03-11T01:05:00Z',
          },
        ],
      });
    vi.mocked(api.triggerCrawl).mockResolvedValueOnce({
      id: 21,
      trigger: 'manual',
      status: 'success',
      message: 'refreshed',
      started_at: '2026-03-11T01:00:00Z',
      completed_at: '2026-03-11T01:05:00Z',
    });

    render(
      <BrowserRouter>
        <RunsPage />
      </BrowserRouter>,
    );

    await screen.findByText('수집 실행 이력');
    await user.click(screen.getByRole('button', { name: '수동 크롤링 실행' }));

    await waitFor(() => {
      expect(api.triggerCrawl).toHaveBeenCalledTimes(1);
      expect(api.getRuns).toHaveBeenCalledTimes(2);
    });

    expect(await screen.findByText('수동 크롤링 완료: success')).toBeInTheDocument();
    expect(screen.getAllByText('refreshed').length).toBeGreaterThan(0);
  });

  it('renders shared error state on load failure', async () => {
    vi.mocked(api.getRuns).mockRejectedValueOnce(new Error('목록 로딩 실패'));

    render(
      <BrowserRouter>
        <RunsPage />
      </BrowserRouter>,
    );

    expect(await screen.findByText('목록 로딩 실패')).toBeInTheDocument();
  });
});
