// @ts-check
/**
 * generateSeismicBaseline.mjs — genera la baseline statistica storica per la
 * funzione "Anomalia Sismica" di EarthRadar.
 *
 * ┌─ PRINCIPIO ────────────────────────────────────────────────────────────┐
 * │ Questo script NON viene eseguito all'apertura dell'app. Serve solo in   │
 * │ fase di sviluppo/build per produrre un dataset aggregato e compatto     │
 * │ (`public/data/seismic-baseline.json`) derivato ESCLUSIVAMENTE da dati   │
 * │ pubblici e gratuiti USGS. L'app a runtime confronta la sismicità        │
 * │ recente (query live USGS) con questa baseline pre-calcolata, senza mai  │
 * │ riscaricare l'intero catalogo ventennale.                               │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * FONTE:    USGS Earthquake Hazards Program — FDSN Event Web Service
 * ENDPOINT: https://earthquake.usgs.gov/fdsnws/event/1/query
 * FORMATO:  CSV (solo colonne `time` e `mag`), scaricato per anno.
 * LICENZA:  dati USGS di pubblico dominio (U.S. Government work). Attribuzione
 *           richiesta: "USGS Earthquake Hazards Program".
 *
 * METODOLOGIA
 *  - Periodo baseline: 2006-01-01 .. 2025-12-31 (20 anni civili completi).
 *  - Soglie di magnitudo analizzate separatamente: M≥5.5, M≥6.0, M≥7.0.
 *  - Nessun declustering: il catalogo NON viene alterato. Le sequenze di
 *    aftershock restano incluse (scelta trasparente; l'app mostra una nota).
 *  - Per ogni soglia si calcola, per ciascun anno: numero eventi ed energia
 *    sismica stimata (E_joules = 10^(1.5*M + 4.8), relazione standard di
 *    Gutenberg–Richter per l'energia irradiata; unità: joule).
 *  - Distribuzione di riferimento: per ogni combinazione (finestra, soglia)
 *    si campiona il numero di eventi in finestre mobili di 30/60/90 giorni,
 *    con passo mensile (~30 giorni). Le finestre di 60/90 giorni si
 *    sovrappongono: questo introduce autocorrelazione che NON distorce
 *    media/mediana/percentili ma va tenuta presente (documentata nell'app).
 *
 * USO:  node scripts/generateSeismicBaseline.mjs
 *       (richiede solo connessione a earthquake.usgs.gov, nessuna API key)
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, '../public/data/seismic-baseline.json');

const ENDPOINT = 'https://earthquake.usgs.gov/fdsnws/event/1/query';
const BASE_MIN_MAG = 5.5; // superset: le soglie superiori si derivano filtrando
const THRESHOLDS = [5.5, 6.0, 7.0];
const WINDOWS_DAYS = [30, 60, 90];
const STEP_DAYS = 30; // passo mensile per il campionamento delle finestre
const YEAR_START = 2006;
const YEAR_END = 2025; // incluso
const DAY_MS = 24 * 60 * 60 * 1000;

/** Energia sismica irradiata stimata (joule) da magnitudo — Gutenberg–Richter. */
function magnitudeEnergyJoules(mag) {
  return Math.pow(10, 1.5 * mag + 4.8);
}

/** Scarica gli eventi M≥BASE_MIN_MAG di un anno come [{ time, mag }]. */
async function fetchYear(year) {
  const start = `${year}-01-01T00:00:00`;
  const end = `${year + 1}-01-01T00:00:00`;
  const url =
    `${ENDPOINT}?format=csv&starttime=${start}&endtime=${end}` +
    `&minmagnitude=${BASE_MIN_MAG}&orderby=time-asc`;
  const res = await fetch(url, { headers: { Accept: 'text/csv' } });
  if (!res.ok) throw new Error(`USGS ${year} HTTP ${res.status}`);
  const text = await res.text();
  const lines = text.split('\n');
  const header = lines[0].split(',');
  const timeIdx = header.indexOf('time');
  const magIdx = header.indexOf('mag');
  if (timeIdx === -1 || magIdx === -1) throw new Error(`CSV header inatteso: ${lines[0]}`);
  const events = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    // Le colonne time/mag sono le prime 5 (nessuna virgola annidata prima di mag).
    const cols = line.split(',');
    const t = Date.parse(cols[timeIdx]);
    const m = Number.parseFloat(cols[magIdx]);
    if (!Number.isFinite(t) || !Number.isFinite(m)) continue;
    events.push({ time: t, mag: m });
  }
  return events;
}

