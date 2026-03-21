import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, beforeEach } from 'vitest';

import { PolicyPage } from './PolicyPage';

vi.mock('../lib/api', () => ({
  api: {
    getCARFExchanges: vi.fn().mockResolvedValue({
      exchanges: [
        {
          id: 'upbit', name: '업비트', shortName: '업비트', type: 'korean',
          registeredCountry: '대한민국', carfGroup: '2027',
          carfDataCollectionStart: '2026-01-01', carfFirstExchange: '2027',
          koreaService: true, koreaBlocked: false, koreaImpact: 'high',
          impactDetail: '한국 법인',
          mapLocation: { label: '서울', latitude: 37.5, longitude: 126.9, focusLabel: '본사' },
        },
        {
          id: 'binance', name: 'Binance', shortName: 'Binance', type: 'global',
          registeredCountry: 'UAE', carfGroup: '2028',
          carfDataCollectionStart: '2027-01-01', carfFirstExchange: '2028',
          koreaService: false, koreaBlocked: true, koreaImpact: 'medium',
          impactDetail: 'UAE 법인',
          mapLocation: { label: '두바이', latitude: 25.2, longitude: 55.3, focusLabel: '본사' },
          travelRuleKorea: 'compatible',
        },
        {
          id: 'coinbase', name: 'Coinbase', shortName: 'Coinbase', type: 'global',
          registeredCountry: '미국', carfGroup: '2029',
          carfDataCollectionStart: null, carfFirstExchange: '2029',
          koreaService: false, koreaBlocked: false, koreaImpact: 'low',
          impactDetail: '미국 법인',
          mapLocation: { label: '샌프란시스코', latitude: 37.7, longitude: -122.4, focusLabel: '본사' },
          travelRuleKorea: 'compatible',
        },
      ],
    }),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PolicyPage', () => {
  it('renders the globe visualization with the default selected route', async () => {
    render(<PolicyPage />);

    await waitFor(() => {
      expect(screen.getByText('지구본으로 보는 거래소 위치')).toBeInTheDocument();
    });
    expect(screen.getByTestId('exchange-globe')).toBeInTheDocument();
    expect(screen.getAllByRole('combobox').length).toBeGreaterThanOrEqual(2);
  });

  it('updates the highlighted destination details when another global exchange is selected', async () => {
    const user = userEvent.setup();
    render(<PolicyPage />);

    await waitFor(() => {
      expect(screen.getAllByRole('combobox').length).toBeGreaterThanOrEqual(2);
    });

    const [, destinationSelect] = screen.getAllByRole('combobox');
    await user.selectOptions(destinationSelect, 'coinbase');

    expect(screen.getAllByText(/Coinbase/i).length).toBeGreaterThan(0);
  });
});
