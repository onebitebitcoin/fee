import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { vi } from 'vitest';

import { CheapestPathPage } from './CheapestPathPage';

vi.mock('../lib/api', () => ({
  api: {
    getCheapestPath: vi.fn().mockResolvedValue({
      amount_krw: 1000000,
      global_exchange: 'binance',
      global_btc_price_usd: 95000,
      usd_krw_rate: 1380,
      total_paths_evaluated: 6,
      data_source: 'test-fixture',
      latest_scraping_time: '2026-03-10T00:00:00',
      maintenance_checked_at: '2026-03-10T00:00:00',
      best_path: {
        korean_exchange: 'cheap1',
        transfer_coin: 'USDT',
        network: 'TRC20',
        btc_received: 0.0088,
        btc_received_usd: 836,
        total_fee_krw: 2000,
        fee_pct: 0.2,
        breakdown: {
          total_fee_krw: 2000,
          components: [{ label: '국내 매수 수수료', amount_krw: 500, rate_pct: 0.05 }],
        },
      },
      top5: [],
      all_paths: [
        {
          korean_exchange: 'highbtc',
          transfer_coin: 'BTC',
          network: 'Bitcoin',
          btc_received: 0.0099,
          btc_received_usd: 940,
          total_fee_krw: 9000,
          fee_pct: 0.9,
          breakdown: { total_fee_krw: 9000, components: [{ label: '국내 매수 수수료', amount_krw: 3000, rate_pct: 0.3 }] },
        },
        {
          korean_exchange: 'cheap1',
          transfer_coin: 'USDT',
          network: 'TRC20',
          btc_received: 0.0088,
          btc_received_usd: 836,
          total_fee_krw: 2000,
          fee_pct: 0.2,
          breakdown: { total_fee_krw: 2000, components: [{ label: '국내 매수 수수료', amount_krw: 500, rate_pct: 0.05 }] },
        },
        {
          korean_exchange: 'cheap2',
          transfer_coin: 'USDT',
          network: 'TRC20',
          btc_received: 0.0087,
          btc_received_usd: 827,
          total_fee_krw: 2500,
          fee_pct: 0.25,
          breakdown: { total_fee_krw: 2500, components: [{ label: '국내 매수 수수료', amount_krw: 700, rate_pct: 0.07 }] },
        },
        {
          korean_exchange: 'mid1',
          transfer_coin: 'BTC',
          network: 'Bitcoin',
          btc_received: 0.0091,
          btc_received_usd: 864,
          total_fee_krw: 5000,
          fee_pct: 0.5,
          breakdown: { total_fee_krw: 5000, components: [{ label: '국내 매수 수수료', amount_krw: 2000, rate_pct: 0.2 }] },
        },
        {
          korean_exchange: 'mid2',
          transfer_coin: 'BTC',
          network: 'Bitcoin',
          btc_received: 0.009,
          btc_received_usd: 855,
          total_fee_krw: 6000,
          fee_pct: 0.6,
          breakdown: { total_fee_krw: 6000, components: [{ label: '국내 매수 수수료', amount_krw: 2500, rate_pct: 0.25 }] },
        },
        {
          korean_exchange: 'expensive',
          transfer_coin: 'BTC',
          network: 'Bitcoin',
          btc_received: 0.008,
          btc_received_usd: 760,
          total_fee_krw: 12000,
          fee_pct: 1.2,
          breakdown: { total_fee_krw: 12000, components: [{ label: '국내 매수 수수료', amount_krw: 4000, rate_pct: 0.4 }] },
        },
      ],
      disabled_paths: [],
    }),
  },
}));

describe('CheapestPathPage', () => {
  it('renders the current dashboard summary for the cheapest route', async () => {
    render(
      <BrowserRouter>
        <CheapestPathPage />
      </BrowserRouter>,
    );

    expect(await screen.findByRole('heading', { name: '최적 경로 대시보드' })).toBeInTheDocument();
    expect(screen.getByText('최적 경로')).toBeInTheDocument();
    expect(screen.getByText('운영 정보')).toBeInTheDocument();
    expect(screen.getByText('수수료율 비교 (상위 5개)')).toBeInTheDocument();
    expect(screen.getAllByText('cheap1').length).toBeGreaterThan(0);
  });

  it('filters routes by network on mobile-friendly controls', async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <CheapestPathPage />
      </BrowserRouter>,
    );

    await screen.findByRole('heading', { name: '최적 경로 대시보드' });

    await user.click(screen.getByRole('button', { name: /TRC20/i }));
    expect(screen.getByText('4/6개')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /TRC20/i }));
    expect(screen.getByText('6/6개')).toBeInTheDocument();
  });

  it('updates the selected route detail when a route is chosen', async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <CheapestPathPage />
      </BrowserRouter>,
    );

    await screen.findByRole('heading', { name: '최적 경로 대시보드' });
    await user.click(screen.getAllByRole('button', { name: 'mid2 경로 선택' })[0]);

    const detailRegion = screen.getByRole('region', { name: '선택 경로 상세' });
    expect(within(detailRegion).getByText('mid2')).toBeInTheDocument();
    expect(within(detailRegion).getByText('Bitcoin')).toBeInTheDocument();
  });
});
