// @ts-check
/**
 * buildCamCatalog.mjs — genera il catalogo statico del layer CAM.
 *
 * ┌─ PRINCIPIO ────────────────────────────────────────────────────────────┐
 * │ Eseguito A MANO (`npm run cams`), mai in CI né all'apertura dell'app.   │
 * │ Interroga SOLO le fonti ufficiali approvate, senza API key, e scrive    │
 * │ `public/cam/cams-v2.json` + `src/services/camCatalogMeta.json`          │
 * │ (da committare). A runtime l'app legge solo il catalogo same-origin;    │
 * │ immagini e video arrivano dall'host ufficiale della singola camera      │
 * │ aperta dall'utente.                                                     │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * FONTI SNAP (immagini periodiche, tutte keyless, open data, https):
 *  - TfL JamCams            https://api.tfl.gov.uk/Place/Type/JamCam
 *                           Licenza: TfL Open Data (OGL v2) — "Powered by TfL Open Data"
 *  - Fintraffic Digitraffic https://tie.digitraffic.fi/api/weathercam/v1/stations
 *                           Licenza: CC BY 4.0 — "Source: Fintraffic / digitraffic.fi, license CC 4.0 BY"
 *  - Hong Kong TD           https://static.data.gov.hk/td/traffic-snapshot-images/code/Traffic_Camera_Locations_En.xml
 *                           Licenza: DATA.GOV.HK Terms and Conditions
 *
 * FONTI LIVE (video HLS reale, verificato stream per stream a ogni build):
 *  - Caltrans CCTV          https://cwwp2.dot.ca.gov/data/dN/cctv/cctvStatusDNN.json
 *                           Pubblico dominio salvo diversa indicazione (dot.ca.gov/conditions-of-use)
 *  - Iowa DOT               ArcGIS FeatureServer Traffic_Cameras_View
 *                           Licenza: CC BY 4.0 — "Iowa Department of Transportation"
 *  - INGV-OE (Etna, Eolie)  GARR.tv (PeerTube), canale ingv_catania
 *                           Licenza: CC BY 4.0 — doi:10.13127/etna/tvchn · doi:10.13127/aeolian/tvchn
 *  - CNR-ISMAR (Venezia)    GARR.tv, canali aaot_cnr_ismar_channel_1..4 — CC BY 4.0
 *                           Fonti GARR facoltative: API pubblica usata SOLO qui (mai a
 *                           runtime); una camera entra solo se live, pubblica, CC BY 4.0,
 *                           sul canale atteso E con sequenza HLS che avanza.
 *
 * Una camera LIVE entra nel catalogo SOLO se la sua playlist HLS risponde 200
 * con `#EXTM3U` al momento della build (avere `streamingVideoURL` non basta).
 *
 * Opzioni:
 *   --only caltrans,iowa   rigenera solo queste fonti; le altre sono riprese
 *                          invariate dal catalogo già pubblicato.
 *   --skip <source>        esclude una fonte.
 *   --meta-only            rigenera solo i metadati dal catalogo esistente.
 *
 * Se una fonte fallisce o scende sotto il minimo atteso, lo script si ferma
 * SENZA scrivere nulla (il catalogo precedente resta valido).
 */

import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GARR_STREAMS,
  SOURCE_ORDER,
  SOURCE_RULES,
  candidatesFromGarr,
  verifyHlsLive,
  candidatesFromCaltrans,
  candidatesFromDigitraffic,
  candidatesFromHktd,
  candidatesFromIowa,
  candidatesFromTfl,
  normalizeCandidates,
  recordsFromCatalog,
  serializeCatalog,
  serializeMeta,
} from './camCatalogCore.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAM_DIR = path.resolve(__dirname, '..', 'public', 'cam');
const OUT_FILE = path.join(CAM_DIR, 'cams-v2.json');
const PREVIOUS_FILES = [OUT_FILE, path.join(CAM_DIR, 'cams-v1.json')];
// Conteggi per la UI (nel bundle, nessun fetch con CAM OFF).
const META_FILE = path.resolve(__dirname, '..', 'src', 'services', 'camCatalogMeta.json');
const TIMEOUT_MS = 60_000;
const STREAM_TIMEOUT_MS = 15_000;
const STREAM_CONCURRENCY = 6;
const USER_AGENT = 'EarthRadar-cam-catalog (+https://www.alessandropezzali.it/EarthRadar/)';

