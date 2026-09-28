import { describe, expect, it } from 'vitest';
import {
  GARR_STREAMS,
  candidatesFromGarr,
  garrRule,
  garrStreamUrl,
  verifyHlsLive,
  SOURCE_RULES,
  candidatesFromCaltrans,
  candidatesFromIowa,
  recordsFromCatalog,
  serializeMeta,
  candidatesFromDigitraffic,
  candidatesFromHktd,
  candidatesFromTfl,
  digitrafficName,
  normalizeCandidates,
  normalizeName,
  serializeCatalog,
  validateCandidate,
} from './camCatalogCore.mjs';
import { CAM_SOURCES, camImageUrl, camStreamUrl } from '../src/services/camSources';

describe('camCatalogCore — validazione', () => {
  const ok = { id: '00002.00865', lat: 51.6, lon: -0.01, name: 'A406 Billet Upass E' };

  it('accetta un record valido e arrotonda le coordinate a 5 decimali', () => {
    const r = validateCandidate('tfl', { ...ok, lat: 51.600671234 });
    expect(r).toEqual({ ok: true, record: { source: 'tfl', ...ok, lat: 51.60067, kind: 'S' } });
  });

  it('rifiuta record senza identificatore o con id fuori pattern', () => {
    expect(validateCandidate('tfl', { ...ok, id: '' })).toEqual({ ok: false, reason: 'missing_id' });
    expect(validateCandidate('tfl', { ...ok, id: undefined })).toEqual({ ok: false, reason: 'missing_id' });
    expect(validateCandidate('tfl', { ...ok, id: '../x' })).toEqual({ ok: false, reason: 'invalid_id' });
    expect(validateCandidate('hktd', { ...ok, id: 'h429f' })).toMatchObject({ ok: false });
  });

  it('rifiuta coordinate impossibili, nulle o fuori area della fonte', () => {
    for (const bad of [
      { lat: NaN, lon: 0.1 },
      { lat: '', lon: 0.1 },
      { lat: 95, lon: 0.1 },
      { lat: 51.5, lon: 200 },
      { lat: 0, lon: 0 },
    ]) {
      expect(validateCandidate('tfl', { ...ok, ...bad })).toEqual({ ok: false, reason: 'invalid_coords' });
    }
    // Plausibile sul pianeta ma non a Londra.
    expect(validateCandidate('tfl', { ...ok, lat: 45, lon: 9 })).toEqual({
      ok: false,
      reason: 'outside_source_area',
    });
  });

  it('rifiuta un URL immagine diverso dal template ufficiale', () => {
    expect(
      validateCandidate('hktd', {
        id: 'AID09104',
        lat: 22.3,
        lon: 114.1,
        name: 'x',
        imageUrl: 'https://tdcctv.data.one.gov.hk/AID09206.JPG',
      }),
    ).toEqual({ ok: false, reason: 'unexpected_image_url' });
  });

  it('normalizza i nomi (controlli, spazi, markup, lunghezza)', () => {
    expect(normalizeName('  A\u0000B\n  <b>C</b> ')).toBe('A B b C /b');
    expect(normalizeName('x'.repeat(300))).toHaveLength(100);
    expect(normalizeName(42)).toBe('');
    expect(digitrafficName('vt4_Helsinki_Tattarisuo')).toBe('vt4 Helsinki Tattarisuo');
  });
});

describe('camCatalogCore — deduplicazione e ordinamento', () => {
  it('elimina i duplicati per id e ordina in modo deterministico', () => {
    const r = normalizeCandidates('tfl', [
      { id: '00002.00002', lat: 51.5, lon: -0.1, name: 'B' },
      { id: '00001.00001', lat: 51.5, lon: -0.1, name: 'A' },
      { id: '00002.00002', lat: 51.6, lon: -0.2, name: 'B bis' },
      { skip: 'not_available' },
    ]);
    expect(r.accepted.map((c) => c.id)).toEqual(['00001.00001', '00002.00002']);
    expect(r.accepted[1].name).toBe('B');
    expect(r.rejected).toEqual({ duplicate: 1, not_available: 1 });
    expect(r.total).toBe(4);
  });

  it('serializza in modo deterministico (stesso input → stessi byte)', () => {
    const records = normalizeCandidates('hktd', [
      { id: 'K107F', lat: 22.3, lon: 114.17, name: 'Nathan Road' },
      { id: 'H429F', lat: 22.24, lon: 114.15, name: 'Aberdeen' },
    ]).accepted;
    const a = serializeCatalog({ hktd: records });
    const b = serializeCatalog({ hktd: [...records].reverse().reverse() });
    expect(a).toBe(b);
    const parsed = JSON.parse(a);
    expect(parsed.v).toBe(2);
    expect(parsed.counts).toEqual({ hktd: 2 });
    expect(parsed.cams[0]).toEqual(['hktd', 'H429F', 22.24, 114.15, 'Aberdeen', 'S']);
    expect(a).not.toMatch(/https?:/);
  });
});

