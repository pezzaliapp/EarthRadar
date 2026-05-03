import { describe, expect, it } from 'vitest';
import { parseWtiaResponse } from './issApi';

describe('parseWtiaResponse', () => {
  it('parses a valid wheretheiss.at payload', () => {
    const sample = {
      name: 'iss',
      id: 25544,
      latitude: 44.7,
      longitude: 10.6,
      altitude: 415.5,
      velocity: 27600,
      visibility: 'daylight',
      footprint: 4500,
      timestamp: 1727285400,
      daynum: 2460585.4,
      solar_lat: 1.5,
      solar_lon: 100,
      units: 'kilometers',
    };
    const parsed = parseWtiaResponse(sample);
    expect(parsed).not.toBeNull();
    expect(parsed!.lat).toBeCloseTo(44.7);
    expect(parsed!.lon).toBeCloseTo(10.6);
    expect(parsed!.altKm).toBeCloseTo(415.5);
    expect(parsed!.velocityKmh).toBe(27600);
    expect(parsed!.footprintKm).toBe(4500);
    expect(parsed!.visibility).toBe('daylight');
    expect(parsed!.timestamp).toBe(1727285400000);
  });

  it('coerces eclipsed visibility correctly', () => {
    const sample = {
      latitude: 0,
      longitude: 0,
      altitude: 400,
      velocity: 27000,
      visibility: 'eclipsed',
      footprint: 4400,
      timestamp: 1727285400,
    };
    const parsed = parseWtiaResponse(sample);
    expect(parsed!.visibility).toBe('eclipsed');
  });

  it('defaults to daylight if visibility field is unknown', () => {
    const sample = {
      latitude: 0,
      longitude: 0,
      altitude: 400,
      velocity: 27000,
      visibility: 'foo',
      footprint: 4400,
      timestamp: 1727285400,
    };
    const parsed = parseWtiaResponse(sample);
    expect(parsed!.visibility).toBe('daylight');
  });

  it('returns null on missing required fields', () => {
    expect(parseWtiaResponse({})).toBeNull();
    expect(parseWtiaResponse({ latitude: 0, longitude: 0 })).toBeNull();
    expect(parseWtiaResponse(null)).toBeNull();
    expect(parseWtiaResponse('string' as unknown)).toBeNull();
  });

  it('returns null when numeric coercion fails', () => {
    const sample = {
      latitude: 'not-a-number',
      longitude: 0,
      altitude: 400,
      velocity: 27000,
      visibility: 'daylight',
      footprint: 4400,
      timestamp: 1727285400,
    };
    expect(parseWtiaResponse(sample)).toBeNull();
  });
});
