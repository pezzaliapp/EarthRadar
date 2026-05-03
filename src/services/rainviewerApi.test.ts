import { describe, expect, it } from 'vitest';
import { buildTileUrl, frameLabel, parseDiscovery, type RadarFrame } from './rainviewerApi';

const DISCOVERY = {
  host: 'https://tilecache.rainviewer.com',
  radar: {
    past: [
      { time: 1700000000, path: '/v2/radar/1700000000' },
      { time: 1700000600, path: '/v2/radar/1700000600' }, // +10 min
      { time: 1700001200, path: '/v2/radar/1700001200' }, // +20 min
    ],
    nowcast: [
      { time: 1700001800, path: '/v2/radar/nowcast/1700001800' }, // +30 min
      { time: 1700002400, path: '/v2/radar/nowcast/1700002400' }, // +40 min
    ],
  },
};

describe('parseDiscovery', () => {
  it('returns empty frames for malformed input', () => {
    expect(parseDiscovery(null).all).toEqual([]);
    expect(parseDiscovery({ radar: 'nope' }).all).toEqual([]);
  });

  it('parses past + nowcast and concatenates them sorted', () => {
    const f = parseDiscovery(DISCOVERY);
    expect(f.host).toBe('https://tilecache.rainviewer.com');
    expect(f.past).toHaveLength(3);
    expect(f.nowcast).toHaveLength(2);
    expect(f.all).toHaveLength(5);
    expect(f.all[0].time).toBeLessThan(f.all[4].time);
    expect(f.nowIndex).toBe(2); // last past
    expect(f.all[2].kind).toBe('past');
    expect(f.all[3].kind).toBe('nowcast');
  });

  it('drops malformed entries', () => {
    const f = parseDiscovery({
      host: 'https://x',
      radar: {
        past: [{ time: 'bad' }, { path: 'no-time' }, { time: 1, path: '/x' }],
      },
    });
    expect(f.past).toHaveLength(1);
  });
});

describe('buildTileUrl', () => {
  const frame: RadarFrame = { time: 1700000000, path: '/v2/radar/1700000000', kind: 'past' };

  it('builds the canonical tile URL with defaults', () => {
    const url = buildTileUrl('https://tilecache.rainviewer.com', frame);
    expect(url).toBe('https://tilecache.rainviewer.com/v2/radar/1700000000/256/{z}/{x}/{y}/2/0_0.png');
  });

  it('honors size, color, smooth, snow options', () => {
    const url = buildTileUrl('https://x', frame, { size: 512, color: 4, smooth: true, snow: true });
    expect(url).toBe('https://x/v2/radar/1700000000/512/{z}/{x}/{y}/4/1_1.png');
  });
});

describe('frameLabel', () => {
  const frame = (time: number, kind: 'past' | 'nowcast' = 'past'): RadarFrame => ({
    time,
    path: '/x',
    kind,
  });

  it('returns "Ora" / "Now" at delta 0', () => {
    expect(frameLabel(frame(1000), 1000, 'it')).toBe('Ora');
    expect(frameLabel(frame(1000), 1000, 'en')).toBe('Now');
  });

  it('returns negative minutes for past', () => {
    expect(frameLabel(frame(1000 - 600), 1000, 'it')).toBe('−10 min');
  });

  it('returns positive nowcast suffix for future frames', () => {
    expect(frameLabel(frame(1000 + 900, 'nowcast'), 1000, 'it')).toBe('+15 min nowcast');
  });
});