describe('camCatalogCore — adattatori fonte', () => {
  it('TfL: solo camere available, id senza prefisso JamCams_', () => {
    const c = candidatesFromTfl([
      {
        id: 'JamCams_00002.00865',
        commonName: 'A406',
        lat: 51.6,
        lon: -0.01,
        additionalProperties: [
          { key: 'available', value: 'true' },
          { key: 'imageUrl', value: 'https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/00002.00865.jpg' },
        ],
      },
      { id: 'JamCams_00002.00866', additionalProperties: [{ key: 'available', value: 'false' }] },
    ]);
    expect(c[0]).toMatchObject({ id: '00002.00865', name: 'A406' });
    expect(c[1]).toEqual({ skip: 'not_available' });
    expect(() => candidatesFromTfl({})).toThrow();
  });

  it('Digitraffic: stazioni GATHERING, primo preset attivo, test escluse', () => {
    const feature = (name, status, presets) => ({
      geometry: { coordinates: [24.9, 60.2, 0] },
      properties: { name, collectionStatus: status, presets },
    });
    const c = candidatesFromDigitraffic({
      features: [
        feature('vt1_Espoo', 'GATHERING', [
          { id: 'C0100101', inCollection: false },
          { id: 'C0100102', inCollection: true },
        ]),
        feature('vt2_X', 'REMOVED_TEMPORARILY', [{ id: 'C0200101', inCollection: true }]),
        feature('TEST_vt20_Oulu', 'GATHERING', [{ id: 'C0300101', inCollection: true }]),
        feature('vt3_Y', 'GATHERING', []),
      ],
    });
    expect(c[0]).toEqual({ id: 'C0100102', lat: 60.2, lon: 24.9, name: 'vt1 Espoo' });
    expect(c.slice(1)).toEqual([
      { skip: 'not_gathering' },
      { skip: 'test_station' },
      { skip: 'no_active_preset' },
    ]);
  });

  it('Hong Kong: parse XML, entità decodificate, suffisso [KEY] rimosso', () => {
    const xml = `<?xml version="1.0"?><image-list><image><key>H429F</key>
      <description>Aberdeen Praya Road &amp; Fish Market [H429F]</description>
      <latitude>22.24845</latitude><longitude>114.1505</longitude>
      <url>https://tdcctv.data.one.gov.hk/H429F.JPG</url></image></image-list>`;
    const [c] = candidatesFromHktd(xml);
    expect(c).toEqual({
      id: 'H429F',
      lat: '22.24845',
      lon: '114.1505',
      name: 'Aberdeen Praya Road & Fish Market',
      imageUrl: 'https://tdcctv.data.one.gov.hk/H429F.JPG',
    });
    expect(validateCandidate('hktd', c).ok).toBe(true);
    expect(() => candidatesFromHktd('<html/>')).toThrow();
  });
});

describe('camCatalogCore ↔ camSources (runtime)', () => {
  it('pattern e template dello script coincidono con quelli usati dall’app', () => {
    const samples = { tfl: '00002.00865', digitraffic: 'C0150301', hktd: 'H429F' };
    for (const [source, id] of Object.entries(samples)) {
      expect(String(SOURCE_RULES[source].idPattern)).toBe(String(CAM_SOURCES[source].idPattern));
      expect(camImageUrl(source, id)).toBe(SOURCE_RULES[source].imageUrl(id));
    }
  });
});

