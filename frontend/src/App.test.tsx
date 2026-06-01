import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import App from './App';

vi.mock('./pages/RouteExplorerPage', () => ({
  RouteExplorerPage: () => <h1>BTC 경로 탐색</h1>,
}));

describe('App', () => {
  it('renders the route explorer page', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'BTC 경로 탐색' })).toBeInTheDocument();
  });
});