/** Conta gli eventi ≥ soglia con time in [from, to). */
function countInRange(events, from, to, minMag) {
  let n = 0;
  for (const e of events) {
    if (e.time >= from && e.time < to && e.mag >= minMag) n++;
  }
  return n;
}

async function main() {
  console.log('› EarthRadar — generazione baseline sismica (dati USGS reali)');
  /** @type {{time:number,mag:number}[]} */
  let all = [];
  for (let y = YEAR_START; y <= YEAR_END; y++) {
    process.stdout.write(`  fetch ${y} … `);
    const ev = await fetchYear(y);
    all = all.concat(ev);
    console.log(`${ev.length} eventi M≥${BASE_MIN_MAG}`);
  }
  all.sort((a, b) => a.time - b.time);
  console.log(`  totale: ${all.length} eventi M≥${BASE_MIN_MAG} (${YEAR_START}–${YEAR_END})`);

  // ─── Statistiche annuali per soglia ────────────────────────────────────
  /** @type {Record<string, Record<string, {count:number, energyJoules:number}>>} */
  const annual = {};
  for (const thr of THRESHOLDS) {
    const key = thr.toFixed(1);
    annual[key] = {};
    for (let y = YEAR_START; y <= YEAR_END; y++) {
      const from = Date.parse(`${y}-01-01T00:00:00Z`);
      const to = Date.parse(`${y + 1}-01-01T00:00:00Z`);
      let count = 0;
      let energy = 0;
      for (const e of all) {
        if (e.time >= from && e.time < to && e.mag >= thr) {
          count++;
          energy += magnitudeEnergyJoules(e.mag);
        }
      }
      annual[key][String(y)] = {
        count,
        // energia in joule, arrotondata a 3 cifre significative per compattezza
        energyJoules: Number(energy.toPrecision(4)),
      };
    }
  }

  // ─── Campioni di finestre mobili (passo mensile) ───────────────────────
  const firstStart = Date.parse(`${YEAR_START}-01-01T00:00:00Z`);
  const lastEnd = Date.parse(`${YEAR_END + 1}-01-01T00:00:00Z`);
  /** @type {Record<string, Record<string, number[]>>} */
  const windows = {};
  for (const w of WINDOWS_DAYS) {
    const wKey = String(w);
    windows[wKey] = {};
    const span = w * DAY_MS;
    const step = STEP_DAYS * DAY_MS;
    for (const thr of THRESHOLDS) {
      const tKey = thr.toFixed(1);
      const samples = [];
      for (let start = firstStart; start + span <= lastEnd; start += step) {
        samples.push(countInRange(all, start, start + span, thr));
      }
      windows[wKey][tKey] = samples;
    }
  }

  const out = {
    meta: {
      source: 'USGS Earthquake Hazards Program — FDSN Event Web Service',
      endpoint: ENDPOINT,
      queryFormat: 'csv',
      generatedAt: new Date().toISOString(),
      baselineStart: `${YEAR_START}-01-01`,
      baselineEnd: `${YEAR_END}-12-31`,
      thresholds: THRESHOLDS,
      windowsDays: WINDOWS_DAYS,
      windowStepDays: STEP_DAYS,
      energyFormula: 'E_joules = 10^(1.5*M + 4.8)',
      energyUnit: 'joule',
      declustering: 'nessuno — catalogo completo, sequenze di aftershock incluse',
      exclusions: 'nessuna',
      totalEventsBaseMag: all.length,
      baseMinMagnitude: BASE_MIN_MAG,
      methodology:
        'Conteggi annuali ed energia per soglia; distribuzione di riferimento ' +
        'campionata su finestre mobili di 30/60/90 giorni con passo mensile ' +
        '(~30 giorni) sull’intero periodo. Nessun declustering.',
      license: 'Dati USGS di pubblico dominio (U.S. Government work).',
      attribution: 'USGS Earthquake Hazards Program',
      reproduce: 'node scripts/generateSeismicBaseline.mjs',
    },
    annual,
    windows,
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(out) + '\n', 'utf8');
  const bytes = Buffer.byteLength(JSON.stringify(out));
  console.log(`✓ scritto ${OUT_PATH} (${(bytes / 1024).toFixed(1)} KB)`);
  // Riepilogo verificabile
  for (const thr of THRESHOLDS) {
    const key = thr.toFixed(1);
    let tot = 0;
    for (let y = YEAR_START; y <= YEAR_END; y++) tot += annual[key][String(y)].count;
    console.log(`  M≥${key}: ${tot} eventi totali nel periodo`);
  }
}

main().catch((err) => {
  console.error('✗ generazione fallita:', err.message);
  process.exit(1);
});
