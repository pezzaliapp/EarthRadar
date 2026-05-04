import { describe, expect, it } from 'vitest';
import { buildShareUrl } from './buildShareUrl';

const off = { enabled: false, opacity: 1 };
const on = { enabled: true, opacity: 1 };

describe('buildShareUrl', () => {
  it('serializes lat/lon/view + only enabled layers', () => {
    const url = buildShareUrl({
      lat: 44.7,
      lon: 10.6,
      view: '2d',
      overlays: {
        quakes: on,
        satellites: off,
        iss: on,
        weather: off,
      },
    });
    const params = new URL(url).searchParams;
    expect(params.get('lat')).toBe('44.7000');
    expect(params.get('lon')).toBe('10.6000');
    expect(params.get('view')).toBe('2d');
    expect(params.get('layers')).toBe('quakes,iss');
  });

  it('omits the layers param when no overlays are enabled', () => {
    const url = buildShareUrl({
      lat: 0,
      lon: 0,
      view: '3d',
      overlays: { quakes: off, iss: off },
    });
    const params = new URL(url).searchParams;
    expect(params.get('layers')).toBeNull();
  });

  it('forwards zoom when provided', () => {
    const url = buildShareUrl({
      lat: 0,
      lon: 0,
      view: '2d',
      overlays: {},
      zoom: 7,
    });
    const params = new URL(url).searchParams;
    expect(params.get('zoom')).toBe('7');
  });
});
