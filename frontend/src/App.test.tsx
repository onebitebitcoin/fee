import { render, screen } from '@testing-library/react';
import { MemoryRouter, Outlet } from 'react-router-dom';
import { vi } from 'vitest';

import App from './App';

vi.mock('./components/Layout', () => ({
  Layout: () => <div><Outlet /></div>,
}));

vi.mock('./pages/CheapestPathPage', () => ({
  CheapestPathPage: () => <h1>최적 경로 페이지</h1>,
}));

vi.mock('./pages/TickersPage', () => ({
  TickersPage: () => <h1>시세 페이지</h1>,
}));

vi.mock('./pages/RunsPage', () => ({
  RunsPage: () => <h1>이력 페이지</h1>,
}));

describe('App routing', () => {
  it('redirects the root path to /cheapest-path', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '최적 경로 페이지' })).toBeInTheDocument();
  });

  it('redirects unknown paths to /cheapest-path', async () => {
    render(
      <MemoryRouter initialEntries={['/missing']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '최적 경로 페이지' })).toBeInTheDocument();
  });

  it('redirects legacy /overview to /cheapest-path', async () => {
    render(
      <MemoryRouter initialEntries={['/overview']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '최적 경로 페이지' })).toBeInTheDocument();
  });
});
