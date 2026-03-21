import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CarfBadge } from './CarfBadge';

describe('CarfBadge', () => {
  it('renders nothing when carfFirstExchange is null', () => {
    const { container } = render(<CarfBadge carfFirstExchange={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when carfFirstExchange is undefined', () => {
    const { container } = render(<CarfBadge carfFirstExchange={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders red badge for year <= current year (2026)', () => {
    render(<CarfBadge carfFirstExchange="2026" />);
    const badge = screen.getByText('CARF 2026');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toMatch(/text-bnb-red/);
  });

  it('renders red badge for 2027 (data collection starts from 2026)', () => {
    render(<CarfBadge carfFirstExchange="2027" />);
    const badge = screen.getByText('CARF 2027');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toMatch(/text-bnb-red/);
  });

  it('renders orange badge for 2028', () => {
    render(<CarfBadge carfFirstExchange="2028" />);
    const badge = screen.getByText('CARF 2028');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toMatch(/text-brand-400/);
  });

  it('renders grey badge for 2029+', () => {
    render(<CarfBadge carfFirstExchange="2029" />);
    const badge = screen.getByText('CARF 2029');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toMatch(/text-bnb-muted/);
  });
});