describe('camCatalogCore — fonti LIVE', () => {
  const caltransRow = (over = {}) => ({
    cctv: {
      inService: 'true',
      location: { locationName: 'I-110 : (196) Avenue 26 Off Ramp', nearbyPlace: 'Cypress Park', latitude: '34.0837', longitude: '-118.2215' },
      imageData: {
        streamingVideoURL: 'https://wzmedia.dot.ca.gov/D7/CCTV-196.stream/playlist.m3u8',
        static: { currentImageURL: 'https://cwwp2.dot.ca.gov/data/d7/cctv/image/i110196avenue26offramp/i110196avenue26offramp.jpg' },
      },
      ...over,
    },
  });

  it('Caltrans: streamingVideoURL → stream, currentImageURL → poster (campi distinti)', () => {
    const [c] = candidatesFromCaltrans({ data: [caltransRow()] });
    expect(c).toMatchObject({ id: 'd7/i110196avenue26offramp', stream: 'D7/CCTV-196', name: 'I-110 : (196) Avenue 26 Off Ramp — Cypress Park' });
    const v = validateCandidate('caltrans', c);
    expect(v).toMatchObject({ ok: true, record: { kind: 'L', stream: 'D7/CCTV-196' } });
  });

  it('Caltrans: fuori servizio, senza stream, http o URL anomali → scartati', () => {
    const rows = [
      caltransRow({ inService: 'false' }),
      caltransRow({ imageData: { streamingVideoURL: 'Not Reported', static: { currentImageURL: 'x' } } }),
      caltransRow({ imageData: { streamingVideoURL: 'http://wzmedia.dot.ca.gov/D8/X.stream/playlist.m3u8', static: {} } }),
      caltransRow({ imageData: { streamingVideoURL: 'https://evil.example/D7/X.stream/playlist.m3u8', static: {} } }),
    ];
    expect(candidatesFromCaltrans({ data: rows })).toEqual([
      { skip: 'not_in_service' },
      { skip: 'no_stream' },
      { skip: 'no_stream' },
      { skip: 'no_stream' },
    ]);
    // Nome di stream con caratteri non ammessi (es. "&") → invalid_stream.
    const [amp] = candidatesFromCaltrans({
      data: [caltransRow({ imageData: { streamingVideoURL: 'https://wzmedia.dot.ca.gov/D12/SB5SO57&22.stream/playlist.m3u8', static: { currentImageURL: 'https://cwwp2.dot.ca.gov/data/d12/cctv/image/x/x.jpg' } } })],
    });
    expect(validateCandidate('caltrans', amp)).toEqual({ ok: false, reason: 'invalid_stream' });
  });

  it('Caltrans: porta :443 esplicita normalizzata', () => {
    const [c] = candidatesFromCaltrans({
      data: [caltransRow({ imageData: { streamingVideoURL: 'https://wzmedia.dot.ca.gov:443/D4/N242_at_Concord_Av.stream/playlist.m3u8', static: { currentImageURL: 'https://cwwp2.dot.ca.gov/data/d4/cctv/image/abc/abc.jpg' } } })],
    });
    expect(validateCandidate('caltrans', c)).toMatchObject({ ok: true, record: { stream: 'D4/N242_at_Concord_Av' } });
  });

  it('Iowa: VideoURL (motion video) → stream :8888, ImageURL → poster; senza video → escluso', () => {
    const out = candidatesFromIowa({
      features: [
        { attributes: { Desc_: 'CB - I-680 @ MM 1.1 (130th St)', REGION: 'Council Bluffs', latitude: 41.346072, longitude: -95.935793, VideoURL: 'https://video2.iowadot.gov:8888/councilbluffs/cbtv74lb/playlist.m3u8', ImageURL: 'https://atmsqf.iowadot.gov/SNAPSHOTS/PUBLIC/Metro/cbtv74hd.jpeg' } },
        { attributes: { Desc_: 'RWIS', latitude: 42.4, longitude: -93.5, VideoURL: null, ImageURL: 'https://atmsqf.iowadot.gov/snapshots/Public/RWIS/RWIS_84-01.jpg' } },
      ],
    });
    expect(out[1]).toEqual({ skip: 'no_stream' });
    const v = validateCandidate('iowa', out[0]);
    expect(v).toMatchObject({
      ok: true,
      record: { id: '2/councilbluffs/cbtv74lb', stream: '2/councilbluffs/cbtv74lb', poster: 'SNAPSHOTS/PUBLIC/Metro/cbtv74hd.jpeg', name: 'CB - I-680 @ MM 1.1 (130th St) — Council Bluffs' },
    });
  });

  it('serializza LIVE come tupla a 8 campi; meta con conteggi LIVE/SNAP; riuso del catalogo precedente', () => {
    const live = { source: 'iowa', id: '2/a/b', lat: 41.5, lon: -93.6, name: 'X', kind: 'L', stream: '2/a/b', poster: 'snapshots/public/a/b.jpg' };
    const snap = { source: 'hktd', id: 'H429F', lat: 22.24, lon: 114.15, name: 'A', kind: 'S' };
    const text = serializeCatalog({ hktd: [snap], iowa: [live] });
    const parsed = JSON.parse(text);
    expect(parsed.cams).toEqual([
      ['hktd', 'H429F', 22.24, 114.15, 'A', 'S'],
      ['iowa', '2/a/b', 41.5, -93.6, 'X', 'L', '2/a/b', 'snapshots/public/a/b.jpg'],
    ]);
    expect(JSON.parse(serializeMeta(text)).kinds).toEqual({ live: 1, snap: 1 });
    expect(recordsFromCatalog(text)).toEqual({ hktd: [snap], iowa: [live] });
    // v1 (tuple a 5) → riletto come SNAP
    expect(recordsFromCatalog('{"v":1,"cams":[["tfl","00001.00001",51.5,-0.1,"A"]]}')).toEqual({
      tfl: [{ source: 'tfl', id: '00001.00001', lat: 51.5, lon: -0.1, name: 'A', kind: 'S' }],
    });
    expect(text).not.toMatch(/https?:/);
  });

  it('pattern/template LIVE dello script = quelli dell’app (stream e poster)', () => {
    expect(camStreamUrl('caltrans', 'D7/CCTV-196')).toBe(SOURCE_RULES.caltrans.streamUrl('D7/CCTV-196'));
    expect(camImageUrl('caltrans', 'd7/abc')).toBe(SOURCE_RULES.caltrans.posterUrl('d7/abc', ''));
    expect(camStreamUrl('iowa', '2/councilbluffs/cbtv74lb')).toBe(SOURCE_RULES.iowa.streamUrl('2/councilbluffs/cbtv74lb'));
    expect(camImageUrl('iowa', '2/a/b', 'snapshots/public/a/b.jpg')).toBe(SOURCE_RULES.iowa.posterUrl('2/a/b', 'snapshots/public/a/b.jpg'));
    for (const s of ['caltrans', 'iowa']) {
      expect(String(SOURCE_RULES[s].idPattern)).toBe(String(CAM_SOURCES[s].idPattern));
      expect(String(SOURCE_RULES[s].streamPattern)).toBe(String(CAM_SOURCES[s].stream.pattern));
    }
    expect(String(SOURCE_RULES.iowa.posterPattern)).toBe(String(CAM_SOURCES.iowa.posterPattern));
  });
});

