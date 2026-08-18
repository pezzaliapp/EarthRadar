import { describe, expect, it } from 'vitest';
import itJson from '@/i18n/it.json';
import enJson from '@/i18n/en.json';

/** Estrae ricorsivamente tutte le stringhe di un oggetto i18n. */
function collectStrings(obj: unknown): string[] {
  if (typeof obj === 'string') return [obj];
  if (obj && typeof obj === 'object') return Object.values(obj).flatMap(collectStrings);
  return [];
}

/**
 * Frasi allarmistiche che NON devono mai comparire nei contenuti di
 * Anomalia Sismica. (Termini come "previsione"/"early warning" sono ammessi
 * solo nel disclaimer, in forma NEGATA, quindi non li includiamo qui: filtriamo
 * frasi inequivocabilmente allarmistiche.)
 */
const FORBIDDEN_IT = [
  'allarme globale',
  'emergenza sismica',
  'terremoti fuori controllo',
  'fuori controllo',
  'rischio imminente',
  'terremoto in arrivo',
  'prossimo grande terremoto',
  'situazione critica',
  'escalation',
];
const FORBIDDEN_EN = [
  'global alarm',
  'seismic emergency',
  'out of control',
  'imminent risk',
  'incoming earthquake',
  'next big earthquake',
  'critical situation',
  'escalation',
];

describe('Anomalia Sismica — nessun linguaggio allarmistico', () => {
  it('il testo italiano non contiene frasi allarmistiche', () => {
    const text = collectStrings(itJson.anomaly).join('  ').toLowerCase();
    for (const phrase of FORBIDDEN_IT) {
      expect(text, `frase vietata trovata: "${phrase}"`).not.toContain(phrase);
    }
  });

  it('il testo inglese non contiene frasi allarmistiche', () => {
    const text = collectStrings(enJson.anomaly).join('  ').toLowerCase();
    for (const phrase of FORBIDDEN_EN) {
      expect(text, `forbidden phrase found: "${phrase}"`).not.toContain(phrase);
    }
  });

  it("l'indice non è etichettato come rischio/pericolo/allerta", () => {
    const idxIt = itJson.anomaly.index.title.toLowerCase();
    const idxEn = enJson.anomaly.index.title.toLowerCase();
    for (const bad of ['rischio', 'pericolo', 'allerta']) {
      expect(idxIt).not.toContain(bad);
    }
    for (const bad of ['risk', 'danger', 'alert']) {
      expect(idxEn).not.toContain(bad);
    }
  });

  it('espone i quattro livelli di scostamento previsti', () => {
    const idx = itJson.anomaly.index;
    for (const level of ['normal', 'above_average', 'unusual', 'insufficient'] as const) {
      expect(idx[level].label).toBeTruthy();
      expect(idx[level].desc).toBeTruthy();
    }
  });
});
