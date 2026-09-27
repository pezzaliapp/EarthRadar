import type { EdgeCacheStore } from '../src/edgeCache.ts';

/**
 * Finta `caches.default` di un data center: rispetta `max-age` con un
 * orologio iniettato, come la Cache API. Più gateway che condividono la
 * stessa istanza simulano più isolate dello stesso data center.
 */
export class FakeEdgeStore implements EdgeCacheStore {
  readonly entries = new Map<
    string,
    { body: string; headers: [string, string][]; expiresAt: number }
  >();
  matches = 0;
  puts = 0;

  private readonly now: () => number;

  constructor(now: () => number) {
    this.now = now;
  }

  async match(request: Request): Promise<Response | undefined> {
    this.matches += 1;
    const e = this.entries.get(request.url);
    if (!e) return undefined;
    if (this.now() >= e.expiresAt) {
      this.entries.delete(request.url);
      return undefined;
    }
    return new Response(e.body, { headers: e.headers });
  }

  async put(request: Request, response: Response): Promise<void> {
    this.puts += 1;
    if (request.method !== 'GET') throw new TypeError('only GET');
    if (response.headers.get('Vary') === '*') throw new TypeError('Vary: *');
    const headers: [string, string][] = [];
    response.headers.forEach((value, key) => headers.push([key, value]));
    const m = /max-age=(\d+)/.exec(response.headers.get('Cache-Control') ?? '');
    if (!m) return;
    this.entries.set(request.url, {
      body: await response.text(),
      headers,
      expiresAt: this.now() + Number(m[1]) * 1000,
    });
  }

  keys(): string[] {
    return [...this.entries.keys()];
  }
}
