import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseCamCatalog } from '@/services/camCatalog';
import { CAM_SOURCES } from '@/services/camSources';
import meta from '@/services/camCatalogMeta.json';
import {
  buildAreas,
  camsInArea,
  distanceKm,
  countByType,
  filterByType,
  formatCount,
  formatKm,
  normalizeText,
  roundCenter,
  searchCams,
  searchTextOf,
  sortByDistance,
  type ExplorerCam,
  type SourceRegistry,
} from './camExplorer';

const catalog = parseCamCatalog(
  JSON.parse(readFileSync(path.resolve(__dirname, '../../public/cam/cams-v2.json'), 'utf8')),
);
const cams = catalog.cams;
const REGISTRY: SourceRegistry = CAM_SOURCES;
const index = cams.map((c) => searchTextOf(c, REGISTRY));

describe('CAM Explorer — tutto il catalogo è esplorabile', () => {
  it('metadati della callout coerenti con il catalogo pubblicato', () => {
    expect(meta.total).toBe(cams.length);
    expect(meta.hash).toBe(catalog.hash);
  });

  it('le aree coprono tutte le camere (nessuna esclusa)', () => {
    const areas = buildAreas(cams, REGISTRY);
    expect(areas.reduce((n, a) => n + a.count, 0)).toBe(cams.length);
    const c = meta.counts as Record<string, number>;
    expect(Object.fromEntries(areas.map((a) => [a.label.en, a.count]))).toEqual({
      'Hong Kong': c.hktd,
      'London, United Kingdom': c.tfl,
      Finland: c.digitraffic,
      'California, USA': c.caltrans,
      'Iowa, USA': c.iowa,
      // Area "Italia" generata dai dati: INGV + CNR-ISMAR (stessa regione).
      Italy: (c.ingv ?? 0) + (c.cnrismar ?? 0),
    });
  });

  it('entrando in un’area si scorrono tutte le sue camere, ordinate per nome', () => {
    const london = buildAreas(cams, REGISTRY).find((a) => a.label.en.startsWith('London'))!;
    const list = camsInArea(cams, REGISTRY, london.key);
    expect(list).toHaveLength(meta.counts.tfl);
    expect(list.every((c) => c.source === 'tfl')).toBe(true);
    for (let i = 1; i < list.length; i++) {
      expect(list[i - 1].name.localeCompare(list[i].name)).toBeLessThanOrEqual(0);
    }
  });

  it('"Zona mappa" ordina l’intero catalogo per distanza dal centro', () => {
    const near = sortByDistance(cams, 22.3, 114.17); // centro Hong Kong
    expect(near).toHaveLength(cams.length);
    expect(near[0].cam.source).toBe('hktd');
    for (let i = 1; i < near.length; i++) expect(near[i].km).toBeGreaterThanOrEqual(near[i - 1].km);
    const fromLondon = sortByDistance(cams, 51.51, -0.12);
    expect(fromLondon[0].cam.source).toBe('tfl');
    expect(fromLondon[0].km).toBeLessThan(2);
  });

  it('centro arrotondato: micro-spostamenti non riordinano', () => {
    expect(roundCenter(51.5071, -0.1275)).toEqual(roundCenter(51.5079, -0.1279));
    expect(roundCenter(51.5, -0.1)).not.toEqual(roundCenter(51.6, -0.1));
  });
});

describe('CAM Explorer — ricerca locale', () => {
  it('trova per nome, anche con più parole e senza maiuscole', () => {
    const r = searchCams(cams, index, 'piccadilly circus');
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((c) => /piccadilly/i.test(c.name))).toBe(true);
  });

  it('trova per identificatore e per area/località', () => {
    expect(searchCams(cams, index, 'H429F').map((c) => c.id)).toEqual(['H429F']);
    expect(searchCams(cams, index, 'hong kong')).toHaveLength(meta.counts.hktd);
    expect(searchCams(cams, index, 'finlandia')).toHaveLength(meta.counts.digitraffic);
  });

  it('ignora accenti e diacritici (Mäntsälä ≈ mantsala)', () => {
    expect(normalizeText('vt4 Mäntsälä')).toBe('vt4 mantsala');
    const r = searchCams(cams, index, 'mantsala');
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((c) => c.source === 'digitraffic')).toBe(true);
  });

  it('query vuota → nessun risultato; query senza corrispondenze → vuoto', () => {
    expect(searchCams(cams, index, '   ')).toEqual([]);
    expect(searchCams(cams, index, 'zzzz-nessuna-camera')).toEqual([]);
  });
});

