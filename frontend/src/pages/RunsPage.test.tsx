import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { vi } from 'vitest';

import { RunsPage } from './RunsPage';

vi.mock('../lib/api', () => ({
  api: {
    getRuns: vi.fn(),
  },
}));

const { api } = await import('../lib/api');

describe('RunsPage', () => {
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
    expect(screen.getByText('manual')).toBeInTheDocument();
    expect(screen.getByText('success')).toBeInTheDocument();
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
