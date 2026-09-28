import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from '@/i18n';
import { useLayersStore } from '@/store/layersStore';
import { useCamCatalog } from '@/hooks/useCamCatalog';
import { useCamSnapshot } from '@/hooks/useCamSnapshot';
import { useLivePlayer, type LiveStatus } from '@/hooks/useLivePlayer';
import { useVideoExpand } from '@/hooks/useVideoExpand';
import type { LiveOptions } from '@/lib/livePlayer';
import { camKey, type Cam } from '@/services/camCatalog';
import {
  CAM_SOURCES,
  camHasImage,
  camImageUrl,
  camStreamUrl,
  isAllowedCamUrl,
  isCamSourceId,
  type CamSource,
} from '@/services/camSources';

/**
 * Scheda della camera selezionata, sovrapposta alla mappa (2D) o al globo (3D).
 *
 *  - SNAP: UNA sola immagine dall'host ufficiale, aggiornata solo a scheda aperta.
 *  - LIVE: poster (immagine fissa) + "GUARDA IN DIRETTA"; il video parte solo
 *    dopo il tap, nello stesso spazio. Badge 🔴 LIVE solo durante la riproduzione.
 * Chiudendo la scheda (o cambiando camera, o CAM OFF) il componente si smonta:
 * refresh, stream, timer e listener si fermano subito.
 */
export default function CamCard() {
  const selected = useLayersStore((s) => s.selectedCam);
  const setSelected = useLayersStore((s) => s.setSelectedCam);
  const { cams } = useCamCatalog(true);

  const cam = useMemo<Cam | null>(() => {
    if (!selected) return null;
    const key = camKey(selected.source, selected.id);
    return cams.find((c) => camKey(c.source, c.id) === key) ?? null;
  }, [cams, selected]);

  // Esc chiude la scheda (listener attivo solo a scheda aperta).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setSelected]);

  if (!cam) return null;
  const onClose = () => setSelected(null);
  return cam.type === 'live' ? (
    <CamLiveBody key={camKey(cam.source, cam.id)} cam={cam} onClose={onClose} />
  ) : (
    <CamCardBody key={camKey(cam.source, cam.id)} cam={cam} onClose={onClose} />
  );
}

interface BodyProps {
  cam: Cam;
  onClose: () => void;
}

/** "Elenco webcam": riapre CAM Explorer (visibile solo se è chiuso). */
function BackToExplorer() {
  const { t } = useTranslation();
  const open = useLayersStore((s) => s.camExplorerOpen);
  const setOpen = useLayersStore((s) => s.setCamExplorerOpen);
  if (open) return null;
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="btn-ghost h-9 shrink-0 px-2 py-0 text-[11px]"
    >
      ☰ {t('cam.backToList')}
    </button>
  );
}

