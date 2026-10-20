/**
 * Provider FINTO per lo sviluppo locale (`npm run dev`): risponde come
 * FlyItalyADSB con il fixture readsb dei test, riallineato all'ora attuale.
 * Nessuna rete esterna, nessuna chiave, nessun consumo della quota reale.
 *
 *   npm run dev:fake-upstream   # http://127.0.0.1:8799
 */
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';

const PORT = 8799;
const fixture = JSON.parse(
  readFileSync(new URL('../test/fixtures/readsb-point.json', import.meta.url), 'utf8'),
) as { now: number };

let served = 0;
createServer((req, res) => {
  served += 1;
  const body = { ...fixture, now: Date.now() };
  console.log(`#${served} ${req.method} ${req.url}`);
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Provider finto su http://127.0.0.1:${PORT} (nessuna chiamata reale)`);
});
