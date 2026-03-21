import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { vi } from 'vitest';

import { api } from '../lib/api';
import { CheapestPathPage } from './CheapestPathPage';

vi.mock('../lib/api', () => ({
  api: {
    getAccessCount: vi.fn().mockResolvedValue({ total: 42, today: 3 }),
    getCheapestPath: vi.fn().mockResolvedValue({
      mode: 'buy',
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
        lightning_exit_providers: ['BitFlower'],
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
        domestic_kyc_status: 'kyc',
        global_kyc_status: 'kyc',
        wallet_kyc_status: 'non_kyc',
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
          domestic_kyc_status: 'kyc',
          global_kyc_status: 'kyc',
          wallet_kyc_status: 'non_kyc',
        },
        {
          path_id: 'cheap2-trc20-lightning',
          korean_exchange: 'cheap2',
          transfer_coin: 'USDT',
          network: 'TRC20',
          domestic_withdrawal_network: 'TRC20',
          global_exit_mode: 'lightning',
          global_exit_network: 'Lightning Network',
          lightning_exit_provider: 'BitFlower',
          path_type: 'lightning_exit',
          btc_received: 0.0087,
          btc_received_usd: 827,
          total_fee_krw: 2500,
          fee_pct: 0.25,
          breakdown: { total_fee_krw: 2500, components: [{ label: '국내 매수 수수료', amount_krw: 700, rate_pct: 0.07 }] },
          domestic_kyc_status: 'kyc',
          global_kyc_status: 'kyc',
          exit_service_kyc_status: 'non_kyc',
          wallet_kyc_status: 'non_kyc',
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

async function renderAndSearch() {
  const user = userEvent.setup();
  render(
    <BrowserRouter>
      <CheapestPathPage />
    </BrowserRouter>,
  );
  await user.click(screen.getByRole('button', { name: '검색' }));
  return user;
}

// 전체 경로 상태가 필요한 테스트용 헬퍼 (non_kyc + binance에서 전체 6경로 통과)
async function renderAndSearchAll() {
  const user = await renderAndSearch();
  await screen.findByText('최적 경로');
  return user;
}

describe('CheapestPathPage', () => {
  it('auto-loads results on page load without clicking search button', async () => {
    render(
      <BrowserRouter>
        <CheapestPathPage />
      </BrowserRouter>,
    );

    // 검색 버튼 클릭 없이 결과가 자동 로딩되어야 함
    expect(await screen.findByText('최적 경로')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '최소 KYC' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '최소 수수료' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '라이트닝 제외' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '라이트닝 포함' })).toBeInTheDocument();
  });

  it('shows a progress bar while the cheapest path is loading', async () => {
    let resolveRequest: ((value: Awaited<ReturnType<typeof api.getCheapestPath>>) => void) | undefined;
    const pendingRequest = new Promise<Awaited<ReturnType<typeof api.getCheapestPath>>>((resolve) => {
      resolveRequest = resolve;
    });

    vi.mocked(api.getCheapestPath).mockImplementationOnce(() => pendingRequest);

    render(
      <BrowserRouter>
        <CheapestPathPage />
      </BrowserRouter>,
    );

    expect(screen.getByRole('progressbar', { name: '최적 경로 로딩' })).toBeInTheDocument();
    expect(screen.getByText('최적 경로 계산 중')).toBeInTheDocument();

    resolveRequest?.({
      mode: 'buy',
      amount_krw: 1000000,
      global_exchange: 'binance',
      global_btc_price_usd: 95000,
      usd_krw_rate: 1380,
      total_paths_evaluated: 0,
      best_path: null,
      top5: [],
      all_paths: [],
      disabled_paths: [],
      available_filters: {
        domestic_withdrawal_networks: [],
        global_exit_options: [],
        lightning_exit_providers: [],
      },
    });

    expect(await screen.findByRole('button', { name: '최소 KYC' })).toBeInTheDocument();
  });

  it('renders the current dashboard summary for the cheapest route', async () => {
    // CARF 미발효 글로벌 거래소(binance, carfFirstExchange=2028)를 허용하므로
    // 온체인 cheap1(2000원)이 라이트닝 cheap2(2500원)보다 낮은 수수료로 best visible path
    await renderAndSearch();

    expect(await screen.findByText('최적 경로')).toBeInTheDocument();
    expect(screen.getByText('cheap1 → 바이낸스 → 개인 지갑')).toBeInTheDocument();
    expect(screen.getAllByText('cheap1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('880,000 sats').length).toBeGreaterThan(0);
    // 수수료 3분류 표시 확인
    expect(screen.getByText('거래 수수료')).toBeInTheDocument();
    expect(screen.getByText('출금 수수료')).toBeInTheDocument();
    expect(screen.getByText('스왑 수수료')).toBeInTheDocument();
  });


  it('expands another route inline when a route is chosen', async () => {
    const user = await renderAndSearchAll();

    await screen.findByText('최적 경로');
    const mid2RowLabel = screen.getAllByText('mid2').find((element) => element.closest('tr'));
    expect(mid2RowLabel).toBeTruthy();
    await user.click(mid2RowLabel!.closest('tr') as HTMLElement);

    expect(screen.queryByRole('region', { name: '선택 경로 상세' })).not.toBeInTheDocument();
    expect(screen.getAllByText('900,000 sats').length).toBeGreaterThan(0);
    expect(screen.getAllByText('수수료율 0.250%').length).toBeGreaterThan(0);
  });

  it('shows per-step fee rates when another route is expanded', async () => {
    const user = await renderAndSearchAll();

    await screen.findByText('최적 경로');

    const mid1RowLabel = screen.getAllByText('mid1').find((element) => element.closest('tr'));
    expect(mid1RowLabel).toBeTruthy();

    await user.click(mid1RowLabel!.closest('tr') as HTMLElement);

    expect(screen.getAllByText('수수료율 0.200%').length).toBeGreaterThan(0);
  });


  it('renders service logos for exchanges and lightning providers', async () => {
    const user = await renderAndSearchAll();

    await screen.findByText('최적 경로');

    const binanceLogos = screen.getAllByAltText('binance');
    expect(binanceLogos.length).toBeGreaterThan(0);
    expect(binanceLogos[0]).toHaveAttribute('src', '/logos/binance.png');

    const cheap2RowLabel = screen.getAllByText('cheap2').find((element) => element.closest('tr'));
    expect(cheap2RowLabel).toBeTruthy();
    await user.click(cheap2RowLabel!.closest('tr') as HTMLElement);

    const providerLogos = screen.getAllByAltText('BitFlower');
    expect(providerLogos.length).toBeGreaterThan(0);
    expect(providerLogos[0]).toHaveAttribute('src', '/logos/bitflower.png');
  });


  it('applies the non-KYC shortcut', async () => {
    const user = await renderAndSearch();

    await user.click(screen.getByRole('button', { name: '최소 KYC' }));

    // CARF 미발효 글로벌 거래소(binance, carfFirstExchange=2028)이므로
    // 온체인 KYC 경로(cheap1)도 허용 → cheap1이 저렴하므로 최상위 best path
    expect(screen.getByText('cheap1 → 바이낸스 → 개인 지갑')).toBeInTheDocument();
    // 라이트닝 경로(cheap2)도 필터 통과하므로 목록에 존재
    expect(screen.getAllByText('cheap2').length).toBeGreaterThan(0);
  });

  it('applies the without-lightning shortcut', async () => {
    const user = await renderAndSearch();

    await user.click(screen.getByRole('button', { name: '라이트닝 제외' }));

    expect(screen.queryByText('cheap2 → 바이낸스 → BitFlower → 개인 지갑')).not.toBeInTheDocument();
    expect(screen.getByText('cheap1 → 바이낸스 → 개인 지갑')).toBeInTheDocument();
  });

  it('opens a mobile route detail popup and shows a vertical fee-aware timeline', async () => {
    const user = await renderAndSearchAll();

    await screen.findByText('최적 경로');
    await user.click(screen.getByRole('button', { name: 'cheap1 경로 상세 열기' }));

    const dialog = screen.getByRole('dialog', { name: '경로 상세 팝업' });
    expect(within(dialog).getByLabelText('모바일 경로 타임라인')).toBeInTheDocument();
    expect(within(dialog).getAllByText('880,000 sats').length).toBeGreaterThan(0);
    expect(dialog).toHaveTextContent('단계 수수료');
    expect(dialog).toHaveTextContent('500 KRW');
    expect(dialog).toHaveTextContent('100 KRW');
    expect(screen.queryByText('자세히 보기')).not.toBeInTheDocument();
  });
});
