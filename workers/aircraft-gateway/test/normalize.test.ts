// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  InvalidPayloadError,
  isPrivacyRestricted,
  mapPositionSource,
  normalizeAdsbLolAircraft,
  normalizeAdsbLolResponse,
} from '../src/normalize.ts';
import fixture from './fixtures/adsblol-point.json';

function byHex(list: { icao24: string }[], hex: string) {
  return list.find((a) => a.icao24 === hex);
}

describe('normalizeAdsbLolResponse', () => {
  const result = normalizeAdsbLolResponse(fixture);

  it('mantiene solo aerei validi, con posizione recente e senza duplicati', () => {
    expect(result.aircraft.map((a) => a.icao24)).toEqual([
      '4ca87c',
      '3c1234',
      'a0b1c2',
      '39df19',
      '~2a0f11',
      '4d2222',
    ]);
    expect(result.stats).toEqual({
      upstreamTotal: 10,
      dropped: { invalid: 2, stalePosition: 1, duplicate: 1 },
    });
    expect(result.providerTime).toBe(1790510015501);
  });

  it('converte unità: piedi → m, nodi → m/s, ft/min → m/s', () => {
    const a = byHex(result.aircraft, '4ca87c');
    expect(a).toMatchObject({
      callsign: 'TEST123',
      registration: 'EI-TST',
      typeCode: 'A320',
      category: 'A3',
      altBaroM: 11278,
      altGeomM: 11445,
      groundSpeedMs: 231.6,
      verticalRateMs: -0.33,
      squawk: '2341',
      emergency: null,
      positionSource: 'adsb',
      positionAgeS: 1.2,
      lastSeenS: 0.4,
      onGround: false,
      privacyRestricted: false,
    });
    // Precisione ridotta a 5 decimali (~1 m), nessuno spostamento.
    expect(a).toMatchObject({ lat: 45.12346, lon: 9.87654 });
  });

  it('preferisce track, poi true_heading, poi calc_track; ignora mag_heading', () => {
    expect(byHex(result.aircraft, '4ca87c')).toMatchObject({
      trackDeg: 92.4,
      trackSource: 'track',
    });
    expect(byHex(result.aircraft, '3c1234')).toMatchObject({
      trackDeg: 180,
      trackSource: 'true_heading',
    });
    expect(byHex(result.aircraft, '39df19')).toMatchObject({
      trackDeg: 342,
      trackSource: 'calc_track',
      positionSource: 'mlat',
    });
    expect(byHex(result.aircraft, '4d2222')).toMatchObject({ trackDeg: null, trackSource: null });
  });

  it('non inventa la quota: assente resta null, "ground" → a terra', () => {
    expect(byHex(result.aircraft, '4d2222')).toMatchObject({
      altBaroM: null,
      altGeomM: null,
      onGround: false,
    });
    expect(byHex(result.aircraft, '~2a0f11')).toMatchObject({
      altBaroM: null,
      onGround: true,
      positionSource: 'tisb',
      groundSpeedMs: 6.2,
    });
  });

  it('oscura callsign e registrazione per LADD e PIA', () => {
    expect(byHex(result.aircraft, '3c1234')).toMatchObject({
      callsign: null,
      registration: null,
      typeCode: 'C25B',
      privacyRestricted: true,
    });
    expect(byHex(result.aircraft, 'a0b1c2')).toMatchObject({
      callsign: null,
      registration: null,
      privacyRestricted: true,
    });
  });

  it('non espone campi upstream non previsti', () => {
    const a = byHex(result.aircraft, '4ca87c') as unknown as Record<string, unknown>;
    expect(a).not.toHaveProperty('rssi');
    expect(a).not.toHaveProperty('messages');
    expect(a).not.toHaveProperty('dbFlags');
  });

  it('rifiuta payload strutturalmente non validi', () => {
    expect(() => normalizeAdsbLolResponse(null)).toThrow(InvalidPayloadError);
    expect(() => normalizeAdsbLolResponse([])).toThrow(InvalidPayloadError);
    expect(() => normalizeAdsbLolResponse({ msg: 'x' })).toThrow(InvalidPayloadError);
  });

  it('accetta una lista vuota (area senza traffico)', () => {
    const r = normalizeAdsbLolResponse({ ac: [], now: 1 });
    expect(r.aircraft).toEqual([]);
    expect(r.stats.upstreamTotal).toBe(0);
  });

  it('rispetta la soglia di età configurabile', () => {
    const r = normalizeAdsbLolResponse(fixture, { maxPositionAgeS: 5 });
    // 39df19 ha seen_pos 6.4 s → scartato; 4d2222 ha esattamente 5 s → incluso.
    expect(r.aircraft.map((a) => a.icao24)).not.toContain('39df19');
    expect(r.aircraft.map((a) => a.icao24)).toContain('4d2222');
  });
});

