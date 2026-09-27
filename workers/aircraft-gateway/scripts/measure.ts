/**
 * Misure locali (Node ≥ 22, V8 come workerd): dimensione del payload upstream,
 * dimensione del JSON normalizzato, tempo di JSON.parse + normalizzazione.
 *
 *   npm run measure
 *
 * Esegue UNA richiesta reale per area verso api.adsb.lol (uso leggero,
 * intervallate di 1,5 s) e ripete il parsing in memoria per avere mediane stabili.
 */
import { normalizeAdsbLolResponse } from '../src/normalize.ts';
import { buildPointUrl } from '../src/providers/adsbLol.ts';
import { USER_AGENT } from '../src/config.ts';
import type { Area } from '../src/types.ts';

const AREAS: Array<{ name: string; area: Area }> = [
  { name: 'Nord Italia 150 NM', area: { lat: 45, lon: 9.5, radiusNm: 150 } },
  { name: 'Londra 150 NM', area: { lat: 51.5, lon: -0.5, radiusNm: 150 } },
  { name: 'Francoforte 150 NM', area: { lat: 50, lon: 8.5, radiusNm: 150 } },
  { name: 'New York 150 NM', area: { lat: 40.5, lon: -74, radiusNm: 150 } },
  { name: 'Reggio Emilia 50 NM', area: { lat: 44.7, lon: 10.6, radiusNm: 50 } },
  { name: 'Atlantico 150 NM', area: { lat: 0, lon: -30, radiusNm: 150 } },
];
const ITERATIONS = 30;

async function gzipSize(text: string): Promise<number> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return (await new Response(stream).arrayBuffer()).byteLength;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
}

function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

const rows: string[] = [];
for (const { name, area } of AREAS) {
  const url = buildPointUrl('https://api.adsb.lol', area);
  const t0 = performance.now();
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
  });
  const text = await res.text();
  const netMs = performance.now() - t0;
  if (res.status !== 200) {
    rows.push(`| ${name} | HTTP ${res.status} | | | | | | |`);
    continue;
  }

  const parseTimes: number[] = [];
  const normTimes: number[] = [];
  const totalTimes: number[] = [];
  let out = '';
  let count = 0;
  let upstreamTotal = 0;
  for (let i = 0; i < ITERATIONS; i += 1) {
    const a = performance.now();
    const json = JSON.parse(text) as unknown;
    const b = performance.now();
    const n = normalizeAdsbLolResponse(json);
    const c = performance.now();
    out = JSON.stringify({ v: 1, aircraft: n.aircraft });
    const d = performance.now();
    parseTimes.push(b - a);
    normTimes.push(c - b);
    totalTimes.push(d - a);
    count = n.aircraft.length;
    upstreamTotal = n.stats.upstreamTotal;
  }
  // Prima iterazione = "cold" (JIT non ancora ottimizzato), come in un isolate appena avviato.
  rows.push(
    `| ${name} | ${upstreamTotal} → ${count} | ${kb(text.length)} / ${kb(await gzipSize(text))} gz | ` +
      `${kb(out.length)} / ${kb(await gzipSize(out))} gz | ${median(parseTimes).toFixed(2)} | ` +
      `${median(normTimes).toFixed(2)} | ${median(totalTimes).toFixed(2)} (cold ${totalTimes[0]?.toFixed(2)}) | ` +
      `${netMs.toFixed(0)} |`,
  );
  await new Promise((r) => setTimeout(r, 1500));
}

console.log(
  '| Area | aerei upstream → normalizzati | upstream raw / gz | normalizzato raw / gz | ' +
    'JSON.parse ms | normalize ms | parse+normalize+stringify ms | rete ms |',
);
console.log('|---|---|---|---|---|---|---|---|');
for (const r of rows) console.log(r);
