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

// 전체 경로(신원인증 최소화 필터 해제) 상태가 필요한 테스트용 헬퍼
async function renderAndSearchAll() {
  const user = await renderAndSearch();
  await screen.findByText('최적 경로');
  await user.click(screen.getByRole('button', { name: '가장 낮은 수수료' }));
  return user;
}

describe('CheapestPathPage', () => {
  it('does not auto-load results before search', async () => {
    render(
      <BrowserRouter>
        <CheapestPathPage />
      </BrowserRouter>,
    );

    expect(await screen.findByText(/누적 42회/)).toBeInTheDocument();
    expect(screen.queryByText('수수료율 비교 (상위 5개)')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '가장 낮은 수수료' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '신원인증 최소화' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '라이트닝 제외' })).toBeInTheDocument();
    expect(screen.queryByText('검색 버튼을 누르면 경로를 불러옵니다.')).not.toBeInTheDocument();
  });

  it('renders the current dashboard summary for the cheapest route', async () => {
    // 기본값이 non-KYC이므로 cheap2(Lightning)가 best visible path
    await renderAndSearch();

    expect(await screen.findByText('최적 경로')).toBeInTheDocument();
    expect(screen.getByText('수수료율 비교 (상위 5개)')).toBeInTheDocument();
    expect(screen.getByText('cheap2 → 바이낸스 → BitFlower → 개인 지갑')).toBeInTheDocument();
    expect(screen.getAllByText('cheap2').length).toBeGreaterThan(0);
    expect(screen.getAllByText('870,000 sats').length).toBeGreaterThan(0);
    expect(screen.getAllByText('개인 지갑').length).toBeGreaterThan(0);
    expect(screen.getAllByText('KYC').length).toBeGreaterThan(0);
    expect(screen.getAllByText('NON-KYC').length).toBeGreaterThan(0);
  });

  it('filters routes by explicit path dimensions', async () => {
    const user = await renderAndSearchAll();

    await screen.findByText('최적 경로');

    // 필터가 기본 접힘 상태이므로 먼저 열기
    await user.click(screen.getByRole('button', { name: /필터/i }));

    await user.click(screen.getByRole('button', { name: /TRC20/i }));
    expect(screen.getByText('4/6')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /TRC20/i }));
    expect(screen.getByText('6/6')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /라이트닝 네트워크/i }));
    expect(screen.getByText('5/6')).toBeInTheDocument();
  });

  it('updates the selected route detail when a route is chosen', async () => {
    const user = await renderAndSearchAll();

    await screen.findByText('최적 경로');
    await user.click(screen.getAllByRole('button', { name: 'mid2 경로 선택' })[0]);

    const detailRegion = screen.getByRole('region', { name: '선택 경로 상세' });
    expect(within(detailRegion).getAllByText('mid2').length).toBeGreaterThan(0);
    expect(within(detailRegion).getAllByText('900,000 sats').length).toBeGreaterThan(0);
  });

  it('renders service logos for exchanges and lightning providers', async () => {
    const user = await renderAndSearchAll();

    await screen.findByText('최적 경로');

    const binanceLogos = screen.getAllByAltText('binance');
    expect(binanceLogos.length).toBeGreaterThan(0);
    expect(binanceLogos[0]).toHaveAttribute('src', '/logos/binance.png');

    await user.click(screen.getAllByRole('button', { name: 'cheap2 경로 선택' })[0]);

    const detailRegion = screen.getByRole('region', { name: '선택 경로 상세' });
    const providerLogos = within(detailRegion).getAllByAltText('BitFlower');
    expect(providerLogos.length).toBeGreaterThan(0);
    expect(providerLogos[0]).toHaveAttribute('src', '/logos/bitflower.png');
  });


  it('applies the non-KYC shortcut', async () => {
    const user = await renderAndSearch();

    await user.click(screen.getByRole('button', { name: '신원인증 최소화' }));

    expect(screen.getByText('cheap2 → 바이낸스 → BitFlower → 개인 지갑')).toBeInTheDocument();
  });

  it('applies the without-lightning shortcut', async () => {
    const user = await renderAndSearch();

    await user.click(screen.getByRole('button', { name: '라이트닝 제외' }));

    expect(screen.queryByText('cheap2 → 바이낸스 → BitFlower → 개인 지갑')).not.toBeInTheDocument();
    expect(screen.getByText('cheap1 → 바이낸스 → 개인 지갑')).toBeInTheDocument();
  });

  it('switches to reverse sell mode and renders a reversed path', async () => {
    vi.mocked(api.getCheapestPath).mockResolvedValueOnce({
      mode: 'sell',
      amount_btc: 0.01,
      global_exchange: 'binance',
      global_btc_price_usd: 95000,
      usd_krw_rate: 1380,
      total_paths_evaluated: 1,
      available_filters: {
        domestic_withdrawal_networks: ['TRC20'],
        global_exit_options: [{ mode: 'lightning', network: 'Lightning Network' }],
        lightning_exit_providers: ['Strike'],
      },
      best_path: {
        path_id: 'sell-lightning-via-global',
        route_variant: 'lightning_via_global',
        korean_exchange: 'bithumb',
        transfer_coin: 'USDT',
        network: 'TRC20',
        domestic_withdrawal_network: 'TRC20',
        global_exit_mode: 'lightning',
        global_exit_network: 'Lightning Network',
        lightning_exit_provider: 'Strike',
        krw_received: 1280000,
        total_fee_krw: 22000,
        fee_pct: 1.69,
        domestic_kyc_status: 'kyc',
        global_kyc_status: 'kyc',
        exit_service_kyc_status: 'kyc',
        wallet_kyc_status: 'non_kyc',
        breakdown: { total_fee_krw: 22000, components: [{ label: '라이트닝 스왑 수수료', amount_krw: 5000 }] },
      },
      top5: [],
      all_paths: [{
        path_id: 'sell-lightning-via-global',
        route_variant: 'lightning_via_global',
        korean_exchange: 'bithumb',
        transfer_coin: 'USDT',
        network: 'TRC20',
        domestic_withdrawal_network: 'TRC20',
        global_exit_mode: 'lightning',
        global_exit_network: 'Lightning Network',
        lightning_exit_provider: 'Strike',
        krw_received: 1280000,
        total_fee_krw: 22000,
        fee_pct: 1.69,
        domestic_kyc_status: 'kyc',
        global_kyc_status: 'kyc',
        exit_service_kyc_status: 'kyc',
        wallet_kyc_status: 'non_kyc',
        breakdown: { total_fee_krw: 22000, components: [{ label: '라이트닝 스왑 수수료', amount_krw: 5000 }] },
      }],
      disabled_paths: [],
    } as never);

    const user = userEvent.setup();
    render(
      <BrowserRouter>
        <CheapestPathPage />
      </BrowserRouter>,
    );

    await user.click(screen.getByRole('button', { name: '비트코인 팔 때' }));
    await user.click(screen.getByRole('button', { name: '매도 경로 검색' }));
    await user.click(await screen.findByRole('button', { name: '가장 낮은 수수료' }));

    expect(await screen.findByText('비트코인 팔 때 경로')).toBeInTheDocument();
    expect(screen.getByText('개인 지갑 → Strike → 바이낸스 → 빗썸')).toBeInTheDocument();
    expect(screen.getByText('예상 KRW 수령')).toBeInTheDocument();
    expect(screen.getAllByText('1,280,000 KRW').length).toBeGreaterThan(0);
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
