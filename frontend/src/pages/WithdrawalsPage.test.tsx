import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { vi } from 'vitest';

import { WithdrawalsPage } from './WithdrawalsPage';

vi.mock('../lib/api', () => ({
  api: {
    getLightningSwapFees: vi.fn().mockResolvedValue({
      last_run: null,
      items: [],
    }),
    getWithdrawals: vi.fn().mockResolvedValue({
      last_run: {
        id: 1,
        trigger: 'manual',
        status: 'success',
        message: 'done',
        started_at: '2026-03-11T00:00:00Z',
        completed_at: '2026-03-11T00:10:00Z',
      },
      latest_scraping_time: '2026-03-11T00:10:00Z',
      items: [
        {
          exchange: 'upbit',
          coin: 'BTC',
          source: 'scraped_page',
          network_label: 'Bitcoin',
          fee: 0.000002,
          fee_usd: 0.2,
          enabled: true,
        },
        {
          exchange: 'binance',
          coin: 'USDT',
          source: 'scraped_page',
          network_label: 'TRC20',
          fee: 1.5,
          fee_usd: 1.5,
          enabled: true,
        },
      ],
      errors: [],
    }),
  },
}));

describe('WithdrawalsPage', () => {
  it('renders BTC withdrawal fees in sats and preserves non-BTC units', async () => {
    render(
      <BrowserRouter>
        <WithdrawalsPage />
      </BrowserRouter>,
    );

    expect(await screen.findByText('출금 수수료 현황')).toBeInTheDocument();
    expect(screen.getAllByText('200 sats').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1.5').length).toBeGreaterThan(0);
  });
});
