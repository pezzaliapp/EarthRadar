import { describe, expect, it } from 'vitest';
import {
  isValidLat,
  isValidLon,
  isValidLatLon,
  isValidLatLngTuple,
  sanitizeCenter,
  filterValidLatLng,
  DEFAULT_CENTER,
} from './coords';

describe('isValidLat / isValidLon', () => {
  it('accetta valori finiti in range', () => {
    expect(isValidLat(44.698)).toBe(true);
    expect(isValidLat(-90)).toBe(true);
    expect(isValidLat(90)).toBe(true);
    expect(isValidLon(10.631)).toBe(true);
    expect(isValidLon(-180)).toBe(true);
    expect(isValidLon(180)).toBe(true);
  });

  it('rifiuta NaN / Infinity', () => {
    expect(isValidLat(NaN)).toBe(false);
    expect(isValidLon(NaN)).toBe(false);
    expect(isValidLat(Infinity)).toBe(false);
    expect(isValidLon(-Infinity)).toBe(false);
  });

  it('rifiuta undefined / null / stringa', () => {
    expect(isValidLat(undefined)).toBe(false);
    expect(isValidLat(null)).toBe(false);
    expect(isValidLat('44.7')).toBe(false);
    expect(isValidLon(undefined)).toBe(false);
    expect(isValidLon(null)).toBe(false);
    expect(isValidLon('10.6')).toBe(false);
  });

  it('rifiuta valori fuori range', () => {
    expect(isValidLat(90.1)).toBe(false);
    expect(isValidLat(-90.1)).toBe(false);
    expect(isValidLon(180.1)).toBe(false);
    expect(isValidLon(-180.1)).toBe(false);
  });
});

describe('isValidLatLon', () => {
  it('vero solo se entrambe valide', () => {
    expect(isValidLatLon(44.7, 10.6)).toBe(true);
    expect(isValidLatLon(NaN, 10.6)).toBe(false);
    expect(isValidLatLon(44.7, NaN)).toBe(false);
    expect(isValidLatLon(undefined, undefined)).toBe(false);
    expect(isValidLatLon(200, 10)).toBe(false);
  });
});

describe('isValidLatLngTuple', () => {
  it('valida tuple [lat, lon]', () => {
    expect(isValidLatLngTuple([44.7, 10.6])).toBe(true);
    expect(isValidLatLngTuple([NaN, NaN])).toBe(false);
    expect(isValidLatLngTuple([44.7])).toBe(false);
    expect(isValidLatLngTuple('44.7,10.6')).toBe(false);
    expect(isValidLatLngTuple(null)).toBe(false);
  });
});

describe('sanitizeCenter', () => {
  it('ritorna il centro valido invariato', () => {
    expect(sanitizeCenter([12, 34])).toEqual([12, 34]);
  });
  it('ritorna il fallback di default per input non validi', () => {
    expect(sanitizeCenter([NaN, NaN])).toEqual(DEFAULT_CENTER);
    expect(sanitizeCenter(undefined)).toEqual(DEFAULT_CENTER);
    expect(sanitizeCenter([200, 10])).toEqual(DEFAULT_CENTER);
  });
  it('rispetta un fallback custom', () => {
    expect(sanitizeCenter(null, [1, 2])).toEqual([1, 2]);
  });
  it('DEFAULT_CENTER è a sua volta valido', () => {
    expect(isValidLatLngTuple(DEFAULT_CENTER)).toBe(true);
  });
});

describe('filterValidLatLng', () => {
  it('scarta i punti non validi mantenendo l’ordine', () => {
    const pts: Array<[number, number]> = [
      [10, 20],
      [NaN, 5],
      [30, 40],
      [5, 200],
    ];
    expect(filterValidLatLng(pts)).toEqual([
      [10, 20],
      [30, 40],
    ]);
  });
  it('ritorna [] se tutti invalidi', () => {
    expect(filterValidLatLng([[NaN, NaN], [999, 999]])).toEqual([]);
  });
});
