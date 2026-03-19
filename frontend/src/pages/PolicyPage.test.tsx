import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PolicyPage } from './PolicyPage';

describe('PolicyPage', () => {
  it('renders the globe visualization with the default selected route', () => {
    render(<PolicyPage />);

    expect(screen.getByText('지구본으로 보는 거래소 위치')).toBeInTheDocument();
    expect(screen.getByTestId('exchange-globe')).toBeInTheDocument();

    const selectedRoute = screen.getByTestId('selected-route-summary');
    expect(within(selectedRoute).getByText('업비트')).toBeInTheDocument();
    expect(within(selectedRoute).getByText('Binance')).toBeInTheDocument();
    expect(within(selectedRoute).getByText('아부다비, UAE')).toBeInTheDocument();
    expect(within(selectedRoute).getAllByText(/2026-01-01 수집 · 2027 첫 교환/).length).toBeGreaterThan(0);
  });

  it('updates the highlighted destination details when another global exchange is selected', async () => {
    const user = userEvent.setup();
    render(<PolicyPage />);

    const [, destinationSelect] = screen.getAllByRole('combobox');
    await user.selectOptions(destinationSelect, 'coinbase');

    const selectedRoute = screen.getByTestId('selected-route-summary');
    expect(within(selectedRoute).getByText('Coinbase')).toBeInTheDocument();
    expect(within(selectedRoute).getByText('오스틴, 미국')).toBeInTheDocument();
    expect(within(selectedRoute).getByText(/수집 시기 미정 · 2029 첫 교환/)).toBeInTheDocument();
  });
});
