import { describe, expect, it } from 'vitest';
import {
  EARTHRADAR_BASE,
  cubeSatHomeLink,
  cubeSatTleLink,
  eventToMeteorWatchUrl,
  mapStateToShareUrl,
  meteorWatchEventLink,
  meteorWatchHomeLink,
  parseIncomingShareUrl,
} from './deepLinkBuilder';

const ISS_TLE = {
  name: 'ISS (ZARYA)',
  line1: '1 25544U 98067A   24268.50000000  .00012345  00000+0  22345-3 0  9991',
  line2: '2 25544  51.6400 280.3000 0006000  90.0000 270.0000 15.49000000123456',
};

describe('deepLinkBuilder — outbound MeteorWatch / CubeSat', () => {
  it('builds MeteorWatch event link with type and id', () => {
    const url = meteorWatchEventLink('neo', '2025AB1');
    expect(url).toBe('https://www.alessandropezzali.it/MeteorWatch/?event=neo&id=2025AB1');
  });

  it('omits id when not provided', () => {
    const url = meteorWatchEventLink('iss');
    expect(url).toBe('https://www.alessandropezzali.it/MeteorWatch/?event=iss');
  });

  it('returns the MeteorWatch home link', () => {
    expect(meteorWatchHomeLink()).toBe('https://www.alessandropezzali.it/MeteorWatch/');
  });

  it('eventToMeteorWatchUrl is an object-signature alias of meteorWatchEventLink', () => {
    expect(eventToMeteorWatchUrl({ type: 'fireball', id: 'F-2026-04' })).toBe(
      meteorWatchEventLink('fireball', 'F-2026-04'),
    );
    expect(eventToMeteorWatchUrl({ type: 'reentry' })).toBe(meteorWatchEventLink('reentry'));
  });

  it('encodes a TLE into a CubeSat deep link', () => {
    const url = cubeSatTleLink(ISS_TLE);
    expect(url).toContain('https://www.alessandropezzali.it/CubeSat_Constellation/');
    expect(url).toContain('tle=');
    expect(url).toContain('name=ISS');
  });

  it('round-trips the TLE name through the URL', () => {
    const url = cubeSatTleLink(ISS_TLE);
    const params = new URL(url).searchParams;
    expect(params.get('name')).toBe(ISS_TLE.name);
    const tleParam = params.get('tle');
    expect(tleParam).toBeTruthy();
    const decoded = atob(tleParam!);
    expect(decoded).toContain(ISS_TLE.line1);
    expect(decoded).toContain(ISS_TLE.line2);
  });

  it('returns the CubeSat home link', () => {
    expect(cubeSatHomeLink()).toBe('https://www.alessandropezzali.it/CubeSat_Constellation/');
  });
});

describe('mapStateToShareUrl — self-share EarthRadar', () => {
  it('builds a URL with lat / lon clamped to 4 decimals', () => {
    const url = mapStateToShareUrl({ lat: 44.69836721, lon: 10.6310007 });
    expect(url.startsWith(EARTHRADAR_BASE)).toBe(true);
    const params = new URL(url).searchParams;
    expect(params.get('lat')).toBe('44.6984');
    expect(params.get('lon')).toBe('10.6310');
  });

  it('omits zoom / view / layers when not provided', () => {
    const url = mapStateToShareUrl({ lat: 0, lon: 0 });
    const params = new URL(url).searchParams;
    expect(params.get('zoom')).toBeNull();
    expect(params.get('view')).toBeNull();
    expect(params.get('layers')).toBeNull();
  });

  it('rounds zoom to integer and serializes view + layers csv', () => {
    const url = mapStateToShareUrl({
      lat: 1,
      lon: 2,
      zoom: 4.7,
      view: '3d',
      activeLayers: ['quakes', 'iss', 'satellites'],
    });
    const params = new URL(url).searchParams;
    expect(params.get('zoom')).toBe('5');
    expect(params.get('view')).toBe('3d');
    expect(params.get('layers')).toBe('quakes,iss,satellites');
  });
});

describe('parseIncomingShareUrl', () => {
  it('extracts a full self-share state', () => {
    const r = parseIncomingShareUrl('?lat=44.7&lon=10.6&zoom=5&view=3d&layers=quakes,iss');
    expect(r.center).toEqual({ lat: 44.7, lon: 10.6 });
    expect(r.zoom).toBe(5);
    expect(r.view).toBe('3d');
    expect(r.activeLayers).toEqual(['quakes', 'iss']);
  });

  it('drops lat/lon if either is missing or out of range', () => {
    expect(parseIncomingShareUrl('?lat=44.7').center).toBeUndefined();
    expect(parseIncomingShareUrl('?lat=999&lon=10').center).toBeUndefined();
    expect(parseIncomingShareUrl('?lat=10&lon=200').center).toBeUndefined();
  });

  it('drops zoom out of range and view different from 2d|3d', () => {
    const r = parseIncomingShareUrl('?zoom=99&view=vr');
    expect(r.zoom).toBeUndefined();
    expect(r.view).toBeUndefined();
  });

  it('keeps only known layer ids in the layers csv', () => {
    const r = parseIncomingShareUrl('?layers=quakes,unknown,iss,gibs_temperature');
    expect(r.activeLayers).toEqual(['quakes', 'iss', 'gibs_temperature']);
  });

  it('parses the MeteorWatch → EarthRadar focus shape (?layer=...)', () => {
    const r = parseIncomingShareUrl('?lat=44.7&lon=10.6&layer=satellites');
    expect(r.focusLayer).toBe('satellites');
    expect(r.center).toEqual({ lat: 44.7, lon: 10.6 });
  });

  it('parses the CubeSat → EarthRadar shape (?norad=...&layer=satellites)', () => {
    const r = parseIncomingShareUrl('?norad=25544&layer=satellites');
    expect(r.norad).toBe(25544);
    expect(r.focusLayer).toBe('satellites');
  });

  it('rejects negative or non-numeric norad', () => {
    expect(parseIncomingShareUrl('?norad=-5').norad).toBeUndefined();
    expect(parseIncomingShareUrl('?norad=abc').norad).toBeUndefined();
  });

  it('parses MeteorWatch event type + id when present', () => {
    const r = parseIncomingShareUrl('?event=neo&id=2025AB1');
    expect(r.meteorEventType).toBe('neo');
    expect(r.meteorEventId).toBe('2025AB1');
  });

  it('drops unknown event types', () => {
    const r = parseIncomingShareUrl('?event=alien&id=42');
    expect(r.meteorEventType).toBeUndefined();
  });

  it('returns empty object for an empty query', () => {
    expect(parseIncomingShareUrl('')).toEqual({});
    expect(parseIncomingShareUrl(new URLSearchParams())).toEqual({});
  });
});
