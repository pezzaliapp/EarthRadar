/**
 * ROLLBACK 0.3.1-compat — classe del Durable Object mantenuta ma INERTE.
 *
 * Cloudflare non consente `wrangler rollback` oltre una migrazione di classe
 * Durable Object, e rimuovere la classe richiederebbe `deleted_classes`
 * (cancellazione definitiva dei dati). Questa versione ripristina il
 * comportamento 0.3.0 del gateway lasciando classe, binding e migrazione
 * invariati: nessun cambio di ciclo di vita, nessun dato cancellato.
 * Il gateway 0.3.x non invoca mai l'oggetto: nessuna richiesta, nessun costo.
 */
export class UpstreamBudgetObject {
  constructor(_state: unknown, _env?: unknown) {
    void _state;
    void _env;
  }

  async fetch(): Promise<Response> {
    return new Response('{"error":"budget_disabled"}', {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
