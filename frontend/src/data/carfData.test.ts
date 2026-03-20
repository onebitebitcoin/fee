import { ALL_EXCHANGES, GLOBAL_EXCHANGES, KOREAN_EXCHANGES } from './carfData';

describe('carfData globe metadata', () => {
  it('provides map coordinates for every exchange in the policy dataset', () => {
    expect(ALL_EXCHANGES).toHaveLength(KOREAN_EXCHANGES.length + GLOBAL_EXCHANGES.length);

    for (const exchange of ALL_EXCHANGES) {
      expect(exchange.mapLocation.label).toBeTruthy();
      expect(exchange.mapLocation.focusLabel).toBeTruthy();
      expect(exchange.mapLocation.latitude).toBeGreaterThanOrEqual(-90);
      expect(exchange.mapLocation.latitude).toBeLessThanOrEqual(90);
      expect(exchange.mapLocation.longitude).toBeGreaterThanOrEqual(-180);
      expect(exchange.mapLocation.longitude).toBeLessThanOrEqual(180);
    }
  });

  it('keeps the Binance globe marker note aligned with the new UAE hub visualization', () => {
    const binance = GLOBAL_EXCHANGES.find((exchange) => exchange.id === 'binance');

    expect(binance?.mapLocation.label).toBe('아부다비, UAE');
    expect(binance?.mapLocation.note).toMatch(/ADGM/);
    expect(binance?.registeredCountry).toBe('UAE (ADGM)');
  });
});