describe('CAM Explorer — futura fonte aggiuntiva (data-driven)', () => {
  it('una nuova fonte nel registro crea da sola la sua area, ricercabile e ordinabile', () => {
    // Terza famiglia di fonti simulata (non esiste nel codice): Nuova Zelanda.
    const future: SourceRegistry = {
      ...REGISTRY,
      nzta: { label: 'NZ Transport Agency', region: { it: 'Nuova Zelanda', en: 'New Zealand' } },
    };
    const extra: ExplorerCam[] = [
      { source: 'nzta', id: '714', lat: -36.85, lon: 174.76, name: 'SH1 Auckland Harbour Bridge', type: 'snap' },
      { source: 'nzta', id: '901', lat: -41.29, lon: 174.78, name: 'SH2 Wellington Ngauranga', type: 'live' },
    ];
    const all = [...cams, ...extra];
    const areas = buildAreas(all, future);
    const nz = areas.find((a) => a.label.en === 'New Zealand');
    expect(nz).toMatchObject({ count: 2, sources: ['nzta'] });
    expect(areas.reduce((n, a) => n + a.count, 0)).toBe(all.length);
    expect(camsInArea(all, future, nz!.key).map((c) => c.id)).toEqual(['714', '901']);
    const idx = all.map((c) => searchTextOf(c, future));
    expect(searchCams(all, idx, 'zelanda harbour').map((c) => c.id)).toEqual(['714']);
    expect(sortByDistance(all, -36.8, 174.7)[0].cam.id).toBe('714');
    // Il filtro LIVE/SNAP vale anche per la nuova fonte.
    expect(filterByType(extra, 'live').map((c) => c.id)).toEqual(['901']);
  });

  it('camere di una fonte sconosciuta non rompono le aree', () => {
    const areas = buildAreas([{ source: 'ghost', id: 'x', lat: 0, lon: 1, name: 'x' }], REGISTRY);
    expect(areas).toEqual([]);
  });
});

describe('distanza', () => {
  it('distanceKm e formatKm', () => {
    expect(distanceKm(51.5, -0.12, 48.86, 2.35)).toBeGreaterThan(330);
    expect(distanceKm(51.5, -0.12, 48.86, 2.35)).toBeLessThan(350);
    expect(formatKm(1.234, 'it')).toBe('1,2 km');
    expect(formatKm(1234, 'en')).toBe('1,234 km');
    expect(formatCount(2629, 'it')).toBe('2.629');
    expect(formatCount(2629, 'en')).toBe('2,629');
    expect(formatCount(812, 'it')).toBe('812');
    expect(formatCount(1234567, 'it')).toBe('1.234.567');
  });
});

describe('CAM Explorer — filtro TUTTE / LIVE / SNAP', () => {
  it('conteggi coerenti col catalogo e coi metadati', () => {
    const c = countByType(cams);
    expect(c).toEqual({ all: meta.total, live: meta.kinds.live, snap: meta.kinds.snap });
    expect(c.live + c.snap).toBe(c.all);
    expect(filterByType(cams, 'live')).toHaveLength(c.live);
    expect(filterByType(cams, 'snap')).toHaveLength(c.snap);
    expect(filterByType(cams, 'all')).toHaveLength(c.all);
    expect(filterByType(cams, 'live').every((x) => ['caltrans', 'iowa', 'ingv', 'cnrismar'].includes(x.source))).toBe(true);
    expect(c.snap).toBe(2629); // le camere SNAP esistenti restano SNAP
  });

  it('filtro + aree: con LIVE solo le aree con video (Italia, California, Iowa)', () => {
    const areas = buildAreas(filterByType(cams, 'live'), REGISTRY).map((a) => a.label.en).sort();
    expect(areas).toEqual(['California, USA', 'Iowa, USA', 'Italy']);
    const snapAreas = buildAreas(filterByType(cams, 'snap'), REGISTRY).map((a) => a.label.en).sort();
    expect(snapAreas).toEqual(['Finland', 'Hong Kong', 'London, United Kingdom']);
  });

  it('filtro + ricerca e filtro + zona mappa', () => {
    const live = filterByType(cams, 'live');
    const snap = filterByType(cams, 'snap');
    const idxLive = live.map((c) => searchTextOf(c, REGISTRY));
    const idxSnap = snap.map((c) => searchTextOf(c, REGISTRY));
    expect(searchCams(live, idxLive, 'california').length).toBe(meta.counts.caltrans);
    expect(searchCams(snap, idxSnap, 'california')).toEqual([]);
    expect(searchCams(live, idxLive, 'piccadilly')).toEqual([]);
    // Zona mappa su Londra con filtro LIVE: la LIVE più vicina è ora italiana (Venezia).
    const near = sortByDistance(live, 51.51, -0.12);
    expect(near).toHaveLength(meta.kinds.live);
    expect(['ingv', 'cnrismar']).toContain(near[0].cam.source);
  });
});
