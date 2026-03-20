import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ExchangeCarfGlobe } from './ExchangeCarfGlobe';
import type { ExchangeCarfInfo } from '../data/carfData';

const MOCK_EXCHANGES: ExchangeCarfInfo[] = [
  {
    id: 'kr',
    name: '업비트',
    shortName: '업비트',
    type: 'korean',
    registeredCountry: '대한민국',
    mapLocation: { label: '서울', focusLabel: '한국', latitude: 37.57, longitude: 126.98 },
    carfGroup: '2027',
    carfDataCollectionStart: '2026-01-01',
    carfFirstExchange: '2027',
    koreaService: true,
    koreaBlocked: false,
    koreaImpact: 'high',
    impactDetail: '',
  },
  {
    id: 'uae',
    name: 'Binance',
    shortName: 'Binance',
    type: 'global',
    registeredCountry: 'UAE',
    mapLocation: { label: '아부다비', focusLabel: 'UAE', latitude: 24.47, longitude: 54.37 },
    carfGroup: '2028',
    carfDataCollectionStart: '2027-01-01',
    carfFirstExchange: '2028',
    koreaService: false,
    koreaBlocked: true,
    koreaImpact: 'medium',
    impactDetail: '',
  },
  {
    id: 'us',
    name: 'Kraken',
    shortName: 'Kraken',
    type: 'global',
    registeredCountry: 'USA',
    mapLocation: { label: '샤이엔', focusLabel: 'USA', latitude: 41.14, longitude: -104.82 },
    carfGroup: '2029',
    carfDataCollectionStart: null,
    carfFirstExchange: '2029',
    koreaService: false,
    koreaBlocked: false,
    koreaImpact: 'low',
    impactDetail: '',
  },
];

// PointerEvent polyfill for jsdom
class MockPointerEvent extends MouseEvent {
  pointerId: number;
  isPrimary: boolean;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init as MouseEventInit);
    this.pointerId = init.pointerId ?? 0;
    this.isPrimary = init.isPrimary ?? false;
  }
}

// --- RAF mock helpers ---
let rafQueue: FrameRequestCallback[] = [];
let rafTime = 0;

function flushRAF(n = 2) {
  for (let i = 0; i < n; i++) {
    rafTime += 16;
    const batch = [...rafQueue];
    rafQueue = [];
    batch.forEach((cb) => cb(rafTime));
  }
}

function getRotation(): [number, number, number] {
  const attr = screen.getByTestId('exchange-globe').getAttribute('data-rotation') ?? '0,0,0';
  return attr.split(',').map(Number) as [number, number, number];
}

function firePointer(type: string, target: Element, x: number, y: number) {
  target.dispatchEvent(
    new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, pointerId: 1, isPrimary: true }),
  );
}

describe('ExchangeCarfGlobe — drag direction & momentum', () => {
  beforeEach(() => {
    rafQueue = [];
    rafTime = 0;
    vi.stubGlobal('PointerEvent', MockPointerEvent);
    // jsdom doesn't implement pointer capture APIs
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('drag RIGHT increases rotation[0] — trackball model (surface follows hand, center moves west)', () => {
    render(
      <ExchangeCarfGlobe
        exchanges={MOCK_EXCHANGES}
        selectedSourceId="kr"
        selectedDestinationId="uae"
      />,
    );
    act(() => flushRAF(1)); // start RAF loop

    const globe = screen.getByTestId('exchange-globe');
    const [r0Before] = getRotation();

    act(() => {
      firePointer('pointerdown', globe, 300, 300);
      firePointer('pointermove', globe, 350, 300); // drag right 50px
      firePointer('pointermove', globe, 400, 300); // drag right 100px total
      firePointer('pointerup', globe, 400, 300);
    });
    act(() => flushRAF(2));

    const [r0After] = getRotation();
    // Trackball: drag right → rotation[0] must INCREASE
    // (surface follows hand: what's to the west comes into view)
    expect(r0After).toBeGreaterThan(r0Before);
  });

  it('drag DOWN decreases rotation[1] — trackball model (drag down → center moves north)', () => {
    render(
      <ExchangeCarfGlobe
        exchanges={MOCK_EXCHANGES}
        selectedSourceId="kr"
        selectedDestinationId="uae"
      />,
    );
    act(() => flushRAF(1));

    const globe = screen.getByTestId('exchange-globe');
    const [, r1Before] = getRotation();

    act(() => {
      firePointer('pointerdown', globe, 300, 200);
      firePointer('pointermove', globe, 300, 300); // drag down 100px
      firePointer('pointerup', globe, 300, 300);
    });
    act(() => flushRAF(2));

    const [, r1After] = getRotation();
    // Trackball: drag down → rotation[1] must DECREASE
    // (center moves north, i.e. northern hemisphere comes into view)
    expect(r1After).toBeLessThan(r1Before);
  });

  it('globe continues spinning after drag release (momentum/inertia)', () => {
    render(
      <ExchangeCarfGlobe
        exchanges={MOCK_EXCHANGES}
        selectedSourceId="kr"
        selectedDestinationId="uae"
      />,
    );
    act(() => flushRAF(1));

    const globe = screen.getByTestId('exchange-globe');

    // Drag to build velocity
    act(() => {
      firePointer('pointerdown', globe, 200, 300);
      firePointer('pointermove', globe, 220, 300);
      firePointer('pointermove', globe, 240, 300);
      firePointer('pointermove', globe, 260, 300);
      firePointer('pointerup', globe, 260, 300);
    });
    act(() => flushRAF(1));
    const [r0AtRelease] = getRotation();

    // Several frames later — momentum should carry the rotation further
    act(() => flushRAF(6));
    const [r0Later] = getRotation();

    // Must have moved significantly beyond the release point
    expect(Math.abs(r0Later - r0AtRelease)).toBeGreaterThan(0.5);
  });
});
