import { describe, expect, it } from 'vitest';
import {
  CAM_ALLOWED_HOSTS,
  CAM_SOURCES,
  CAM_SOURCE_IDS,
  camImageUrl,
  camSnapshotUrl,
  camStreamUrl,
  isAllowedCamUrl,
} from './camSources';

describe('camSources — allowlist URL', () => {
  it('costruisce solo URL HTTPS verso l’host ufficiale della fonte', () => {
    expect(camImageUrl('tfl', '00002.00865')).toBe(
      'https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/00002.00865.jpg',
    );
    expect(camImageUrl('digitraffic', 'C0150301')).toBe('https://weathercam.digitraffic.fi/C0150301.jpg');
    expect(camImageUrl('hktd', 'H429F')).toBe('https://tdcctv.data.one.gov.hk/H429F.JPG');
  });

  it('nessun URL per sorgenti sconosciute o id fuori pattern (niente path traversal/injection)', () => {
    for (const [src, id] of [
      ['evil', 'H429F'],
      ['hktd', '../../etc/passwd'],
      ['hktd', 'H429F?x=https://evil.example'],
      ['hktd', 'H429F#'],
      ['tfl', '00002.00865/../x'],
      ['tfl', ''],
      ['digitraffic', 'C01503011'],
      ['hktd', 42],
      ['__proto__', 'x'],
      ['toString', 'x'],
    ] as const) {
      expect(camImageUrl(src, id)).toBeNull();
    }
  });

  it('isAllowedCamUrl accetta solo https + host in allowlist, senza credenziali o porte', () => {
    expect(isAllowedCamUrl('https://tdcctv.data.one.gov.hk/H429F.JPG')).toBe(true);
    expect(isAllowedCamUrl('http://tdcctv.data.one.gov.hk/H429F.JPG')).toBe(false);
    expect(isAllowedCamUrl('https://tdcctv.data.one.gov.hk.evil.example/x.jpg')).toBe(false);
    expect(isAllowedCamUrl('https://user:pw@tdcctv.data.one.gov.hk/x.jpg')).toBe(false);
    expect(isAllowedCamUrl('https://tdcctv.data.one.gov.hk:8443/x.jpg')).toBe(false);
    expect(isAllowedCamUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedCamUrl('//tdcctv.data.one.gov.hk/x.jpg')).toBe(false);
    expect(isAllowedCamUrl('not a url')).toBe(false);
  });

  it('ogni link di licenza/fonte è in allowlist e ogni fonte ha tipo e attribuzione', () => {
    for (const id of CAM_SOURCE_IDS) {
      const s = CAM_SOURCES[id];
      expect(isAllowedCamUrl(s.licenseUrl)).toBe(true);
      expect(isAllowedCamUrl(s.homepageUrl)).toBe(true);
      for (const h of s.hosts) expect(CAM_ALLOWED_HOSTS.has(h)).toBe(true);
      expect(['live', 'snap']).toContain(s.type);
      expect(s.attribution.length).toBeGreaterThan(0);
      expect(s.refreshMs).toBeGreaterThanOrEqual(60_000);
    }
    expect(CAM_SOURCES.tfl.attribution).toContain('Powered by TfL Open Data');
    expect(CAM_SOURCES.digitraffic.attribution).toContain(
      'Source: Fintraffic / digitraffic.fi, license CC 4.0 BY',
    );
  });

  it('camSnapshotUrl cambia solo alla finestra di refresh successiva', () => {
    const step = CAM_SOURCES.hktd.refreshMs;
    const t0 = step * 1000;
    const a = camSnapshotUrl('hktd', 'H429F', t0);
    expect(a).toBe(`https://tdcctv.data.one.gov.hk/H429F.JPG?t=1000`);
    expect(camSnapshotUrl('hktd', 'H429F', t0 + step - 1)).toBe(a);
    expect(camSnapshotUrl('hktd', 'H429F', t0 + step)).not.toBe(a);
    expect(camSnapshotUrl('hktd', 'bad id', t0)).toBeNull();
  });

  it('stream LIVE: solo host ufficiali; porta 8888 ammessa solo per i server video Iowa', () => {
    expect(camStreamUrl('caltrans', 'D7/CCTV-196')).toBe('https://wzmedia.dot.ca.gov/D7/CCTV-196.stream/playlist.m3u8');
    expect(camStreamUrl('iowa', '2/councilbluffs/cbtv74lb')).toBe(
      'https://video2.iowadot.gov:8888/councilbluffs/cbtv74lb/playlist.m3u8',
    );
    for (const [src, ref] of [
      ['caltrans', '../D7/x'],
      ['caltrans', 'D7/x?y=https://evil'],
      ['caltrans', 'D7/a&b'],
      ['iowa', '2/../../etc'],
      ['iowa', '2/a/b/c'],
      ['hktd', 'D7/CCTV-196'], // fonte SNAP: nessuno stream
      ['tfl', '00001.00001'],
    ] as const) {
      expect(camStreamUrl(src, ref)).toBeNull();
    }
    expect(isAllowedCamUrl('https://video2.iowadot.gov:8888/x/playlist.m3u8')).toBe(true);
    expect(isAllowedCamUrl('https://video2.iowadot.gov:9999/x/playlist.m3u8')).toBe(false);
    expect(isAllowedCamUrl('https://video2.iowadot.gov.evil.example:8888/x')).toBe(false);
    expect(isAllowedCamUrl('https://wzmedia.dot.ca.gov:8443/x')).toBe(false);
    expect(isAllowedCamUrl('http://wzmedia.dot.ca.gov/x')).toBe(false);
  });

  it('poster LIVE: Caltrans dall’id, Iowa solo da riferimento valido', () => {
    expect(camImageUrl('caltrans', 'd7/abc')).toBe('https://cwwp2.dot.ca.gov/data/d7/cctv/image/abc/abc.jpg');
    expect(camImageUrl('iowa', '2/a/b', 'SNAPSHOTS/PUBLIC/Metro/cbtv74hd.jpeg')).toBe(
      'https://atmsqf.iowadot.gov/SNAPSHOTS/PUBLIC/Metro/cbtv74hd.jpeg',
    );
    expect(camImageUrl('iowa', '2/a/b', '')).toBeNull();
    expect(camImageUrl('iowa', '2/a/b', 'snapshots/public/../../x.jpg')).toBeNull();
    expect(camImageUrl('iowa', '2/a/b', 'https://evil.example/x.jpg')).toBeNull();
  });
});