describe('camCatalogCore — GARR.tv (INGV, CNR-ISMAR)', () => {
  const api = (uuid, over = {}) => ({
    uuid,
    isLive: true,
    privacy: { label: 'Public' },
    licence: { label: 'CC BY 4.0' },
    channel: { name: GARR_STREAMS.find((s) => s.uuid === uuid).channel, host: 'garr.tv' },
    ...over,
  });
  const byUuid = (list) => Object.fromEntries(list.map((v) => [v.uuid, v]));
  const ETNA = 'c6c70a03-e711-4eed-9835-1d02f5a5ec58';
  const EOLIE = '8790a7a8-211c-4794-bcb2-41e24cd2e322';
  const cnr = GARR_STREAMS.filter((s) => s.source === 'cnrismar').map((s) => s.uuid);

  it('seed: Etna ed Eolie INGV, 4 camere CNR-ISMAR, posizioni nell’area della fonte', () => {
    expect(GARR_STREAMS.filter((s) => s.source === 'ingv').map((s) => s.uuid)).toEqual([ETNA, EOLIE]);
    expect(cnr).toHaveLength(4);
    for (const s of GARR_STREAMS) {
      const v = validateCandidate(s.source, { id: s.uuid, lat: s.lat, lon: s.lon, name: s.name, stream: s.uuid, poster: '' });
      expect(v.ok).toBe(true);
    }
  });

  it('INGV online: entrambe incluse come LIVE, senza poster', () => {
    const c = candidatesFromGarr('ingv', GARR_STREAMS, byUuid([api(ETNA), api(EOLIE)]));
    const r = normalizeCandidates('ingv', c);
    expect(r.accepted.map((x) => x.name)).toEqual(expect.arrayContaining([expect.stringMatching(/^Etna/), expect.stringMatching(/^Eolie/)]));
    expect(r.accepted.every((x) => x.kind === 'L' && x.stream === x.id && x.poster === '')).toBe(true);
  });

  it('CNR offline / non pubblica / licenza o canale diversi / API assente → esclusa (catalogo intatto)', () => {
    const [a, b, c, d] = cnr;
    const out = candidatesFromGarr(
      'cnrismar',
      GARR_STREAMS,
      byUuid([
        api(a, { isLive: false }),
        api(b, { licence: { label: 'All rights reserved' } }),
        api(c, { channel: { name: 'altro', host: 'garr.tv' } }),
      ]),
    );
    expect(out).toEqual([{ skip: 'not_live' }, { skip: 'licence_mismatch' }, { skip: 'channel_mismatch' }, { skip: 'api_unavailable' }]);
    expect(normalizeCandidates('cnrismar', out).accepted).toEqual([]);
    expect(d).toBeTruthy();
  });

  it('CNR online simulata → inclusa', () => {
    const out = candidatesFromGarr('cnrismar', GARR_STREAMS, byUuid([api(cnr[2])]));
    const r = normalizeCandidates('cnrismar', out);
    expect(r.accepted).toHaveLength(1);
    expect(r.accepted[0].name).toMatch(/Venezia/);
  });

  function fakeFetch(steps) {
    let media = 0;
    return async (url) => {
      const u = String(url);
      if (u.endsWith('master.m3u8')) {
        return steps.master ?? new Response('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1,RESOLUTION=1280x720\n720.m3u8\n');
      }
      if (u.endsWith('720.m3u8')) {
        const seq = steps.seqs[Math.min(media++, steps.seqs.length - 1)];
        return new Response(`#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXT-X-MEDIA-SEQUENCE:${seq}\n#EXTINF:4,\nseg-${seq}.ts\n`);
      }
      return new Response('x', { status: steps.segStatus ?? 206 });
    };
  }
  const opts = (f) => ({ fetchImpl: f, waitMs: 0, sleep: async () => {} });

  it('verifyHlsLive: sequenza che avanza → in diretta', async () => {
    expect(await verifyHlsLive(garrStreamUrl(ETNA), opts(fakeFetch({ seqs: [10, 13] })))).toEqual({ ok: true });
  });

  it('verifyHlsLive: sequenza ferma, segmento mancante, master assente → escluso', async () => {
    expect(await verifyHlsLive(garrStreamUrl(ETNA), opts(fakeFetch({ seqs: [0, 0] })))).toEqual({ ok: false, reason: 'stalled' });
    expect(await verifyHlsLive(garrStreamUrl(ETNA), opts(fakeFetch({ seqs: [5, 6], segStatus: 404 })))).toEqual({ ok: false, reason: 'segment' });
    expect(await verifyHlsLive(garrStreamUrl(ETNA), opts(fakeFetch({ seqs: [1], master: new Response('', { status: 404 }) })))).toEqual({ ok: false, reason: 'master' });
  });

  it('futura ulteriore fonte GARR: basta una regola garrRule + seed (nessuna modifica a Explorer)', () => {
    const rule = garrRule([43.0, 10.0, 44.0, 11.0]);
    expect(rule).toMatchObject({ kind: 'L', optional: true, minCount: 0 });
    expect(rule.streamUrl('00000000-0000-4000-8000-000000000000')).toBe(
      'https://garr.tv/static/streaming-playlists/hls/00000000-0000-4000-8000-000000000000/master.m3u8',
    );
    expect(rule.idPattern.test('../x')).toBe(false);
  });

  it('template GARR dello script = quello dell’app', () => {
    for (const s of ['ingv', 'cnrismar']) {
      expect(camStreamUrl(s, ETNA)).toBe(SOURCE_RULES[s].streamUrl(ETNA));
      expect(String(SOURCE_RULES[s].idPattern)).toBe(String(CAM_SOURCES[s].idPattern));
      expect(camImageUrl(s, ETNA)).toBeNull(); // nessun poster per GARR
    }
  });
});
