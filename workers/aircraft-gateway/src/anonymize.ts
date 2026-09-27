import { ANON_ID_MAX_ENTRIES, ANON_ID_ROTATE_MS } from './config.ts';

/**
 * Identificativi anonimi per aerei LADD/PIA.
 *
 * Il token è puramente casuale (crypto.getRandomValues), NON una funzione
 * dell'indirizzo ICAO: non esiste alcun modo di risalire all'indirizzo dal
 * token, nemmeno per forza bruta sui 2^24 indirizzi possibili. La tabella
 * indirizzo → token vive solo nella memoria dell'isolate, non viene mai
 * serializzata ed è svuotata a ogni rotazione: lo stesso aereo mantiene lo
 * stesso token fra un aggiornamento e l'altro (utile all'animazione nella
 * UI), ma non oltre la finestra di rotazione né fra isolate diversi.
 */

export const ANON_ID_PREFIX = 'anon-';

export interface AnonymousIdOptions {
  rotateMs?: number;
  maxEntries?: number;
  now?: () => number;
  randomToken?: () => string;
}

function defaultRandomToken(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

export class AnonymousIds {
  private readonly ids = new Map<string, string>();
  private readonly issued = new Set<string>();
  private epoch = Number.NaN;
  private readonly rotateMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;
  private readonly randomToken: () => string;

  constructor(opts: AnonymousIdOptions = {}) {
    this.rotateMs = opts.rotateMs ?? ANON_ID_ROTATE_MS;
    this.maxEntries = opts.maxEntries ?? ANON_ID_MAX_ENTRIES;
    this.now = opts.now ?? (() => Date.now());
    this.randomToken = opts.randomToken ?? defaultRandomToken;
  }

  get size(): number {
    return this.ids.size;
  }

  /** `key` è l'indirizzo originale: resta solo come chiave in memoria. */
  idFor(key: string): string {
    const epoch = Math.floor(this.now() / this.rotateMs);
    if (epoch !== this.epoch || this.ids.size >= this.maxEntries) {
      this.ids.clear();
      this.issued.clear();
      this.epoch = epoch;
    }
    const existing = this.ids.get(key);
    if (existing) return existing;
    let id = `${ANON_ID_PREFIX}${this.randomToken()}`;
    // Collisione (2^-48 per coppia): rigenera, un token non identifica mai due aerei.
    for (let i = 0; this.issued.has(id) && i < 8; i += 1) {
      id = `${ANON_ID_PREFIX}${this.randomToken()}`;
    }
    this.ids.set(key, id);
    this.issued.add(id);
    return id;
  }
}
