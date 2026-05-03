import { describe, expect, it } from 'vitest';
import { buildCurrentUrl, parseCurrentResponse } from './openMeteoApi';

const RESP = {
  latitude: 44.7,
  longitude: 10.63,
  timezone: 'Europe/Rome',
  current: {
    time: '2026-05-03T18:00',
    temperature_2m: 18.4,
    wind_speed_10m: 12.5,
    wind_direction_10m: 180,
    precipitation: 0.2,
    relative_humidity_2m: 65,
    pressure_msl: 1014.5,
    cloud_cover: 30,
    weather_code: 2,
  },
};

describe('buildCurrentUrl', () => {
  it('encodes lat/lon and full current var list', () => {
    const url = buildCurrentUrl(45.5, 9.2);
    expect(url).toContain('latitude=45.5000');
    expect(url).toContain('longitude=9.2000');
    expect(url).toContain('temperature_2m');
    expect(url).toContain('weather_code');
    expect(url).toContain('timezone=auto');
  });
});

describe('parseCurrentResponse', () => {
  it('parses a complete response into WeatherPoint', () => {
    const p = parseCurrentResponse(RESP);
    expect(p).not.toBeNull();
    expect(p!.lat).toBe(44.7);
    expect(p!.lon).toBe(10.63);
    expect(p!.temperatureC).toBe(18.4);
    expect(p!.windKmh).toBe(12.5);
    expect(p!.windDirDeg).toBe(180);
    expect(p!.precipMm).toBe(0.2);
    expect(p!.humidityPct).toBe(65);
    expect(p!.pressureHpa).toBe(1014.5);
    expect(p!.cloudCoverPct).toBe(30);
    expect(p!.weatherCode).toBe(2);
    expect(p!.timezone).toBe('Europe/Rome');
    expect(new Date(p!.observedAt).toISOString().startsWith('2026-05-03')).toBe(true);
  });

  it('returns null on missing current/time', () => {
    expect(parseCurrentResponse(null)).toBeNull();
    expect(parseCurrentResponse({})).toBeNull();
    expect(parseCurrentResponse({ current: {} })).toBeNull();
  });

  it('uses fallback lat/lon when missing in response', () => {
    const p = parseCurrentResponse({ current: { time: '2026-05-03T18:00' } }, 45, 9);
    expect(p!.lat).toBe(45);
    expect(p!.lon).toBe(9);
  });

  it('preserves null fields when API returns them null', () => {
    const p = parseCurrentResponse({
      latitude: 0,
      longitude: 0,
      current: { time: '2026-05-03T18:00', temperature_2m: null, wind_speed_10m: null },
    });
    expect(p!.temperatureC).toBeNull();
    expect(p!.windKmh).toBeNull();
  });
});
