import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { vi } from 'vitest';

import { OverviewPage } from './OverviewPage';

vi.mock('../lib/api', () => ({
  api: {
    getOverview: vi.fn().mockResolvedValue({
      last_run: null,
      counts: { tickers: 0, withdrawal_rows: 0, suspended_networks: 0 },
      usd_krw_rate: null,
      ticker_highlights: {},
      available_exchanges: { korea: [], global: [] },
    }),
    triggerCrawl: vi.fn(),
  },
}));

describe('OverviewPage', () => {
  it('renders overview sections', async () => {
    render(
      <BrowserRouter>
        <OverviewPage />
      </BrowserRouter>,
    );

    expect(await screen.findByText('가격 하이라이트')).toBeInTheDocument();
    expect(screen.getByText('환경 정보')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '수동 크롤링' })).toBeInTheDocument();
  });
});
