import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';

vi.mock('idb-keyval', () => {
  const store = new Map<string, unknown>();
  return {
    get: vi.fn(async (k: string) => store.get(k)),
    set: vi.fn(async (k: string, v: unknown) => {
      store.set(k, v);
    }),
    keys: vi.fn(async () => [...store.keys()]),
    del: vi.fn(async (k: string) => {
      store.delete(k);
    }),
    __store: store,
  };
});

import * as idb from 'idb-keyval';
import {
  CAM_CATALOG_URL,
  __camCatalogSavedForTests,
  __resetCamCatalogForTests,
  camCatalogCacheKey,
  loadCamCatalog,
  parseCamCatalog,
} from './camCatalog';
import meta from './camCatalogMeta.json';
import { useCamCatalog } from '@/hooks/useCamCatalog';

const store = (idb as unknown as { __store: Map<string, unknown> }).__store;

describe('parseCamCatalog — validazione runtime', () => {
  it('accetta record validi e scarta quelli non validi o duplicati (mai corretti)', () => {
    const r = parseCamCatalog({
      v: 2,
      hash: 'abc',
      cams: [
        ['tfl', '00002.00865', 51.6, -0.01, 'A406', 'S'],
        ['tfl', '00002.00865', 51.6, -0.01, 'A406 dup', 'S'],
        ['hktd', 'H429F', 22.2, 114.1, 'Aberdeen', 'S'],
        ['evil', 'H429F', 22.2, 114.1, 'x', 'S'],
        ['hktd', '../x', 22.2, 114.1, 'x', 'S'],
        ['hktd', 'K107F', 95, 114.1, 'x', 'S'],
        ['hktd', 'K107F', '22.2', 114.1, 'x', 'S'],
        ['hktd', 'K107F', 22.2, 114.1, '', 'S'],
        ['hktd', 'K107F', 22.2, 114.1, 'x', 'https://evil.example/x.jpg'],
        'garbage',
      ],
    });
    expect(r.cams.map((c) => `${c.source}:${c.id}`)).toEqual(['tfl:00002.00865', 'hktd:H429F']);
    expect(r.rejected).toBe(8);
    expect(r.hash).toBe('abc');
  });

  it('rifiuta un formato sconosciuto', () => {
    expect(() => parseCamCatalog({ v: 1, cams: [] })).toThrow();
    expect(() => parseCamCatalog({ v: 3, cams: [] })).toThrow();
    expect(() => parseCamCatalog(null)).toThrow();
  });

  it('il catalogo pubblicato è valido: nessun record scartato, nessun URL, fonti SNAP + LIVE', () => {
    const file = path.resolve(__dirname, '../../public/cam/cams-v2.json');
    const text = readFileSync(file, 'utf8');
    const r = parseCamCatalog(JSON.parse(text));
    expect(r.rejected).toBe(0);
    expect(r.cams.length).toBeGreaterThan(1000);
    const sources = new Set(r.cams.map((c) => c.source));
    for (const s of ['tfl', 'digitraffic', 'hktd', 'caltrans', 'iowa', 'ingv']) expect(sources).toContain(s);
    // Le fonti SNAP restano SNAP, le LIVE sono LIVE: il tipo segue la fonte.
    for (const c of r.cams) {
      expect(c.type).toBe(['caltrans', 'iowa', 'ingv', 'cnrismar'].includes(c.source) ? 'live' : 'snap');
    }
    expect(text).not.toMatch(/https?:\/\//);
  });
});

describe('loadCamCatalog / useCamCatalog', () => {
  const body = { v: 2, hash: 'h', cams: [['hktd', 'H429F', 22.2, 114.1, 'Aberdeen', 'S']] };
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    store.clear();
    __resetCamCatalogForTests();
    fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('CAM OFF → nessuna richiesta', async () => {
    const { result, rerender } = renderHook(({ on }) => useCamCatalog(on), {
      initialProps: { on: false },
    });
    rerender({ on: false });
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.cams).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('CAM ON → una sola richiesta same-origin condivisa fra più consumer (2D, 3D, card)', async () => {
    const a = renderHook(() => useCamCatalog(true));
    const b = renderHook(() => useCamCatalog(true));
    await waitFor(() => expect(a.result.current.cams).toHaveLength(1));
    await waitFor(() => expect(b.result.current.cams).toHaveLength(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(CAM_CATALOG_URL);
  });

  it('errore di rete senza cache → errore gestito, nuovo tentativo possibile', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await expect(loadCamCatalog()).rejects.toThrow('offline');
    const ok = await loadCamCatalog();
    expect(ok.value.cams).toHaveLength(1);
  });
});

describe('cache del catalogo legata alla versione (hash)', () => {
  /** Catalogo sintetico valido: `live` camere Caltrans LIVE + `snap` camere HK SNAP. */
  function catalogBody(hash: string, live: number, snap = 3) {
    const cams: unknown[] = [];
    for (let i = 0; i < live; i++) {
      cams.push(['caltrans', `d7/cam${i}`, 34 + i / 10000, -118, `Cam ${i}`, 'L', `D7/CCTV-${i}`, '']);
    }
    for (let i = 0; i < snap; i++) cams.push(['hktd', `K${i}F`, 22.3, 114.1, `HK ${i}`, 'S']);
    return { v: 2, hash, cams };
  }
  let served: unknown;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    store.clear();
    served = null;
    fetchMock = vi.fn(async () => new Response(JSON.stringify(served), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    __resetCamCatalogForTests();
  });

  const liveCount = (r: Awaited<ReturnType<typeof loadCamCatalog>>) =>
    r.value.cams.filter((c) => c.type === 'live').length;

  it('BUILD A (2.158 LIVE) → BUILD B (2.163 LIVE): B legge subito il catalogo B, senza pulire IndexedDB', async () => {
    // BUILD A
    __resetCamCatalogForTests('hashA');
    served = catalogBody('hashA', 2158);
    const a = await loadCamCatalog();
    expect(liveCount(a)).toBe(2158);
    await __camCatalogSavedForTests();
    expect(store.has('cam:catalog:hashA')).toBe(true);

    // stessa build, nuova sessione: cache riutilizzata, nessuna richiesta
    __resetCamCatalogForTests('hashA');
    const a2 = await loadCamCatalog();
    expect(liveCount(a2)).toBe(2158);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // BUILD B: il server ora pubblica il catalogo B; IndexedDB contiene ancora A
    __resetCamCatalogForTests('hashB');
    served = catalogBody('hashB', 2163);
    const b = await loadCamCatalog();
    expect(fetchMock).toHaveBeenCalledTimes(2); // hash diverso → nuova richiesta
    expect(liveCount(b)).toBe(2163); // la vecchia cache non prevale
    expect(b.source).toBe('fresh');
    await __camCatalogSavedForTests();
    // pulizia: resta solo la versione corrente
    expect([...store.keys()].filter((k) => k.startsWith('cam:catalog:'))).toEqual(['cam:catalog:hashB']);
  });

  it('pulizia sicura: rimuove solo le vecchie voci CAM (anche la chiave fissa legacy), non altre cache', async () => {
    store.set('cam:catalog:v2', { value: catalogBody('old', 1), expiresAt: Date.now() + 1e9 });
    store.set('cam:catalog:hashA', { value: catalogBody('hashA', 1), expiresAt: Date.now() + 1e9 });
    store.set('usgs:quakes:all_day', { value: [1], expiresAt: Date.now() + 1e9 });
    store.set('eonet:events', { value: [2], expiresAt: Date.now() + 1e9 });
    __resetCamCatalogForTests('hashB');
    served = catalogBody('hashB', 5);
    await loadCamCatalog();
    await __camCatalogSavedForTests();
    expect([...store.keys()].sort()).toEqual(['cam:catalog:hashB', 'eonet:events', 'usgs:quakes:all_day']);
  });

  it('offline: se la rete manca si usa l’ultima copia CAM disponibile (stale)', async () => {
    __resetCamCatalogForTests('hashA');
    served = catalogBody('hashA', 7);
    await loadCamCatalog();
    await __camCatalogSavedForTests();
    // nuova build mentre si è offline: nessuna copia B, fallback sull'ultima A
    __resetCamCatalogForTests('hashB');
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    const r = await loadCamCatalog();
    expect(r.source).toBe('stale');
    expect(liveCount(r)).toBe(7);
  });

  it('offline senza alcuna copia: errore gestito (nessun catalogo inventato)', async () => {
    __resetCamCatalogForTests('hashA');
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    await expect(loadCamCatalog()).rejects.toThrow('offline');
  });

  it('una copia con hash diverso da quello della build è mostrata ma NON memorizzata', async () => {
    __resetCamCatalogForTests('hashB');
    served = catalogBody('hashA', 4); // es. copia vecchia da una cache intermedia
    const r = await loadCamCatalog();
    expect(liveCount(r)).toBe(4);
    expect(store.has('cam:catalog:hashB')).toBe(false);
    __resetCamCatalogForTests('hashB');
    served = catalogBody('hashB', 9);
    expect(liveCount(await loadCamCatalog())).toBe(9); // alla sessione successiva arriva B
  });

  it('la chiave della build reale è cam:catalog:<hash di camCatalogMeta.json>', () => {
    __resetCamCatalogForTests();
    expect(camCatalogCacheKey()).toBe(`cam:catalog:${meta.hash}`);
    expect(camCatalogCacheKey()).not.toBe('cam:catalog:v2');
  });
});

describe('primo caricamento e IndexedDB non affidabile', () => {
  const body = { v: 2, hash: meta.hash, cams: [['hktd', 'H429F', 22.2, 114.1, 'Aberdeen', 'S']] };
  let fetchMock: ReturnType<typeof vi.fn>;
  const idbMock = idb as unknown as Record<'get' | 'set' | 'keys' | 'del', ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    store.clear();
    __resetCamCatalogForTests();
    fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    __resetCamCatalogForTests();
  });

  it('IndexedDB vuota, prima apertura: catalogo dalla rete, poi salvato; seconda apertura dalla cache', async () => {
    const first = await loadCamCatalog();
    expect(first.value.cams).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await __camCatalogSavedForTests();
    expect(store.has(camCatalogCacheKey())).toBe(true);
    __resetCamCatalogForTests();
    const second = await loadCamCatalog();
    expect(second.value.cams).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1); // nessuna nuova richiesta
  });

  it('IndexedDB in errore (get/set/keys/del rifiutano) + rete disponibile → catalogo dalla rete', async () => {
    const boom = () => Promise.reject(new DOMException('blocked', 'InvalidStateError'));
    idbMock.get.mockImplementation(boom);
    idbMock.set.mockImplementation(boom);
    idbMock.keys.mockImplementation(boom);
    idbMock.del.mockImplementation(boom);
    try {
      const r = await loadCamCatalog();
      expect(r.source).toBe('fresh');
      expect(r.value.cams).toHaveLength(1);
    } finally {
      idbMock.get.mockImplementation(async (k: string) => store.get(k));
      idbMock.set.mockImplementation(async (k: string, v: unknown) => void store.set(k, v));
      idbMock.keys.mockImplementation(async () => [...store.keys()]);
      idbMock.del.mockImplementation(async (k: string) => void store.delete(k));
    }
  });

  it('IndexedDB bloccata (operazioni che non rispondono mai) + rete disponibile → catalogo dalla rete', async () => {
    const never = () => new Promise(() => {});
    idbMock.get.mockImplementation(never);
    idbMock.set.mockImplementation(never);
    idbMock.keys.mockImplementation(never);
    try {
      const r = await Promise.race([
        loadCamCatalog(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('bloccato su IndexedDB')), 2500)),
      ]);
      expect((r as Awaited<ReturnType<typeof loadCamCatalog>>).value.cams).toHaveLength(1);
    } finally {
      idbMock.get.mockImplementation(async (k: string) => store.get(k));
      idbMock.set.mockImplementation(async (k: string, v: unknown) => void store.set(k, v));
      idbMock.keys.mockImplementation(async () => [...store.keys()]);
    }
  }, 10000);

  it('errore di rete + cache disponibile → copia in cache; errore di rete senza cache → errore controllato', async () => {
    await loadCamCatalog();
    await __camCatalogSavedForTests();
    __resetCamCatalogForTests();
    store.set(camCatalogCacheKey(), { ...(store.get(camCatalogCacheKey()) as object), expiresAt: 0 });
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const r = await loadCamCatalog();
    expect(r.source).toBe('stale');
    store.clear();
    __resetCamCatalogForTests();
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(loadCamCatalog()).rejects.toThrow('Failed to fetch');
  });
});
