import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { Layout } from './Layout';

describe('Layout branding', () => {
  it('renders Hanip Korean bitcoin route branding with the Hanip logo', () => {
    render(
      <MemoryRouter initialEntries={['/fee']}>
        <Layout />
      </MemoryRouter>,
    );

    expect(screen.getByText('한입 비트코인 경로')).toBeInTheDocument();

    const logo = screen.getByAltText('한입 로고');
    expect(logo).toHaveAttribute('src', '/logos/hanip.png');
  });
});
