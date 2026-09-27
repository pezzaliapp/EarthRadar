import type { GatewayAircraft } from '@/services/aircraftGatewayApi';

/**
 * Nome dell'aereo per la UI: callsign, poi registrazione, poi ICAO.
 * Per LADD/PIA solo "Aeromobile riservato": nessun identificativo, né
 * ricostruito né derivato dal token anonimo.
 */
export function aircraftTitle(a: GatewayAircraft, language: string): string {
  if (a.privacyRestricted)
    return language === 'it' ? 'Aeromobile riservato' : 'Restricted aircraft';
  return a.callsign ?? a.registration ?? a.icao24 ?? '—';
}
