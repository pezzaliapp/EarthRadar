/**
 * Nessun test del gateway usa la rete: provider e Durable Object sono sempre
 * finti. Qualunque fetch reale (in particolare verso FlyItalyADSB, che
 * consumerebbe la quota della chiave) fa fallire il test.
 */
globalThis.fetch = ((input: RequestInfo | URL) => {
  const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
  throw new Error(`rete reale bloccata nei test del gateway: ${new URL(url).hostname}`);
}) as typeof fetch;
