import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PolicyPage } from './PolicyPage';

describe('PolicyPage', () => {
  it('renders the globe visualization with the default selected route', () => {
    render(<PolicyPage />);

    expect(screen.getByText('지구본으로 보는 거래소 위치')).toBeInTheDocument();
    expect(screen.getByTestId('exchange-globe')).toBeInTheDocument();
    // 기본 출발지(업비트) 및 도착지(Binance) 선택 목록이 존재
    expect(screen.getAllByRole('combobox').length).toBeGreaterThanOrEqual(2);
  });

  it('updates the highlighted destination details when another global exchange is selected', async () => {
    const user = userEvent.setup();
    render(<PolicyPage />);

    const [, destinationSelect] = screen.getAllByRole('combobox');
    await user.selectOptions(destinationSelect, 'coinbase');

    // 테이블에서 Coinbase 행이 존재
    expect(screen.getAllByText(/Coinbase/i).length).toBeGreaterThan(0);
  });
});
