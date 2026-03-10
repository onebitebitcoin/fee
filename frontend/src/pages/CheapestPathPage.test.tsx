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
  it('renders best path as single inline row after loading', async () => {
    render(
      <BrowserRouter>
        <CheapestPathPage />
      </BrowserRouter>,
    );

    expect(await screen.findByText('최적 경로')).toBeInTheDocument();
    // 최적 경로가 한 줄로 표시됨: upbit, binance 별도 요소
    expect(screen.getByText('upbit')).toBeInTheDocument();
    expect(screen.getAllByText('binance').length).toBeGreaterThan(0);
  });

  it('shows inline summary stats (no MetricCards)', async () => {
    render(
      <BrowserRouter>
        <CheapestPathPage />
      </BrowserRouter>,
    );

    await screen.findByText('최적 경로');
    // MetricCard 없이 인라인 텍스트로 평가 경로 수 표시
    expect(screen.getByText('평가 경로')).toBeInTheDocument();
    expect(screen.getByText('USD/KRW')).toBeInTheDocument();
    expect(screen.getByText('BTC/USD')).toBeInTheDocument();
  });

  it('renders top paths as a table with correct columns', async () => {
    render(
      <BrowserRouter>
        <CheapestPathPage />
      </BrowserRouter>,
    );

    await screen.findByText('최적 경로');

    // 테이블 헤더 확인 (테이블 스코프)
    const table = screen.getByRole('table');
    const header = within(table).getAllByRole('columnheader');
    const headerTexts = header.map((h) => h.textContent);
    expect(headerTexts).toContain('경로');
    expect(headerTexts).toContain('코인/네트워크');
    expect(headerTexts).toContain('받는 BTC');
    expect(headerTexts).toContain('수수료');
    expect(headerTexts).toContain('비율');
  });

  it('sorts the top paths by lowest total fee by default', async () => {
    render(
      <BrowserRouter>
        <CheapestPathPage />
      </BrowserRouter>,
    );

    await screen.findByText('최적 경로');

    // 기본 정렬(lowest_fee_krw): cheap1(2000) → cheap2(2500) 순
    // 테이블 내 행 텍스트 순서 확인
    const table = screen.getByRole('table');
    const tableText = table.textContent ?? '';
    const cheap1Pos = tableText.indexOf('cheap1');
    const cheap2Pos = tableText.indexOf('cheap2');
    expect(cheap1Pos).toBeGreaterThan(-1);
    expect(cheap1Pos).toBeLessThan(cheap2Pos);
  });

  it('can switch sort order to highest_btc', async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <CheapestPathPage />
      </BrowserRouter>,
    );

    await screen.findByText('최적 경로');

    await user.selectOptions(screen.getByDisplayValue('총 수수료 낮은 순'), 'highest_btc');

    // highest_btc 정렬: highbtc(0.0099)가 가장 먼저 나타나야 함
    const table = screen.getByRole('table');
    const tableText = table.textContent ?? '';
    const highbtcPos = tableText.indexOf('highbtc');
    const cheap1Pos = tableText.indexOf('cheap1');
    expect(highbtcPos).toBeGreaterThan(-1);
    expect(highbtcPos).toBeLessThan(cheap1Pos);
  });

  it('shows selected route details when a korean exchange is selected', async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <CheapestPathPage />
      </BrowserRouter>,
    );

    await screen.findByText('최적 경로');

    const exchangeSelect = screen.getByDisplayValue('거래소 선택');
    await user.selectOptions(exchangeSelect, 'cheap2');

    expect(screen.getByText('#3위')).toBeInTheDocument();
  });
});
