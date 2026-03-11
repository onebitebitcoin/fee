import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { vi } from 'vitest';

import { CheapestPathPage } from './CheapestPathPage';

vi.mock('../lib/api', () => ({
  api: {
    getAccessCount: vi.fn().mockResolvedValue({ total: 42, today: 3 }),
    getCheapestPath: vi.fn().mockResolvedValue({
      amount_krw: 1000000,
      global_exchange: 'binance',
      global_btc_price_usd: 95000,
      usd_krw_rate: 1380,
      total_paths_evaluated: 6,
      data_source: 'test-fixture',
      latest_scraping_time: '2026-03-10T00:00:00',
      maintenance_checked_at: '2026-03-10T00:00:00',
      available_filters: {
        domestic_withdrawal_networks: ['Bitcoin', 'TRC20'],
        global_exit_options: [
          { mode: 'onchain', network: 'Bitcoin' },
          { mode: 'lightning', network: 'Lightning Network' },
        ],
        lightning_exit_providers: ['Bitfreezer'],
      },
      best_path: {
        path_id: 'cheap1-trc20-onchain',
        korean_exchange: 'cheap1',
        transfer_coin: 'USDT',
        network: 'TRC20',
        domestic_withdrawal_network: 'TRC20',
        global_exit_mode: 'onchain',
        global_exit_network: 'Bitcoin',
        btc_received: 0.0088,
        btc_received_usd: 836,
        total_fee_krw: 2000,
        fee_pct: 0.2,
        breakdown: {
          total_fee_krw: 2000,
          components: [
            { label: '국내 매수 수수료', amount_krw: 500, rate_pct: 0.05 },
            { label: '테스트 BTC 수수료', amount_krw: 100, amount_text: '1e-6 BTC' },
          ],
        },
      },
      top5: [],
      all_paths: [
        {
          path_id: 'highbtc-bitcoin-onchain',
          korean_exchange: 'highbtc',
          transfer_coin: 'BTC',
          network: 'Bitcoin',
          domestic_withdrawal_network: 'Bitcoin',
          global_exit_mode: 'onchain',
          global_exit_network: 'Bitcoin',
          btc_received: 0.0099,
          btc_received_usd: 940,
          total_fee_krw: 9000,
          fee_pct: 0.9,
          breakdown: { total_fee_krw: 9000, components: [{ label: '국내 매수 수수료', amount_krw: 3000, rate_pct: 0.3 }] },
        },
        {
          path_id: 'cheap1-trc20-onchain',
          korean_exchange: 'cheap1',
          transfer_coin: 'USDT',
          network: 'TRC20',
          domestic_withdrawal_network: 'TRC20',
          global_exit_mode: 'onchain',
          global_exit_network: 'Bitcoin',
          btc_received: 0.0088,
          btc_received_usd: 836,
          total_fee_krw: 2000,
          fee_pct: 0.2,
          breakdown: {
            total_fee_krw: 2000,
            components: [
              { label: '국내 매수 수수료', amount_krw: 500, rate_pct: 0.05 },
              { label: '테스트 BTC 수수료', amount_krw: 100, amount_text: '1e-6 BTC' },
            ],
          },
        },
        {
          path_id: 'cheap2-trc20-lightning',
          korean_exchange: 'cheap2',
          transfer_coin: 'USDT',
          network: 'TRC20',
          domestic_withdrawal_network: 'TRC20',
          global_exit_mode: 'lightning',
          global_exit_network: 'Lightning Network',
          lightning_exit_provider: 'Bitfreezer',
          path_type: 'lightning_exit',
          btc_received: 0.0087,
          btc_received_usd: 827,
          total_fee_krw: 2500,
          fee_pct: 0.25,
          breakdown: { total_fee_krw: 2500, components: [{ label: '국내 매수 수수료', amount_krw: 700, rate_pct: 0.07 }] },
        },
        {
          path_id: 'mid1-bitcoin-onchain',
          korean_exchange: 'mid1',
          transfer_coin: 'BTC',
          network: 'Bitcoin',
          domestic_withdrawal_network: 'Bitcoin',
          global_exit_mode: 'onchain',
          global_exit_network: 'Bitcoin',
          btc_received: 0.0091,
          btc_received_usd: 864,
          total_fee_krw: 5000,
          fee_pct: 0.5,
          breakdown: { total_fee_krw: 5000, components: [{ label: '국내 매수 수수료', amount_krw: 2000, rate_pct: 0.2 }] },
        },
        {
          path_id: 'mid2-bitcoin-onchain',
          korean_exchange: 'mid2',
          transfer_coin: 'BTC',
          network: 'Bitcoin',
          domestic_withdrawal_network: 'Bitcoin',
          global_exit_mode: 'onchain',
          global_exit_network: 'Bitcoin',
          btc_received: 0.009,
          btc_received_usd: 855,
          total_fee_krw: 6000,
          fee_pct: 0.6,
          breakdown: { total_fee_krw: 6000, components: [{ label: '국내 매수 수수료', amount_krw: 2500, rate_pct: 0.25 }] },
        },
        {
          path_id: 'expensive-bitcoin-onchain',
          korean_exchange: 'expensive',
          transfer_coin: 'BTC',
          network: 'Bitcoin',
          domestic_withdrawal_network: 'Bitcoin',
          global_exit_mode: 'onchain',
          global_exit_network: 'Bitcoin',
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

    expect(await screen.findByText('최적 경로')).toBeInTheDocument();
    expect(screen.getByText('수수료율 비교 (상위 5개)')).toBeInTheDocument();
    expect(screen.getAllByText('cheap1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('880,000 sats').length).toBeGreaterThan(0);
  });

  it('filters routes by explicit path dimensions', async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <CheapestPathPage />
      </BrowserRouter>,
    );

    await screen.findByText('최적 경로');

    await user.click(screen.getByRole('button', { name: /TRC20/i }));
    expect(screen.getByText('4/6')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /TRC20/i }));
    expect(screen.getByText('6/6')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Lightning Network/i }));
    expect(screen.getByText('5/6')).toBeInTheDocument();
  });

  it('updates the selected route detail when a route is chosen', async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <CheapestPathPage />
      </BrowserRouter>,
    );

    await screen.findByText('최적 경로');
    await user.click(screen.getAllByRole('button', { name: 'mid2 경로 선택' })[0]);

    const detailRegion = screen.getByRole('region', { name: '선택 경로 상세' });
    expect(within(detailRegion).getAllByText('mid2').length).toBeGreaterThan(0);
    expect(within(detailRegion).getAllByText('900,000 sats').length).toBeGreaterThan(0);
  });

  it('opens a mobile route detail popup and shows sats-converted values', async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <CheapestPathPage />
      </BrowserRouter>,
    );

    await screen.findByText('최적 경로');
    await user.click(screen.getByRole('button', { name: 'cheap1 경로 상세 열기' }));

    const dialog = screen.getByRole('dialog', { name: '경로 상세 팝업' });
    expect(within(dialog).getByText('880,000 sats')).toBeInTheDocument();
    expect(dialog).toHaveTextContent('100 sats');
  });
});
