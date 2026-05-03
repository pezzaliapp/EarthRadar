import { describe, expect, it } from 'vitest';
import {
  cubeSatTleLink,
  meteorWatchEventLink,
  meteorWatchHomeLink,
  cubeSatHomeLink,
} from './deepLinkBuilder';

const ISS_TLE = {
  name: 'ISS (ZARYA)',
  line1: '1 25544U 98067A   24268.50000000  .00012345  00000+0  22345-3 0  9991',
  line2: '2 25544  51.6400 280.3000 0006000  90.0000 270.0000 15.49000000123456',
};

describe('deepLinkBuilder', () => {
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