const CALTRANS_DISTRICTS = Array.from({ length: 12 }, (_, i) => i + 1);
const IOWA_QUERY =
  'https://services.arcgis.com/8lRhdTsQyJpO52F1/arcgis/rest/services/Traffic_Cameras_View/FeatureServer/0/query' +
  '?where=1%3D1&outFields=device_id,Desc_,ImageURL,VideoURL,latitude,longitude,REGION&resultRecordCount=2000&f=json';

/** @param {string} url @param {'json' | 'text'} format @param {Record<string, string>} [headers] */
async function download(url, format, headers = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, ...headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: 'error',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} — ${url}`);
  return format === 'json' ? res.json() : res.text();
}

/**
 * Metadati pubblici GARR.tv (PeerTube) delle camere di una fonte; un errore su
 * un video lo rende semplicemente assente (camera esclusa, non errore di build).
 * @param {string} source
 */
async function garrApi(source) {
  /** @type {Record<string, any>} */
  const out = {};
  for (const s of GARR_STREAMS.filter((x) => x.source === source)) {
    try {
      out[s.uuid] = await download(`https://garr.tv/api/v1/videos/${s.uuid}`, 'json');
    } catch {
      /* camera esclusa: api_unavailable */
    }
  }
  return out;
}

/** @type {Record<string, () => Promise<any[]>>} */
const FETCHERS = {
  ingv: async () => candidatesFromGarr('ingv', GARR_STREAMS, await garrApi('ingv')),
  cnrismar: async () => candidatesFromGarr('cnrismar', GARR_STREAMS, await garrApi('cnrismar')),
  tfl: async () => candidatesFromTfl(await download('https://api.tfl.gov.uk/Place/Type/JamCam', 'json')),
  digitraffic: async () =>
    candidatesFromDigitraffic(
      await download('https://tie.digitraffic.fi/api/weathercam/v1/stations', 'json', {
        // Digitraffic chiede di identificare il client (nessuna chiave).
        'Digitraffic-User': 'EarthRadar/cam-catalog',
        'Accept-Encoding': 'gzip',
      }),
    ),
  hktd: async () =>
    candidatesFromHktd(
      await download(
        'https://static.data.gov.hk/td/traffic-snapshot-images/code/Traffic_Camera_Locations_En.xml',
        'text',
      ),
    ),
  caltrans: async () => {
    const out = [];
    for (const d of CALTRANS_DISTRICTS) {
      const dd = String(d).padStart(2, '0');
      out.push(...candidatesFromCaltrans(await download(`https://cwwp2.dot.ca.gov/data/d${d}/cctv/cctvStatusD${dd}.json`, 'json')));
    }
    return out;
  },
  iowa: async () => candidatesFromIowa(await download(IOWA_QUERY, 'json')),
};

/**
 * Tiene solo le camere LIVE la cui playlist risponde ora (200 + #EXTM3U).
 * Solo la playlist (pochi byte), mai i segmenti video.
 * @param {import('./camCatalogCore.mjs').CamRecord[]} records
 * @param {(ref: string) => string} urlOf
 */
