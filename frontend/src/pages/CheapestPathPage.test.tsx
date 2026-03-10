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
      maintenance_checked_at: '2026-03-10T00:00:00',
      best_path: {
        korean_exchange: 'upbit',
        transfer_coin: 'BTC',
        network: 'Bitcoin',
        btc_received: 0.0065,
        btc_received_usd: 617.5,
        total_fee_krw: 15000,
        fee_pct: 1.5,
        breakdown: {
          total_fee_krw: 15000,
          components: [
            { label: '국내 매수 수수료', amount_krw: 5000, rate_pct: 0.5 },
            { label: 'BTC 출금 수수료', amount_krw: 10000, amount_text: '0.0001 BTC' },
          ],
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
          breakdown: {
            total_fee_krw: 9000,
            components: [
              { label: '국내 매수 수수료', amount_krw: 3000, rate_pct: 0.3 },
              { label: 'BTC 출금 수수료', amount_krw: 6000, amount_text: '0.00006 BTC' },
            ],
          },
        },
        {
          korean_exchange: 'cheap1',
          transfer_coin: 'USDT',
          network: 'TRC20',
          btc_received: 0.0088,
          btc_received_usd: 836,
          total_fee_krw: 2000,
          fee_pct: 0.2,
          breakdown: {
            total_fee_krw: 2000,
            components: [
              { label: '국내 매수 수수료', amount_krw: 500, rate_pct: 0.05 },
              { label: 'USDT 출금 수수료', amount_krw: 1000, amount_text: '1 USDT' },
              { label: '해외 BTC 매수 수수료', amount_krw: 500, rate_pct: 0.05, amount_text: '0.4 USDT' },
            ],
          },
        },
        {
          korean_exchange: 'cheap2',
          transfer_coin: 'USDT',
          network: 'TRC20',
          btc_received: 0.0087,
          btc_received_usd: 827,
          total_fee_krw: 2500,
          fee_pct: 0.25,
          breakdown: {
            total_fee_krw: 2500,
            components: [
              { label: '국내 매수 수수료', amount_krw: 700, rate_pct: 0.07 },
              { label: 'USDT 출금 수수료', amount_krw: 1100, amount_text: '1.1 USDT' },
              { label: '해외 BTC 매수 수수료', amount_krw: 700, rate_pct: 0.07, amount_text: '0.5 USDT' },
            ],
          },
        },
        {
          korean_exchange: 'mid1',
          transfer_coin: 'BTC',
          network: 'Bitcoin',
          btc_received: 0.0091,
          btc_received_usd: 864,
          total_fee_krw: 5000,
          fee_pct: 0.5,
          breakdown: {
            total_fee_krw: 5000,
            components: [
              { label: '국내 매수 수수료', amount_krw: 2000, rate_pct: 0.2 },
              { label: 'BTC 출금 수수료', amount_krw: 3000, amount_text: '0.00003 BTC' },
            ],
          },
        },
        {
          korean_exchange: 'mid2',
          transfer_coin: 'BTC',
          network: 'Bitcoin',
          btc_received: 0.009,
          btc_received_usd: 855,
          total_fee_krw: 6000,
          fee_pct: 0.6,
          breakdown: {
            total_fee_krw: 6000,
            components: [
              { label: '국내 매수 수수료', amount_krw: 2500, rate_pct: 0.25 },
              { label: 'BTC 출금 수수료', amount_krw: 3500, amount_text: '0.000035 BTC' },
            ],
          },
        },
        {
          korean_exchange: 'expensive',
          transfer_coin: 'BTC',
          network: 'Bitcoin',
          btc_received: 0.008,
          btc_received_usd: 760,
          total_fee_krw: 12000,
          fee_pct: 1.2,
          breakdown: {
            total_fee_krw: 12000,
            components: [
              { label: '국내 매수 수수료', amount_krw: 4000, rate_pct: 0.4 },
              { label: 'BTC 출금 수수료', amount_krw: 8000, amount_text: '0.00008 BTC' },
            ],
          },
        },
      ],
      disabled_paths: [],
    }),
  },
}));

describe('CheapestPathPage', () => {
  it('renders best path summary after loading', async () => {
    render(
      <BrowserRouter>
        <CheapestPathPage />
      </BrowserRouter>,
    );

    expect(await screen.findByText('최적 경로')).toBeInTheDocument();
    // 새 UI: upbit과 binance가 별도 span 요소에 렌더링됨
    expect(screen.getByText('upbit')).toBeInTheDocument();
    expect(screen.getAllByText('binance').length).toBeGreaterThan(0);
  });

  it('sorts the top paths by lowest total fee by default and can switch sorting', async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <CheapestPathPage />
      </BrowserRouter>,
    );

    await screen.findByText('최적 경로');

    // 기본 정렬(lowest_fee_krw): cheap1(2000), cheap2(2500), mid1(5000), ...
    // 상위 경로 섹션에서 첫 번째 항목이 cheap1이어야 함
    const topSection = screen.getByText('상위 경로').closest('div')!.parentElement!;
    const pathItems = within(topSection).getAllByText(/cheap1|cheap2|mid1|mid2|highbtc|expensive/);
    expect(pathItems[0].textContent).toContain('cheap1');

    // highest_btc 정렬로 변경: highbtc(0.0099)가 1위
    const sortSelect = screen.getByDisplayValue('총 수수료 낮은 순');
    await user.selectOptions(sortSelect, 'highest_btc');

    const pathItemsAfter = within(topSection).getAllByText(/cheap1|cheap2|mid1|mid2|highbtc|expensive/);
    expect(pathItemsAfter[0].textContent).toContain('highbtc');
  });

  it('shows rank number badges for the top paths', async () => {
    render(
      <BrowserRouter>
        <CheapestPathPage />
      </BrowserRouter>,
    );

    await screen.findByText('최적 경로');
    // 새 UI: 이모지 대신 숫자 배지 사용 - 1, 2, 3 숫자가 배지로 표시됨
    const topSection = screen.getByText('상위 경로').closest('div')!.parentElement!;
    const badges = within(topSection).getAllByText(/^[1-5]$/);
    expect(badges.length).toBeGreaterThanOrEqual(3);
  });

  it('shows selected route details when a korean exchange is selected', async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <CheapestPathPage />
      </BrowserRouter>,
    );

    await screen.findByText('최적 경로');

    // 거래소 선택 드롭다운 찾기
    const exchangeSelect = screen.getByDisplayValue('거래소 선택');
    await user.selectOptions(exchangeSelect, 'cheap2');

    // cheap2 선택 후 상세 정보가 표시됨
    expect(screen.getByText('#3위')).toBeInTheDocument();
  });

  it('shows fee breakdown toggle button for best path', async () => {
    render(
      <BrowserRouter>
        <CheapestPathPage />
      </BrowserRouter>,
    );

    await screen.findByText('최적 경로');

    // 계산 근거 토글 버튼이 있어야 함
    const toggleBtns = screen.getAllByText(/계산 근거/);
    expect(toggleBtns.length).toBeGreaterThan(0);
  });
});
