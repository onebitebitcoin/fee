import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { vi } from 'vitest';

import { ExchangeStatusPage } from './ExchangeStatusPage';

vi.mock('../lib/api', () => ({
  api: {
    getExchangeStatus: vi.fn().mockResolvedValue({
      exchanges: [
        {
          exchange: 'upbit',
          type: 'exchange',
          withdrawal_rows: [
            { coin: 'BTC', network_label: 'Bitcoin', fee: 0.0003, fee_krw: 41400, enabled: true, source: 'realtime_api' },
            { coin: 'BTC', network_label: 'Lightning', fee: 0.000001, fee_krw: 138, enabled: true, source: 'realtime_api' },
            { coin: 'USDT', network_label: 'TRC20', fee: 1, fee_krw: 1380, enabled: true, source: 'scraping' },
            { coin: 'USDT', network_label: 'ERC20', fee: 10, fee_krw: 13800, enabled: false, source: 'scraping' },
          ],
          network_status: { status: 'ok', suspended_networks: [], checked_at: 1710000000 },
          scrape_status: { url: 'https://upbit.com/service_center/notice', status: 'ok', last_crawled_at: 1710000000, error_message: null },
          notices: [
            { title: '업비트 서비스 점검 안내', url: 'https://upbit.com/notice/1', published_at: null },
            { title: 'BTC 입출금 재개 안내', url: 'https://upbit.com/notice/2', published_at: null },
          ],
        },
        {
          exchange: 'bithumb',
          type: 'exchange',
          withdrawal_rows: [
            { coin: 'BTC', network_label: 'Bitcoin', fee: 0.001, fee_krw: 138000, enabled: true, source: 'scraping' },
          ],
          network_status: {
            status: 'maintenance',
            suspended_networks: [{ coin: 'ETH', network: 'ERC20', status: 'maintenance', reason: '점검 중' }],
            checked_at: 1710000000,
          },
          scrape_status: { url: 'https://www.bithumb.com/react/notice/list', status: 'error', last_crawled_at: 1710000000, error_message: '스크래핑 실패' },
          notices: [],
        },
      ],
      lightning_services: [
        {
          exchange: 'Boltz',
          type: 'lightning',
          withdrawal_rows: [
            { coin: 'BTC', network_label: 'Lightning Network', fee_pct: 0.5, fee_fixed_sat: 0, enabled: true, source: 'realtime_api' },
          ],
          network_status: { status: 'ok', suspended_networks: [], checked_at: null },
          scrape_status: { url: 'https://boltz.exchange', status: 'ok', last_crawled_at: 1710000000, error_message: null },
          notices: [],
        },
      ],
    }),
  },
}));

describe('ExchangeStatusPage', () => {
  it('renders all exchange and lightning nodes', async () => {
    render(
      <BrowserRouter>
        <ExchangeStatusPage />
      </BrowserRouter>,
    );

    expect(await screen.findByText('거래소 현황')).toBeInTheDocument();
    expect(screen.getByText('3개 노드')).toBeInTheDocument();
    // upbit shown (fmtEx transforms exchange name)
    expect(screen.getAllByText(/upbit|Upbit|업비트/i).length).toBeGreaterThan(0);
    // bithumb shown
    expect(screen.getAllByText(/bithumb|Bithumb|빗썸/i).length).toBeGreaterThan(0);
    // lightning service shown
    expect(screen.getByText('Boltz')).toBeInTheDocument();
  });

  it('shows top 3 networks and expand button for node with more than 3', async () => {
    render(
      <BrowserRouter>
        <ExchangeStatusPage />
      </BrowserRouter>,
    );

    await screen.findByText('거래소 현황');

    // upbit has 4 rows → should show expand button
    expect(screen.getByRole('button', { name: /1개 더 보기/i })).toBeInTheDocument();
  });

  it('expands hidden networks when expand button is clicked', async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <ExchangeStatusPage />
      </BrowserRouter>,
    );

    await screen.findByText('거래소 현황');

    const expandBtn = screen.getByRole('button', { name: /1개 더 보기/i });
    await user.click(expandBtn);

    expect(screen.getByRole('button', { name: /접기/i })).toBeInTheDocument();
  });

  it('shows suspended network details for bithumb', async () => {
    render(
      <BrowserRouter>
        <ExchangeStatusPage />
      </BrowserRouter>,
    );

    await screen.findByText('거래소 현황');
    expect(screen.getByText(/ETH.*ERC20.*점검 중/)).toBeInTheDocument();
  });

  it('shows notices toggle for upbit with notices', async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <ExchangeStatusPage />
      </BrowserRouter>,
    );

    await screen.findByText('거래소 현황');

    const noticeBtn = screen.getByRole('button', { name: /최신 공지 2건/i });
    expect(noticeBtn).toBeInTheDocument();

    await user.click(noticeBtn);
    expect(screen.getByText('업비트 서비스 점검 안내')).toBeInTheDocument();
    expect(screen.getByText('BTC 입출금 재개 안내')).toBeInTheDocument();
  });

  it('filters nodes by name', async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <ExchangeStatusPage />
      </BrowserRouter>,
    );

    await screen.findByText('거래소 현황');

    const filterInput = screen.getByPlaceholderText(/이름 필터/i);
    await user.type(filterInput, 'Boltz');

    expect(screen.getByText('1개 노드')).toBeInTheDocument();
    expect(screen.getByText('Boltz')).toBeInTheDocument();
  });

  it('shows fee in KRW', async () => {
    render(
      <BrowserRouter>
        <ExchangeStatusPage />
      </BrowserRouter>,
    );

    await screen.findByText('거래소 현황');
    // BTC fee_krw: 41400 → ₩41,400
    expect(screen.getAllByText('₩41,400').length).toBeGreaterThan(0);
  });

  it('shows Lightning badge for lightning service nodes', async () => {
    render(
      <BrowserRouter>
        <ExchangeStatusPage />
      </BrowserRouter>,
    );

    await screen.findByText('거래소 현황');
    expect(screen.getByText('LN')).toBeInTheDocument();
  });
});