describe('normalizeAdsbLolAircraft — casi limite', () => {
  const base = { hex: 'abcdef', lat: 10, lon: 20, seen_pos: 1 };

  it('scarta coordinate fuori range o non numeriche', () => {
    for (const bad of [
      { lat: 91 },
      { lat: -90.1 },
      { lon: 180.5 },
      { lat: '45' },
      { lon: null },
      { lat: Number.NaN },
    ]) {
      expect(normalizeAdsbLolAircraft({ ...base, ...bad }).ok).toBe(false);
    }
  });

  it('normalizza angoli fuori range e 360 → 0', () => {
    const r1 = normalizeAdsbLolAircraft({ ...base, track: 360 });
    const r2 = normalizeAdsbLolAircraft({ ...base, track: -90 });
    const r3 = normalizeAdsbLolAircraft({ ...base, track: 359.99 });
    expect(r1.ok && r1.value.trackDeg).toBe(0);
    expect(r2.ok && r2.value.trackDeg).toBe(270);
    expect(r3.ok && r3.value.trackDeg).toBe(0);
  });

  it('mantiene quote negative reali (sotto il livello del mare)', () => {
    const r = normalizeAdsbLolAircraft({ ...base, alt_baro: -100 });
    expect(r.ok && r.value.altBaroM).toBe(-30);
  });

  it('squawk, categoria ed emergenza validati', () => {
    const r = normalizeAdsbLolAircraft({
      ...base,
      squawk: '7800',
      category: 'Z9',
      emergency: 'General',
    });
    expect(r.ok && r.value).toMatchObject({ squawk: null, category: null, emergency: 'general' });
  });

  it('seen_pos assente: posizione accettata ma età sconosciuta', () => {
    const r = normalizeAdsbLolAircraft({ hex: 'abcdef', lat: 1, lon: 2 });
    expect(r.ok && r.value.positionAgeS).toBeNull();
  });
});

describe('helper', () => {
  it('mapPositionSource', () => {
    expect(mapPositionSource('adsb_icao')).toBe('adsb');
    expect(mapPositionSource('adsr_icao')).toBe('adsb');
    expect(mapPositionSource('mlat')).toBe('mlat');
    expect(mapPositionSource('tisb_trackfile')).toBe('tisb');
    expect(mapPositionSource('mode_s')).toBe('modes');
    expect(mapPositionSource('adsc')).toBe('other');
    expect(mapPositionSource(undefined)).toBe('other');
  });

  it('isPrivacyRestricted', () => {
    expect(isPrivacyRestricted(0)).toBe(false);
    expect(isPrivacyRestricted(1)).toBe(false);
    expect(isPrivacyRestricted(4)).toBe(true);
    expect(isPrivacyRestricted(8)).toBe(true);
    expect(isPrivacyRestricted(9)).toBe(true);
    expect(isPrivacyRestricted('8')).toBe(false);
    expect(isPrivacyRestricted(null)).toBe(false);
  });
});
