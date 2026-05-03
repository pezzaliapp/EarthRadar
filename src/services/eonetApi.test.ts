import { describe, expect, it } from 'vitest';
import {
  bboxToParam,
  parseCategoriesResponse,
  parseEonetEvent,
  parseEventsResponse,
  trackVelocityKmh,
  type EonetGeometry,
} from './eonetApi';

const HURRICANE = {
  id: 'EONET_HURR_1',
  title: 'Hurricane Sample',
  description: 'desc',
  link: 'https://example.test',
  closed: null,
  categories: [{ id: 'severeStorms', title: 'Severe Storms' }],
  sources: [{ id: 'GDACS', url: 'https://www.gdacs.org/' }],
  geometry: [
    {
      magnitudeValue: 50,
      magnitudeUnit: 'kts',
      date: '2026-04-29T00:00:00Z',
      type: 'Point',
      coordinates: [-65.0, 18.5],
    },
    {
      magnitudeValue: 80,
      magnitudeUnit: 'kts',
      date: '2026-05-01T12:00:00Z',
      type: 'Point',
      coordinates: [-68.0, 21.0],
    },
  ],
};

const FLOOD_POLY = {
  id: 'EONET_FLOOD',
  title: 'Flood',
  closed: null,
  categories: [{ id: 'floods', title: 'Floods' }],
  sources: [],
  geometry: [
    {
      type: 'Polygon',
      date: '2026-05-01T00:00:00Z',
      coordinates: [
        [
          [88.5, 23.5],
          [90.5, 23.5],
          [90.5, 25.0],
          [88.5, 25.0],
          [88.5, 23.5],
        ],
      ],
    },
  ],
};

describe('parseEonetEvent', () => {
  it('parses a multi-Point hurricane and orders geometry chronologically', () => {
    const ev = parseEonetEvent({
      ...HURRICANE,
      geometry: [HURRICANE.geometry[1], HURRICANE.geometry[0]], // out of order
    });
    expect(ev).not.toBeNull();
    expect(ev!.geometry).toHaveLength(2);
    expect(ev!.geometry[0].date).toBe('2026-04-29T00:00:00Z');
    expect(ev!.geometry[1].date).toBe('2026-05-01T12:00:00Z');
    expect(ev!.geometry[1].magnitudeValue).toBe(80);
    expect(ev!.geometry[1].magnitudeUnit).toBe('kts');
  });

  it('parses a Polygon event with rings', () => {
    const ev = parseEonetEvent(FLOOD_POLY);
    expect(ev).not.toBeNull();
    const g = ev!.geometry[0];
    expect(g.type).toBe('Polygon');
    if (g.type === 'Polygon') {
      expect(g.coordinates).toHaveLength(1);
      expect(g.coordinates[0]).toHaveLength(5);
    }
  });

  it('drops events without geometry or with malformed coords', () => {
    expect(parseEonetEvent({ id: 'x', title: 'no geom' })).toBeNull();
    expect(
      parseEonetEvent({
        id: 'x',
        title: 'bad coords',
        geometry: [{ type: 'Point', date: 'now', coordinates: ['a', 'b'] }],
      }),
    ).toBeNull();
  });

  it('drops Polygon rings with < 3 points', () => {
    const ev = parseEonetEvent({
      ...FLOOD_POLY,
      geometry: [
        {
          type: 'Polygon',
          date: '2026-05-01T00:00:00Z',
          coordinates: [
            [
              [0, 0],
              [1, 1],
            ],
          ],
        },
      ],
    });
    expect(ev).toBeNull();
  });

  it('coerces numeric category id to string', () => {
    const ev = parseEonetEvent({
      ...HURRICANE,
      categories: [{ id: 8, title: 'Severe Storms' }],
    });
    expect(ev!.categories[0].id).toBe('8');
  });
});

describe('parseEventsResponse', () => {
  it('returns [] for malformed input', () => {
    expect(parseEventsResponse(null)).toEqual([]);
    expect(parseEventsResponse({ events: 'no' })).toEqual([]);
  });

  it('parses a list and filters out malformed', () => {
    const out = parseEventsResponse({ events: [HURRICANE, FLOOD_POLY, { id: 'bad' }] });
    expect(out).toHaveLength(2);
  });
});

describe('parseCategoriesResponse', () => {
  it('parses /categories', () => {
    const out = parseCategoriesResponse({
      categories: [
        { id: 'wildfires', title: 'Wildfires', description: 'd', link: 'https://x' },
        { id: 'volcanoes', title: 'Volcanoes' },
        { id: 'broken' }, // dropped (no title)
      ],
    });
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe('wildfires');
  });
});

describe('trackVelocityKmh', () => {
  it('returns [] for < 2 Point', () => {
    const g: EonetGeometry[] = [
      { type: 'Point', date: '2026-05-01T00:00:00Z', coordinates: [0, 0], magnitudeValue: null, magnitudeUnit: null },
    ];
    expect(trackVelocityKmh(g)).toEqual([]);
  });

  it('computes km/h between consecutive Points', () => {
    const g: EonetGeometry[] = [
      { type: 'Point', date: '2026-05-01T00:00:00Z', coordinates: [0, 0], magnitudeValue: null, magnitudeUnit: null },
      // 1° lat → ~111 km in 1 h → ~111 km/h
      { type: 'Point', date: '2026-05-01T01:00:00Z', coordinates: [0, 1], magnitudeValue: null, magnitudeUnit: null },
    ];
    const v = trackVelocityKmh(g);
    expect(v).toHaveLength(1);
    expect(v[0]).toBeGreaterThan(108);
    expect(v[0]).toBeLessThan(115);
  });

  it('ignores Polygon geometries when computing velocity', () => {
    const g: EonetGeometry[] = [
      { type: 'Point', date: '2026-05-01T00:00:00Z', coordinates: [0, 0], magnitudeValue: null, magnitudeUnit: null },
      {
        type: 'Polygon',
        date: '2026-05-01T01:00:00Z',
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
          ],
        ],
        magnitudeValue: null,
        magnitudeUnit: null,
      },
      { type: 'Point', date: '2026-05-01T02:00:00Z', coordinates: [0, 1], magnitudeValue: null, magnitudeUnit: null },
    ];
    const v = trackVelocityKmh(g);
    expect(v).toHaveLength(1); // 2 Point only → 1 segment
  });
});

describe('bboxToParam', () => {
  it('joins minLon,minLat,maxLon,maxLat', () => {
    expect(bboxToParam([-180, -90, 180, 90])).toBe('-180,-90,180,90');
  });
});
