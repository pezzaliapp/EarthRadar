import { describe, expect, it } from 'vitest';

describe('guardia quota FlyItalyADSB nei test (src/test/setup.ts)', () => {
  it('nessun test può raggiungere il gateway aerei di produzione o il provider', async () => {
    await expect(
      fetch('https://aircraft.alessandropezzali.it/v1/aircraft?lat=45&lon=9&r=150'),
    ).rejects.toThrow(/blocked/);
    await expect(fetch('https://api.flyitalyadsb.com/v2/lat/45/lon/9/dist/10')).rejects.toThrow(
      /blocked/,
    );
  });
});
