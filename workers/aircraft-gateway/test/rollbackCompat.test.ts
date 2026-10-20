// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { UpstreamBudgetObject } from '../src/budget/durableObject.ts';
import * as entry from '../src/index.ts';

describe('rollback 0.3.1-compat', () => {
  it('esporta ancora la classe del Durable Object, inerte', async () => {
    expect(entry.UpstreamBudgetObject).toBe(UpstreamBudgetObject);
    const res = await new UpstreamBudgetObject({}).fetch();
    expect(res.status).toBe(503);
  });

  it('binding e migrazione invariati: nessun deleted_classes, nessun cambio di ciclo di vita', () => {
    const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
    expect(toml).toMatch(/tag = "v1-upstream-budget"/);
    expect(toml).toMatch(/new_sqlite_classes = \["UpstreamBudgetObject"\]/);
    expect(toml).not.toMatch(/deleted_classes|new_classes|renamed_classes|^\[exports/m);
  });
});
