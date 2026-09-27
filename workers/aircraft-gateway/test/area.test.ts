// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  areaCacheKey,
  gridStepDeg,
  parseAreaParams,
  quantizeArea,
  radiusBucket,
  wrapLon,
} from '../src/area.ts';

function parse(qs: string) {
  return parseAreaParams(new URLSearchParams(qs));
}

describe('parseAreaParams — validazione rigorosa', () => {
  it('accetta parametri validi', () => {
    const r = parse('lat=45.07&lon=7.69&r=100');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.requested).toEqual({ lat: 45.07, lon: 7.69, radiusNm: 100 });
  });

  it.each([
    ['lon=7&r=10', 'lat'],
    ['lat=45&r=10', 'lon'],
    ['lat=45&lon=7', 'r'],
    ['lat=91&lon=7&r=10', 'lat'],
    ['lat=-90.5&lon=7&r=10', 'lat'],
    ['lat=45&lon=181&r=10', 'lon'],
    ['lat=abc&lon=7&r=10', 'lat'],
    ['lat=1e1&lon=7&r=10', 'lat'],
    ['lat=45&lon=0x10&r=10', 'lon'],
    ['lat=45&lon=Infinity&r=10', 'lon'],
    ['lat=&lon=7&r=10', 'lat'],
    ['lat=45&lat=46&lon=7&r=10', 'lat'],
    ['lat=45&lon=7&r=0', 'r'],
    ['lat=45&lon=7&r=251', 'r'],
    ['lat=45&lon=7&r=300', 'r'],
    ['lat=45&lon=7&r=100.5', 'r'],
    ['lat=45&lon=7&r=-5', 'r'],
    ['lat=45&lon=7&r=1e2', 'r'],
    ['lat=45&lon=7&r=%2010', 'r'],
  ])('rifiuta %s (campo %s)', (qs, field) => {
    const r = parse(qs);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe(field);
  });

  it('accetta i limiti esatti', () => {
    expect(parse('lat=90&lon=180&r=250').ok).toBe(true);
    expect(parse('lat=-90&lon=-180&r=1').ok).toBe(true);
  });
});

describe('quantizzazione', () => {
  it('radiusBucket arrotonda per eccesso', () => {
    expect(radiusBucket(1)).toBe(25);
    expect(radiusBucket(25)).toBe(25);
    expect(radiusBucket(26)).toBe(50);
    expect(radiusBucket(120)).toBe(150);
    expect(radiusBucket(151)).toBe(250);
    expect(radiusBucket(250)).toBe(250);
  });

  it('gridStepDeg proporzionale al raggio', () => {
    expect(gridStepDeg(25)).toBe(0.1);
    expect(gridStepDeg(100)).toBe(0.25);
    expect(gridStepDeg(250)).toBe(0.5);
  });

  it('client vicini condividono la stessa chiave', () => {
    const a = quantizeArea({ lat: 45.07, lon: 7.69, radiusNm: 240 });
    const b = quantizeArea({ lat: 45.2, lon: 7.6, radiusNm: 200 });
    expect(a).toEqual({ lat: 45, lon: 7.5, radiusNm: 250 });
    expect(areaCacheKey(a)).toBe(areaCacheKey(b));
  });

  it('niente rumore floating point né -0', () => {
    const q = quantizeArea({ lat: 0.3, lon: -0.04, radiusNm: 10 });
    expect(q).toEqual({ lat: 0.3, lon: 0, radiusNm: 25 });
    expect(Object.is(q.lon, -0)).toBe(false);
  });

  it('antimeridiano: 180 e -180 collassano', () => {
    expect(quantizeArea({ lat: 0, lon: 179.9, radiusNm: 250 }).lon).toBe(-180);
    expect(quantizeArea({ lat: 0, lon: -179.9, radiusNm: 250 }).lon).toBe(-180);
    expect(wrapLon(190)).toBe(-170);
    expect(wrapLon(-190)).toBe(170);
  });

  it('poli restano nel range', () => {
    expect(quantizeArea({ lat: 89.9, lon: 0, radiusNm: 250 }).lat).toBe(90);
    expect(quantizeArea({ lat: -89.9, lon: 0, radiusNm: 250 }).lat).toBe(-90);
  });
});
