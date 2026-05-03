import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@/i18n';
import { useLayersStore } from '@/store/layersStore';
import { useSatellites } from '@/hooks/useSatellites';
import {
  orbitalElements,
  propagateSatrec,
  tleToSatrec,
  type Satrec,
} from '@/lib/sgp4Lite';
import { cubeSatTleLink } from '@/lib/deepLinkBuilder';
import type { SatelliteRecord } from '@/services/celestrakApi';

const TICK_MS = 5_000;

/**
 * Pannello dettaglio satellite. Si mostra solo quando `selectedSatellite` è set.
 * Mostra dati orbitali, posizione live e bottone "Visualizza in CubeSat 3D".
 */
export default function SatelliteDetailPanel() {
  const { t, language } = useTranslation();
  const enabled = useLayersStore((s) => s.overlays.satellites?.enabled ?? false);
  const groups = useLayersStore((s) => s.satelliteGroups);
  const selected = useLayersStore((s) => s.selectedSatellite);
  const setSelected = useLayersStore((s) => s.setSelectedSatellite);
  const { records } = useSatellites(enabled ? groups : []);
  const [tick, setTick] = useState(() => Date.now());

  const record: SatelliteRecord | null = useMemo(() => {
    if (!selected) return null;
    return records.find((r) => r.noradId === selected.noradId) ?? null;
  }, [records, selected]);

  const satrec: Satrec | null = useMemo(() => {
    if (!record) return null;
    try {
      return tleToSatrec(record.tle);
    } catch {
      return null;
    }
  }, [record]);

  useEffect(() => {
    if (!selected) return;
    const id = window.setInterval(() => setTick(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, [selected]);

  if (!selected) return null;

  if (!record || !satrec) {
    return (
      <aside className="glass-strong space-y-3 p-4 text-sm">
        <Header title={t('satellites.detailTitle')} subtitle={selected.name} onClose={() => setSelected(null)} />
        <p className="text-space-300">{t('satellites.outOfView')}</p>
      </aside>
    );
  }

  const elements = orbitalElements(satrec, record.gp);
  const position = propagateSatrec(satrec, new Date(tick));
  const cubesatUrl = cubeSatTleLink(record.tle);

  const epoch = elements.epoch;
  const epochStr = isNaN(epoch.getTime()) ? '—' : formatDateTime(epoch, language);

  return (
    <aside className="glass-strong space-y-3 p-4 text-sm">
      <Header title={t('satellites.detailTitle')} subtitle={record.name} onClose={() => setSelected(null)} />

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
        <dt className="label">{t('satellites.noradId')}</dt>
        <dd className="font-mono text-space-50">{record.noradId}</dd>

        <dt className="label">{t('satellites.intlId')}</dt>
        <dd className="font-mono text-space-50">{record.gp.OBJECT_ID ?? '—'}</dd>

        <dt className="label">{t('satellites.epoch')}</dt>
        <dd className="font-mono text-space-50">{epochStr}</dd>

        <dt className="label">{t('satellites.inclination')}</dt>
        <dd className="font-mono text-space-50">{elements.inclinationDeg.toFixed(2)}°</dd>

        <dt className="label">{t('satellites.eccentricity')}</dt>
        <dd className="font-mono text-space-50">{elements.eccentricity.toFixed(5)}</dd>

        <dt className="label">{t('satellites.period')}</dt>
        <dd className="font-mono text-space-50">{elements.periodMinutes.toFixed(1)} min</dd>

        <dt className="label">{t('satellites.perigee')}</dt>
        <dd className="font-mono text-space-50">{elements.perigeeKm.toFixed(0)} km</dd>

        <dt className="label">{t('satellites.apogee')}</dt>
        <dd className="font-mono text-space-50">{elements.apogeeKm.toFixed(0)} km</dd>

        <dt className="label">{t('satellites.semiMajor')}</dt>
        <dd className="font-mono text-space-50">{elements.semiMajorAxisKm.toFixed(0)} km</dd>
      </dl>

      {position && (
        <div className="rounded-xl border border-cyan-glow/30 bg-cyan-glow/5 p-3">
          <p className="label mb-1">{t('common.updated')}</p>
          <p className="font-mono text-[12px] text-cyan-glow">
            {position.lat.toFixed(2)}°, {position.lon.toFixed(2)}° · {position.alt.toFixed(0)} km ·{' '}
            {(position.velocityKms ?? 0).toFixed(2)} km/s
          </p>
        </div>
      )}

      <a
        className="btn-primary w-full"
        href={cubesatUrl}
        target="_blank"
        rel="noreferrer"
      >
        🌐 {t('satellites.openCubesat')} ↗
      </a>

      <p className="text-[11px] text-space-300">
        ⚠ {t('satellites.incertitude')}
      </p>
    </aside>
  );
}

interface HeaderProps {
  title: string;
  subtitle: string;
  onClose: () => void;
}
function Header({ title, subtitle, onClose }: HeaderProps) {
  return (
    <header className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="label">{title}</p>
        <h2 className="truncate text-base font-semibold text-cyan-glow">{subtitle}</h2>
      </div>
      <button
        type="button"
        className="btn-ghost h-7 px-2 py-0 text-[11px]"
        onClick={onClose}
        aria-label="Close detail"
      >
        ✕
      </button>
    </header>
  );
}

function formatDateTime(d: Date, lang: 'it' | 'en'): string {
  return d.toLocaleString(lang === 'it' ? 'it-IT' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }) + ' UTC';
}