/** Guscio comune: intestazione, contenuto, fonte e attribuzioni. */
function CardShell({
  cam,
  source,
  badge,
  onClose,
  children,
  originalLink,
  expanded = false,
}: {
  cam: Cam;
  source: CamSource;
  badge: ReactNode;
  onClose: () => void;
  children: ReactNode;
  originalLink?: ReactNode;
  /** Vista video ingrandita aperta: niente backdrop-blur (intrappolerebbe il
   *  position:fixed dell'overlay) e livello sopra mappa e controlli. */
  expanded?: boolean;
}) {
  const { t, language } = useTranslation();
  return (
    <section
      className={`${
        expanded ? 'z-[3000] border border-cyan-glow/20 bg-space-800 rounded-2xl' : 'glass-strong z-[500]'
      } pointer-events-auto absolute inset-x-2 bottom-2 max-h-[calc(100%-1rem)] overflow-y-auto p-3 shadow-glow sm:bottom-auto sm:right-auto sm:top-2 sm:w-[360px]`}
      role="dialog"
      aria-label={cam.name}
    >
      <header className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-space-50" title={cam.name}>
            📷 {cam.name}
          </h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-space-300">
            <span>{source.region[language]}</span>
            {badge}
          </p>
        </div>
        <BackToExplorer />
        <button
          type="button"
          onClick={onClose}
          className="btn-ghost h-9 min-w-9 shrink-0 px-2 py-0 text-[13px]"
          aria-label={t('cam.close')}
        >
          ✕
        </button>
      </header>

      {children}

      <div className="mt-2 space-y-1 border-t border-space-500/30 pt-2 text-[10px] leading-snug text-space-300">
        <p>
          <span className="label mr-1">{t('cam.source')}</span>
          <span className="text-space-100">{source.label}</span>
        </p>
        <p>{t('cam.ownership', { source: source.label })}</p>
        <ul className="space-y-0.5 font-mono text-[9.5px] text-space-200">
          {source.attribution.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
          <SafeLink href={source.licenseUrl}>
            {t('cam.license')}: {source.licenseName}
          </SafeLink>
          <SafeLink href={source.homepageUrl}>{t('cam.openSource')}</SafeLink>
          {originalLink}
        </p>
      </div>
    </section>
  );
}

// ─── SNAP ──────────────────────────────────────────────────────────────────

export function CamCardBody({ cam, onClose }: BodyProps) {
  const { t, language } = useTranslation();
  const source = isCamSourceId(cam.source) ? CAM_SOURCES[cam.source] : null;
  const snapshot = useCamSnapshot(cam.source, cam.id, cam.poster);
  const originalUrl = camImageUrl(cam.source, cam.id, cam.poster);

  if (!source) return null;

  const loadedAt = snapshot.loadedAt
    ? new Date(snapshot.loadedAt).toLocaleTimeString(language === 'it' ? 'it-IT' : 'en-GB', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <CardShell
      cam={cam}
      source={source}
      onClose={onClose}
      badge={
        <span
          className="rounded border border-cyan-glow/50 px-1 font-mono text-[10px] tracking-wider text-cyan-glow"
          title={t('cam.snapExplain', { every: source.updateEvery[language] })}
        >
          {t('cam.snap')}
        </span>
      }
      originalLink={originalUrl && <SafeLink href={originalUrl}>{t('cam.openImage')}</SafeLink>}
    >
      <div className="relative mt-2 aspect-video w-full overflow-hidden rounded-lg border border-space-500/40 bg-space-950">
        {snapshot.src && snapshot.status !== 'unavailable' ? (
          <>
            <img
              src={snapshot.src}
              alt={t('cam.previewAlt', { name: cam.name })}
              referrerPolicy="no-referrer"
              decoding="async"
              onLoad={snapshot.onLoad}
              onError={snapshot.onError}
              className="h-full w-full object-contain"
            />
            {snapshot.status === 'loading' && (
              <div className="absolute inset-0 grid place-items-center text-[11px] text-space-300">
                …
              </div>
            )}
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center" role="status">
            <p className="text-[12px] font-semibold text-space-100">{t('cam.unavailable')}</p>
            <p className="text-[10px] leading-snug text-space-300">{t('cam.unavailableHint')}</p>
            {snapshot.src !== null && (
              <button type="button" className="btn-ghost h-7 px-2 py-0 text-[11px]" onClick={snapshot.retry}>
                ↻ {t('cam.retry')}
              </button>
            )}
          </div>
        )}
      </div>

      <p className="mt-1.5 text-[10px] leading-snug text-space-300">
        {loadedAt && snapshot.status === 'ok' && <span className="font-mono">{t('cam.loadedAt', { time: loadedAt })} · </span>}
        {t('cam.snapExplain', { every: source.updateEvery[language] })}
      </p>
    </CardShell>
  );
}

// ─── LIVE ──────────────────────────────────────────────────────────────────

/** Badge di stato LIVE: "🔴 LIVE" solo mentre il video è in riproduzione. */
function LiveBadge({ status }: { status: LiveStatus }) {
  const { t } = useTranslation();
  if (status === 'playing') {
    return (
      <span
        className="rounded bg-[#ff3b3b] px-1.5 font-mono text-[10px] font-bold tracking-wider text-white"
        data-testid="live-badge"
      >
        🔴 {t('cam.live')}
      </span>
    );
  }
  if (status === 'offline') {
    return (
      <span className="rounded border border-risk-high/60 px-1 font-mono text-[10px] tracking-wider text-risk-high">
        {t('cam.offline')}
      </span>
    );
  }
  return (
    <span className="rounded border border-[#ff3b3b]/50 px-1 font-mono text-[10px] tracking-wider text-[#ff8a8a]">
      {status === 'loading' ? t('cam.liveConnecting') : t('cam.liveAvailable')}
    </span>
  );
}

export function CamLiveBody({ cam, onClose, liveOptions }: BodyProps & { liveOptions?: LiveOptions }) {
  const { t } = useTranslation();
  const source = isCamSourceId(cam.source) ? CAM_SOURCES[cam.source] : null;
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamUrl = camStreamUrl(cam.source, cam.stream);
  const posterUrl = camImageUrl(cam.source, cam.id, cam.poster);
  const [posterOk, setPosterOk] = useState(true);
  const live = useLivePlayer(videoRef, streamUrl, liveOptions);
  const mediaRef = useRef<HTMLDivElement>(null);
  const videoActive = live.status === 'playing' || live.status === 'loading';
  // Vista grande: STESSO <video> e stesso stream, solo il contenitore cambia stile.
  const view = useVideoExpand(mediaRef, videoRef, videoActive);

  if (!source) return null;

  const videoVisible = videoActive;
  const canStart = live.status !== 'playing' && live.status !== 'loading';
  const big = view.expanded;

  return (
    <CardShell
      cam={cam}
      source={source}
      onClose={onClose}
      expanded={big}
      badge={<LiveBadge status={live.status} />}
      originalLink={posterUrl && <SafeLink href={posterUrl}>{t('cam.openImage')}</SafeLink>}
    >
      <div
        ref={mediaRef}
        data-testid="live-media"
        data-expanded={big ? 'true' : 'false'}
        role={big ? 'dialog' : undefined}
        aria-modal={big ? true : undefined}
        aria-label={big ? t('cam.videoAlt', { name: cam.name }) : undefined}
        className={
          big
            ? 'fixed inset-0 z-[3000] flex flex-col bg-black/95'
            : 'relative mt-2 aspect-video w-full overflow-hidden rounded-lg border border-space-500/40 bg-space-950'
        }
      >
        {/* Barra essenziale della vista grande: 🔴 LIVE, nome, fonte, schermo intero, chiudi. */}
        {big && (
          <div className="safe-top flex items-center gap-2 px-3 py-2 text-white">
            <LiveBadge status={live.status} />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13px] font-semibold">{cam.name}</p>
              <p className="truncate text-[11px] text-space-300">{source.label}</p>
            </div>
            {view.fullscreenSupported && (
              <button
                type="button"
                onClick={view.enterFullscreen}
                className="min-h-[44px] min-w-[44px] rounded-lg border border-white/30 px-2 text-[16px] hover:bg-white/10"
                title={t('cam.fullscreen')}
                aria-label={t('cam.fullscreen')}
              >
                ⤢
              </button>
            )}
            <button
              type="button"
              onClick={view.collapse}
              className="min-h-[44px] min-w-[44px] rounded-lg border border-white/40 bg-white/10 px-2 text-[18px] font-semibold hover:bg-white/20"
              title={t('cam.collapseVideo')}
              aria-label={t('cam.collapseVideo')}
            >
              ✕
            </button>
          </div>
        )}
        {/* Poster: immagine fissa, mai presentata come diretta. */}
        {live.status !== 'playing' &&
          (posterUrl && posterOk ? (
            <img
              src={posterUrl}
              alt={t('cam.previewAlt', { name: cam.name })}
              referrerPolicy="no-referrer"
              decoding="async"
              onError={() => setPosterOk(false)}
              className="absolute inset-0 h-full w-full object-contain"
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center px-4 text-center text-[11px] text-space-300">
              {camHasImage(cam.source) ? t('cam.posterUnavailable') : t('cam.noPosterHint')}
            </div>
          ))}
        {/* Il <video> esiste sempre (serve al player) ma non ha sorgente finché non si preme GUARDA. */}
        <video
          ref={videoRef}
          muted
          playsInline
          preload="none"
          className={
            big
              ? 'min-h-0 w-full flex-1 bg-black object-contain'
              : `absolute inset-0 h-full w-full bg-black object-contain ${videoVisible ? '' : 'invisible'}`
          }
          aria-label={t('cam.videoAlt', { name: cam.name })}
          data-testid="live-video"
        />
        {/* Pulsante ⛶ discreto nell'angolo del player (solo a video attivo). */}
        {!big && live.status === 'playing' && (
          <button
            type="button"
            onClick={view.expand}
            className="absolute bottom-1.5 right-1.5 grid h-9 w-9 place-items-center rounded-md border border-white/30 bg-black/55 text-[16px] text-white hover:bg-black/75"
            title={t('cam.expandVideo')}
            aria-label={t('cam.expandVideo')}
          >
            ⛶
          </button>
        )}
        {/* Vista grande: il timeout di 3 minuti resta attivo, "Continua LIVE" accessibile. */}
        {big && live.status === 'playing' && live.ending && (
          <div className="safe-bottom flex flex-wrap items-center justify-center gap-3 px-3 py-2 text-[12px] text-white">
            <span>{t('cam.liveEnding')}</span>
            <button
              type="button"
              onClick={live.extend}
              className="min-h-[44px] rounded-lg border border-cyan-glow/70 bg-cyan-glow/15 px-4 text-[13px] text-cyan-glow"
            >
              {t('cam.continueLive')}
            </button>
          </div>
        )}
        {live.status === 'loading' && (
          <div className="absolute inset-0 grid place-items-center bg-space-950/60 text-[11px] text-space-100" role="status">
            {t('cam.liveConnecting')}
          </div>
        )}
        {live.status === 'offline' && (
          <div className="absolute inset-x-0 bottom-0 bg-space-950/85 px-2 py-1.5 text-center" role="status">
            <p className="text-[12px] font-semibold text-risk-high">{t('cam.offline')}</p>
            <p className="text-[10px] text-space-300">{t('cam.offlineHint')}</p>
          </div>
        )}
        {!videoVisible && live.status !== 'offline' && posterUrl && posterOk && (
          <span className="absolute left-1.5 top-1.5 rounded bg-space-950/80 px-1.5 py-0.5 text-[9.5px] text-space-200">
            {t('cam.posterNote')}
          </span>
        )}
      </div>

      {(live.status === 'stopped-hidden' || live.status === 'stopped-timeout') && (
        <p className="mt-1.5 text-[10px] text-space-200" role="status">
          {live.status === 'stopped-hidden' ? t('cam.liveStoppedHidden') : t('cam.liveStoppedTimeout')}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {canStart && (
          <button
            type="button"
            onClick={live.start}
            disabled={!streamUrl}
            className="min-h-[44px] flex-1 rounded-lg border border-[#ff3b3b]/70 bg-[#ff3b3b]/15 px-3 text-[13px] font-semibold tracking-wide text-[#ffb3b3] hover:bg-[#ff3b3b]/25 disabled:opacity-50"
          >
            ▶ {live.status === 'offline' ? t('cam.liveRetry') : t('cam.watchLive')}
          </button>
        )}
        {!canStart && (
          <button type="button" onClick={live.stop} className="btn-ghost min-h-[40px] px-3 text-[12px]">
            ■ {t('cam.stopLive')}
          </button>
        )}
        {live.status === 'playing' && live.ending && (
          <button
            type="button"
            onClick={live.extend}
            className="min-h-[40px] rounded-lg border border-cyan-glow/60 bg-cyan-glow/10 px-3 text-[12px] text-cyan-glow"
          >
            {t('cam.continueLive')}
          </button>
        )}
      </div>
      <p className="mt-1.5 text-[10px] leading-snug text-space-300">
        {live.status === 'playing' && live.ending ? `${t('cam.liveEnding')} · ` : ''}
        {t('cam.dataNote')}
      </p>
      <p className="mt-0.5 text-[9.5px] text-space-400">
        <a
          href={`${import.meta.env.BASE_URL}licenses/hls.js-LICENSE.txt`}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-space-500/60 underline-offset-2 hover:text-space-200"
        >
          {t('cam.playerLicense')}
        </a>
      </p>
    </CardShell>
  );
}

/** Link esterno solo verso host in allowlist, HTTPS, senza referrer. */
function SafeLink({ href, children }: { href: string; children: React.ReactNode }) {
  if (!isAllowedCamUrl(href)) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      referrerPolicy="no-referrer"
      className="text-cyan-glow underline decoration-cyan-glow/40 underline-offset-2 hover:decoration-cyan-glow"
    >
      {children} ↗
    </a>
  );
}
