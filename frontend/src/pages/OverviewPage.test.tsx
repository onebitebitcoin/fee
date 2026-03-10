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
  it('renders dashboard title', async () => {
    render(
      <BrowserRouter>
        <OverviewPage />
      </BrowserRouter>,
    );
    expect(await screen.findByText('최근 수집 상태')).toBeInTheDocument();
  });
});
