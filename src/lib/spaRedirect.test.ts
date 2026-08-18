import { describe, expect, it } from 'vitest';
import { encodeSpaFallbackUrl, decodeSpaFallbackPath } from './spaRedirect';

const ORIGIN = 'https://www.alessandropezzali.it';

describe('encodeSpaFallbackUrl (404.html)', () => {
  it('riscrive una route diretta preservando la base /EarthRadar/', () => {
    const url = encodeSpaFallbackUrl(ORIGIN, '/EarthRadar/anomaly');
    expect(url).toBe('https://www.alessandropezzali.it/EarthRadar/?/anomaly');
  });

  it('preserva eventuali query string spostandole dopo la route', () => {
    const url = encodeSpaFallbackUrl(ORIGIN, '/EarthRadar/anomaly', '?foo=1');
    expect(url).toBe('https://www.alessandropezzali.it/EarthRadar/?/anomaly&foo=1');
  });
});

describe('decodeSpaFallbackPath (index.html)', () => {
  it('ricostruisce il path pulito per la route Anomalia', () => {
    // Dopo il redirect, il browser è su /EarthRadar/?/anomaly
    const path = decodeSpaFallbackPath('/EarthRadar/', '?/anomaly');
    expect(path).toBe('/EarthRadar/anomaly');
  });

  it('non tocca un load normale (nessun prefisso ?/)', () => {
    expect(decodeSpaFallbackPath('/EarthRadar/', '')).toBeNull();
    expect(decodeSpaFallbackPath('/EarthRadar/anomaly', '')).toBeNull();
  });

  it('non tocca i deep-link ?lat=&lon= (query normale)', () => {
    expect(decodeSpaFallbackPath('/EarthRadar/', '?lat=44.7&lon=10.6')).toBeNull();
  });
});

describe('roundtrip 404 → index (apertura diretta / refresh di /anomaly)', () => {
  it('converge sulla route originale pulita', () => {
    // 1) Utente apre direttamente /EarthRadar/anomaly → 404.html
    const redirect = encodeSpaFallbackUrl(ORIGIN, '/EarthRadar/anomaly');
    // 2) Browser va su /EarthRadar/?/anomaly → estraiamo pathname/search
    const u = new URL(redirect);
    expect(u.pathname).toBe('/EarthRadar/');
    expect(u.search).toBe('?/anomaly');
    // 3) index.html decodifica → route pulita ripristinata
    const restored = decodeSpaFallbackPath(u.pathname, u.search);
    expect(restored).toBe('/EarthRadar/anomaly');
  });

  it('roundtrip con query preservata', () => {
    const redirect = encodeSpaFallbackUrl(ORIGIN, '/EarthRadar/anomaly', '?x=1');
    const u = new URL(redirect);
    const restored = decodeSpaFallbackPath(u.pathname, u.search);
    expect(restored).toBe('/EarthRadar/anomaly?x=1');
  });
});