async function keepOnlineStreams(records, urlOf) {
  const online = [];
  let i = 0;
  let offline = 0;
  async function worker() {
    while (i < records.length) {
      const r = records[i++];
      try {
        const res = await fetch(urlOf(r.stream ?? ''), {
          headers: { 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(STREAM_TIMEOUT_MS),
          redirect: 'error',
        });
        const text = await res.text();
        if (res.ok && text.startsWith('#EXTM3U')) online.push(r);
        else offline++;
      } catch {
        offline++;
      }
    }
  }
  await Promise.all(Array.from({ length: STREAM_CONCURRENCY }, worker));
  online.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { online, offline };
}

async function readPrevious() {
  for (const f of PREVIOUS_FILES) {
    try {
      await access(f);
      return recordsFromCatalog(await readFile(f, 'utf8'));
    } catch {
      /* prova il successivo */
    }
  }
  return {};
}

async function main() {
  const argv = process.argv.slice(2);
  const skip = new Set();
  /** @type {Set<string> | null} */
  let only = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--skip' && argv[i + 1]) skip.add(argv[++i]);
    if (argv[i] === '--only' && argv[i + 1]) only = new Set(argv[++i].split(','));
  }
  if (argv.includes('--meta-only')) {
    // Rigenera solo i metadati dal catalogo già presente (nessuna rete).
    const text = await readFile(OUT_FILE, 'utf8');
    await writeFile(META_FILE, serializeMeta(text), 'utf8');
    console.log(`✔ ${path.relative(process.cwd(), META_FILE)}`);
    return;
  }

  const previous = only ? await readPrevious() : {};
  /** @type {Partial<Record<import('./camCatalogCore.mjs').SourceId, import('./camCatalogCore.mjs').CamRecord[]>>} */
  const bySource = {};
  let failed = false;

  console.log(`CAM catalog — ${new Date().toISOString()}\n`);
  for (const source of SOURCE_ORDER) {
    if (skip.has(source)) {
      console.log(`• ${source.padEnd(12)} ESCLUSA (--skip)`);
      continue;
    }
    if (only && !only.has(source)) {
      if (previous[source]) {
        bySource[source] = previous[source];
        console.log(`• ${source.padEnd(12)} ripresa dal catalogo pubblicato: ${previous[source]?.length}`);
      }
      continue;
    }
    const rules = SOURCE_RULES[source];
    try {
      const result = normalizeCandidates(source, await FETCHERS[source]());
      let accepted = result.accepted;
      let offlineText = '';
      if (rules.kind === 'L' && rules.streamUrl && rules.optional) {
        // Fonti facoltative (GARR.tv): verifica rigorosa, camera per camera,
        // con sequenza HLS che deve avanzare (flussi che si riavviano spesso).
        const streamUrl = rules.streamUrl;
        const checks = await Promise.all(
          accepted.map(async (r) => ({ r, v: await verifyHlsLive(streamUrl(r.stream ?? ''), { headers: { 'User-Agent': USER_AGENT } }) })),
        );
        const online = checks.filter((c) => c.v.ok).map((c) => c.r);
        const off = checks.filter((c) => !c.v.ok).map((c) => `${c.r.name} [${c.v.reason}]`);
        offlineText = ` · stream in diretta verificati ${online.length}, esclusi ${off.length}${off.length ? `: ${off.join('; ')}` : ''}`;
        accepted = online;
      } else if (rules.kind === 'L' && rules.streamUrl) {
        const { online, offline } = await keepOnlineStreams(accepted, rules.streamUrl);
        offlineText = ` · stream verificati online ${online.length}, offline ${offline}`;
        accepted = online;
      }
      const rejectedText = Object.entries(result.rejected)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');
      console.log(
        `• ${source.padEnd(12)} ${rules.kind === 'L' ? 'LIVE' : 'SNAP'} ricevuti ${String(result.total).padStart(5)} · ` +
          `validi ${String(result.accepted.length).padStart(5)}${offlineText} · ` +
          `scartati ${result.total - result.accepted.length}${rejectedText ? ` (${rejectedText})` : ''}`,
      );
      if (accepted.length < rules.minCount) {
        console.error(`  ✖ ${source}: ${accepted.length} camere < minimo ${rules.minCount}`);
        failed = true;
        continue;
      }
      bySource[source] = accepted;
    } catch (err) {
      console.error(`  ✖ ${source}: ${err instanceof Error ? err.message : String(err)}`);
      if (rules.optional) {
        console.error(`    (fonte facoltativa: esclusa da questo catalogo)`);
        continue;
      }
      failed = true;
    }
  }

  if (failed) {
    console.error('\nCatalogo NON scritto: correggere o escludere la fonte con --skip <source>.');
    process.exitCode = 1;
    return;
  }

  const text = serializeCatalog(bySource);
  await mkdir(CAM_DIR, { recursive: true });
  await writeFile(OUT_FILE, text, 'utf8');
  await writeFile(META_FILE, serializeMeta(text), 'utf8');
  const total = Object.values(bySource).reduce((n, r) => n + (r?.length ?? 0), 0);
  console.log(
    `\n✔ ${path.relative(process.cwd(), OUT_FILE)} — ${total} camere, ${(Buffer.byteLength(text) / 1024).toFixed(1)} KB`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
