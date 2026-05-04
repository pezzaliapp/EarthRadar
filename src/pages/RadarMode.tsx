import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '@/i18n';
import { useQuakes } from '@/hooks/useQuakes';
import { useSatellites } from '@/hooks/useSatellites';
import { useAircraft } from '@/hooks/useAircraft';
import { useLayersStore } from '@/store/layersStore';
import { propagateSatrec, tleToSatrec, type Satrec } from '@/lib/sgp4Lite';
import {
  filterInRange,
  isSwept,
  normalizeAngle,
  polarToCanvas,
  RADAR_RANGES,
  toPolar,
  type RadarRange,
} from '@/lib/radarPolar';
import type { CelestrakGroup } from '@/services/celestrakGroups';

const RADAR_GROUPS: CelestrakGroup[] = ['stations', 'visual'];
const SWEEP_DEG_PER_SEC = 36; // 10 sec per giro completo
const PING_COOLDOWN_MS = 200;

interface SatHandle {
  noradId: number;
  name: string;
  sat: Satrec;
}

export default function RadarMode() {
  const { t } = useTranslation();

  // ---------- Stato UI ----------
  const [rangeId, setRangeId] = useState<RadarRange['id']>('1000');
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [aircraftEnabled, setAircraftEnabled] = useState(false);
  const [now, setNow] = useState(() => Date.now()); // tick lento per stats UI

  const range = useMemo(
    () => RADAR_RANGES.find((r) => r.id === rangeId) ?? RADAR_RANGES[2],
    [rangeId],
  );

  // ---------- Centro radar ----------
  const userLoc = useLayersStore((s) => s.userLocationForPasses);
  const setUserLoc = useLayersStore((s) => s.setUserLocationForPasses);
  const mapCenter = useLayersStore((s) => s.mapCenter);
  const center = userLoc ?? { lat: mapCenter[0], lon: mapCenter[1] };
  const centerLabel = userLoc ? t('radarMode.centerGps') : t('radarMode.centerMap');

  function requestGeolocation() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLoc({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => {
        // permesso negato: silenzioso, l'utente può sempre usare il centro mappa
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    );
  }

  // ---------- Sorgenti dati ----------
  const quakes = useQuakes('all_day');
  const satellites = useSatellites(RADAR_GROUPS);
  const aircraft = useAircraft(aircraftEnabled);

  // Pre-parse dei satrec una volta sola per record (non ad ogni frame).
  const satHandles = useMemo<SatHandle[]>(() => {
    const out: SatHandle[] = [];
    for (const rec of satellites.records) {
      try {
        const sat = tleToSatrec(rec.tle);
        if (!sat) continue;
        if ((sat as { error?: number }).error && (sat as { error?: number }).error !== 0) continue;
        out.push({ noradId: rec.noradId, name: rec.name, sat });
      } catch {
        // skip TLE malformato
      }
    }
    return out;
  }, [satellites.records]);

  // ---------- Audio ping ----------
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastPingAtRef = useRef<number>(0);

  function ensureAudioCtx(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (audioCtxRef.current) return audioCtxRef.current;
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audioCtxRef.current = new Ctor();
    return audioCtxRef.current;
  }

  function playPing() {
    if (!audioEnabled) return;
    const t0 = performance.now();
    if (t0 - lastPingAtRef.current < PING_COOLDOWN_MS) return;
    lastPingAtRef.current = t0;
    const ctx = ensureAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  }

  useEffect(() => {
    return () => {
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, []);

  // ---------- Canvas refs ----------
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const sweepRef = useRef(0);
  const prevSweepRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number>(0);

  // Per il triggering del ping: tracciamo i target visti come "swept" nell'ultimo giro
  // per evitare di pingare due volte sullo stesso bersaglio.
  const pingedRef = useRef<Set<string>>(new Set());

  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Stats reattive (counts in raggio) ----------
  const inRangeCounts = useMemo(() => {
    const q = filterInRange(
      quakes.data,
      center.lat,
      center.lon,
      range.km,
      (qq) => ({ lat: qq.lat, lon: qq.lon }),
    ).length;
    let s = 0;
    const at = new Date(now);
    for (const h of satHandles) {
      const p = propagateSatrec(h.sat, at);
      if (!p) continue;
      const polar = toPolar(center.lat, center.lon, p.lat, p.lon, range.km);
      if (polar.inRange) s += 1;
    }
    const a = filterInRange(
      aircraft.data,
      center.lat,
      center.lon,
      range.km,
      (ac) => ({ lat: ac.lat, lon: ac.lon }),
    ).length;
    return { quakes: q, sats: s, aircraft: a };
  }, [quakes.data, satHandles, aircraft.data, center.lat, center.lon, range.km, now]);

  // Tick "logico" 1Hz per refresh stats e label "tempo"
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // ---------- Render canvas (RAF) ----------
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    function resize() {
      if (!canvas || !wrap) return;
      const dpr = window.devicePixelRatio || 1;
      const cssSize = Math.min(wrap.clientWidth, 720); // square
      canvas.style.width = `${cssSize}px`;
      canvas.style.height = `${cssSize}px`;
      canvas.width = Math.floor(cssSize * dpr);
      canvas.height = Math.floor(cssSize * dpr);
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    function draw(ts: number) {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const css = canvas.clientWidth;
      const cx = css / 2;
      const cy = css / 2;
      const R = (css / 2) * 0.94;

      // Aggiorna sweep
      if (lastFrameRef.current === 0) lastFrameRef.current = ts;
      const dt = (ts - lastFrameRef.current) / 1000;
      lastFrameRef.current = ts;
      const prev = sweepRef.current;
      const cur = reducedMotion ? prev : normalizeAngle(prev + SWEEP_DEG_PER_SEC * dt);
      prevSweepRef.current = prev;
      sweepRef.current = cur;
      // Quando lo sweep wrap-around (passa da ~360 a 0), reset del set "già pingato"
      if (cur < prev) pingedRef.current.clear();

      // Background
      ctx.clearRect(0, 0, css, css);
      const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      bgGrad.addColorStop(0, 'rgba(35, 80, 35, 0.55)');
      bgGrad.addColorStop(0.7, 'rgba(8, 30, 12, 0.85)');
      bgGrad.addColorStop(1, 'rgba(2, 10, 4, 0.95)');
      ctx.fillStyle = bgGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();

      // Ring concentriche
      ctx.strokeStyle = 'rgba(138, 255, 92, 0.35)';
      ctx.lineWidth = 1;
      ctx.font = '10px ui-monospace, "JetBrains Mono", monospace';
      ctx.fillStyle = 'rgba(138, 255, 92, 0.55)';
      for (let i = 1; i <= 4; i++) {
        const r = (R * i) / 4;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        const km = (range.km * i) / 4;
        ctx.fillText(`${km.toFixed(0)} km`, cx + 4, cy - r + 12);
      }

      // Linee cardinali
      ctx.beginPath();
      ctx.moveTo(cx - R, cy);
      ctx.lineTo(cx + R, cy);
      ctx.moveTo(cx, cy - R);
      ctx.lineTo(cx, cy + R);
      ctx.strokeStyle = 'rgba(138, 255, 92, 0.25)';
      ctx.stroke();

      // Etichette N/E/S/W
      ctx.fillStyle = 'rgba(138, 255, 92, 0.85)';
      ctx.font = '11px ui-monospace, "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('N', cx, cy - R - 6);
      ctx.fillText('S', cx, cy + R + 14);
      ctx.textAlign = 'left';
      ctx.fillText('E', cx + R + 6, cy + 4);
      ctx.textAlign = 'right';
      ctx.fillText('W', cx - R - 6, cy + 4);
      ctx.textAlign = 'left';

      // Sweep (gradiente angolare simulato con clip + linea)
      if (!reducedMotion) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.clip();
        const sweepRad = ((cur - 90) * Math.PI) / 180;
        const tailRad = sweepRad - Math.PI / 4;
        const grd = ctx.createLinearGradient(
          cx + Math.cos(tailRad) * R,
          cy + Math.sin(tailRad) * R,
          cx + Math.cos(sweepRad) * R,
          cy + Math.sin(sweepRad) * R,
        );
        grd.addColorStop(0, 'rgba(138, 255, 92, 0)');
        grd.addColorStop(1, 'rgba(138, 255, 92, 0.45)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, R, tailRad, sweepRad);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        // lancia primaria
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(sweepRad) * R, cy + Math.sin(sweepRad) * R);
        ctx.strokeStyle = 'rgba(180, 255, 130, 0.9)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Plot: TERREMOTI
      for (const q of quakes.data) {
        const polar = toPolar(center.lat, center.lon, q.lat, q.lon, range.km);
        if (!polar.inRange) continue;
        const { x, y } = polarToCanvas(polar.bearingDeg, polar.rangeNorm, cx, cy, R);
        const radius = 2 + Math.max(0, q.magnitude) * 1.3;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 92, 92, 0.85)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 200, 200, 0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
        // Trigger ping se la sweep ha appena passato il bearing
        if (audioEnabled && !reducedMotion) {
          const id = `q:${q.id}`;
          if (!pingedRef.current.has(id) && isSwept(polar.bearingDeg, prev, cur)) {
            pingedRef.current.add(id);
            playPing();
          }
        }
      }

      // Plot: SATELLITI (propagazione SGP4 al frame corrente)
      const atDate = new Date();
      for (const h of satHandles) {
        const p = propagateSatrec(h.sat, atDate);
        if (!p) continue;
        const polar = toPolar(center.lat, center.lon, p.lat, p.lon, range.km);
        if (!polar.inRange) continue;
        const { x, y } = polarToCanvas(polar.bearingDeg, polar.rangeNorm, cx, cy, R);
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(92, 240, 255, 0.95)';
        ctx.fill();
        if (audioEnabled && !reducedMotion) {
          const id = `s:${h.noradId}`;
          if (!pingedRef.current.has(id) && isSwept(polar.bearingDeg, prev, cur)) {
            pingedRef.current.add(id);
            playPing();
          }
        }
      }

      // Plot: AEREI (triangoli orientati per heading)
      for (const ac of aircraft.data) {
        const polar = toPolar(center.lat, center.lon, ac.lat, ac.lon, range.km);
        if (!polar.inRange) continue;
        const { x, y } = polarToCanvas(polar.bearingDeg, polar.rangeNorm, cx, cy, R);
        const heading = ac.headingDeg ?? 0;
        const rad = ((heading - 90) * Math.PI) / 180;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rad);
        ctx.beginPath();
        ctx.moveTo(6, 0);
        ctx.lineTo(-4, -3);
        ctx.lineTo(-4, 3);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 220, 92, 0.95)';
        ctx.fill();
        ctx.restore();
        if (audioEnabled && !reducedMotion) {
          const id = `a:${ac.icao24}`;
          if (!pingedRef.current.has(id) && isSwept(polar.bearingDeg, prev, cur)) {
            pingedRef.current.add(id);
            playPing();
          }
        }
      }

      // Crosshair centrale
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(220, 255, 200, 0.95)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 8, cy);
      ctx.lineTo(cx + 8, cy);
      ctx.moveTo(cx, cy - 8);
      ctx.lineTo(cx, cy + 8);
      ctx.stroke();

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      ro.disconnect();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastFrameRef.current = 0;
    };
    // playPing è ricostruito ogni render ma le sue dipendenze (audioEnabled) sono già
    // nelle deps di questo effect, quindi il closure risulta aggiornato dopo il
    // re-run. La regola exhaustive-deps non lo riesce a inferire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    quakes.data,
    satHandles,
    aircraft.data,
    center.lat,
    center.lon,
    range.km,
    audioEnabled,
    reducedMotion,
  ]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <div className="label text-radar-phosphor">{t('radarMode.tributeBadge')}</div>
        <h1 className="text-2xl font-semibold text-space-50">{t('radarMode.title')}</h1>
        <p className="label">{t('radarMode.subtitle')}</p>
      </header>

      <p className="text-sm text-space-200">{t('radarMode.intro')}</p>

      <section className="glass space-y-4 p-4 sm:p-6">
        {/* Controls */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="label">{t('radarMode.rangeLabel')}</span>
            {RADAR_RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRangeId(r.id)}
                className={`min-h-[44px] rounded-xl border px-3 py-2 text-xs font-mono uppercase tracking-wider transition-colors ${
                  rangeId === r.id
                    ? 'border-radar-phosphor bg-radar-phosphor/15 text-radar-phosphor shadow-glow-phosphor'
                    : 'border-space-500/40 text-space-200 hover:border-radar-phosphor/50 hover:text-radar-phosphor'
                }`}
                aria-pressed={rangeId === r.id}
              >
                {t('radarMode.rangeKm', { km: r.km })}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="label">{t('radarMode.centerLabel')}</span>
            <span className="chip border-space-500/40 text-space-100">
              {centerLabel} · {center.lat.toFixed(2)}, {center.lon.toFixed(2)}
            </span>
            <button
              type="button"
              onClick={requestGeolocation}
              className="min-h-[44px] rounded-xl border border-space-500/40 px-3 py-2 text-xs font-mono uppercase tracking-wider text-space-100 hover:border-cyan-glow/60 hover:text-cyan-glow"
            >
              {t('radarMode.useMyLocation')}
            </button>
            {userLoc && (
              <button
                type="button"
                onClick={() => setUserLoc(null)}
                className="min-h-[44px] rounded-xl border border-space-500/40 px-3 py-2 text-xs font-mono uppercase tracking-wider text-space-100 hover:border-cyan-glow/60 hover:text-cyan-glow"
              >
                {t('radarMode.useMapCenter')}
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-space-500/40 px-3 py-2 text-xs font-mono uppercase tracking-wider text-space-100">
              <input
                type="checkbox"
                checked={audioEnabled}
                onChange={(e) => setAudioEnabled(e.target.checked)}
                className="h-4 w-4 accent-radar-phosphor"
              />
              {audioEnabled ? t('radarMode.audioOn') : t('radarMode.audioOff')}
            </label>

            <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-space-500/40 px-3 py-2 text-xs font-mono uppercase tracking-wider text-space-100">
              <input
                type="checkbox"
                checked={aircraftEnabled}
                onChange={(e) => setAircraftEnabled(e.target.checked)}
                className="h-4 w-4 accent-radar-phosphor"
              />
              {t('radarMode.showAircraft')}
            </label>
          </div>

          {!aircraftEnabled && (
            <p className="text-[11px] text-space-300">{t('radarMode.aircraftHint')}</p>
          )}
          {reducedMotion && (
            <p className="text-[11px] text-space-300">{t('radarMode.reducedMotionNotice')}</p>
          )}
        </div>

        {/* Canvas */}
        <div ref={wrapRef} className="mx-auto w-full max-w-[720px]">
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={t('radarMode.title')}
            className="block w-full rounded-full border border-radar-phosphor/30 bg-black"
          />
        </div>

        {/* Stats */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-mono text-radar-phosphor">
            {t('radarMode.stats', {
              quakes: inRangeCounts.quakes,
              sats: inRangeCounts.sats,
              aircraft: inRangeCounts.aircraft,
            })}
          </span>
          <span className="label text-space-300">
            {(quakes.loading || satellites.loading) && t('radarMode.loading')}
          </span>
        </div>

        {/* Legend */}
        <div className="grid grid-cols-2 gap-2 text-[11px] text-space-200 sm:grid-cols-4">
          <LegendDot color="#ff5c5c" label={t('radarMode.legendQuakes')} />
          <LegendDot color="#5cf0ff" label={t('radarMode.legendSatellites')} />
          <LegendDot color="#ffdc5c" label={t('radarMode.legendAircraft')} />
          <LegendDot color="#dcffc8" label={t('radarMode.legendCenter')} ring />
        </div>
      </section>

      <p className="text-xs text-space-300">{t('radarMode.disclaimer')}</p>
    </div>
  );
}

function LegendDot({ color, label, ring }: { color: string; label: string; ring?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden
        className="inline-block h-3 w-3 rounded-full"
        style={
          ring
            ? { border: `1.5px solid ${color}`, background: 'transparent' }
            : { background: color }
        }
      />
      <span>{label}</span>
    </div>
  );
}
