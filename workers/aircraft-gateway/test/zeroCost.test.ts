// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Guardia del vincolo COSTO ZERO (CLAUDE.md): la configurazione del Worker
 * può usare solo risorse incluse nel piano Workers Free, con blocco (errore)
 * al superamento delle quote. Questo test fallisce se qualcuno aggiunge un
 * binding, un'impostazione o un backend che richiede il piano Paid o che
 * potrebbe generare costi.
 */

const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
/** Righe significative, senza commenti. */
const lines = toml
  .split('\n')
  .map((l) => l.replace(/#.*$/, '').trim())
  .filter(Boolean);
const tables = lines.filter((l) => l.startsWith('[')).map((l) => l.replace(/^\[+|\]+$/g, ''));
const keys = lines.filter((l) => !l.startsWith('[')).map((l) => l.split('=')[0]!.trim());

describe('wrangler.toml — solo risorse del piano Workers Free', () => {
  it('nessuna tabella oltre a vars, Durable Object e relativa migrazione', () => {
    expect([...new Set(tables)].sort()).toEqual(
      ['durable_objects.bindings', 'migrations', 'vars'].sort(),
    );
  });

  it('nessun binding o servizio potenzialmente a pagamento', () => {
    const forbidden = [
      'kv_namespaces',
      'r2_buckets',
      'd1_databases',
      'queues',
      'ai',
      'vectorize',
      'hyperdrive',
      'analytics_engine_datasets',
      'browser',
      'images',
      'containers',
      'workflows',
      'dispatch_namespaces',
      'mtls_certificates',
      'send_email',
      'services',
      'tail_consumers',
      'logpush',
      'observability',
      'limits',
      'placement',
      'usage_model',
      'triggers',
      'unsafe',
      'exports',
    ];
    for (const f of forbidden) {
      expect(tables.some((t) => t === f || t.startsWith(`${f}.`))).toBe(false);
      expect(keys).not.toContain(f);
    }
  });

  it('Durable Object SOLO con backend SQLite (incluso nel Free), mai key-value (Paid)', () => {
    expect(keys).toContain('new_sqlite_classes');
    expect(keys).not.toContain('new_classes');
    expect(toml).toMatch(/new_sqlite_classes\s*=\s*\["UpstreamBudgetObject"\]/);
    expect(toml).toMatch(/name\s*=\s*"UPSTREAM_BUDGET"/);
    // Un solo binding Durable Object.
    expect(tables.filter((t) => t === 'durable_objects.bindings')).toHaveLength(1);
  });

  it('nessun accesso che scavalchi la cache condivisa (workers.dev, anteprime)', () => {
    expect(toml).toMatch(/^workers_dev\s*=\s*false/m);
    expect(toml).toMatch(/^preview_urls\s*=\s*false/m);
  });

  it('nessun segreto in chiaro', () => {
    expect(toml).not.toMatch(/FLYITALYADSB_API_KEY\s*=/);
  });
});
