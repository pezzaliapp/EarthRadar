// @vitest-environment node
import { describe, expect, it } from 'vitest';

/** Esito di un fetch: il messaggio d'errore, oppure "RAGGIUNTA" se la rete ha risposto. */
async function attempt(url: string): Promise<string> {
  try {
    await fetch(url);
  } catch (err) {
    return String(err);
  }
  return 'RAGGIUNTA';
}

describe('guardia di rete dei test', () => {
  // Attiva sia con `npm test` del gateway (test/setup.ts) sia dalla radice (src/test/setup.ts).
  it('qualunque fetch verso provider o gateway di produzione fallisce subito', async () => {
    expect(await attempt('https://api.flyitalyadsb.com/v2/lat/45/lon/9/dist/10')).toMatch(
      /bloccata|blocked/,
    );
    expect(await attempt('https://aircraft.alessandropezzali.it/v1/health')).toMatch(
      /bloccata|blocked/,
    );
  });
});
