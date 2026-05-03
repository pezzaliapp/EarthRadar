import { useLayersStore, type LayerId } from '@/store/layersStore';
import { GIBS_OVERLAY_LAYERS } from '@/services/gibsLayers';
import GibsOverlay from '@/components/overlays/GibsOverlay';
import { firmsMapKey } from '@/services/firmsApi';

/**
 * Monta un <GibsOverlay /> per ogni overlay GIBS attualmente abilitato nel
 * layersStore. È pensato per stare *dentro* il MapContainer, subito dopo il
 * base layer e prima dei marker dati (z-order: base < gibs overlay <
 * terminator < markers).
 *
 * Caso speciale `gibs_fires`: lo escludiamo se il layer FIRMS è attivo e la
 * map key è ASSENTE — in quello scenario `GibsFiresOverlay` (gestito dalla
 * Fase 2.5) renderizza già lo stesso tile come fallback NRT-less. Senza
 * questo gate, l'utente vedrebbe il tile renderizzato due volte (saturazione
 * rosso doppia) quando entrambi i toggle sono attivi.
 */
export default function GibsOverlayHost() {
  const overlays = useLayersStore((s) => s.overlays);
  const firmsEnabled = useLayersStore((s) => s.overlays.firms?.enabled ?? false);
  const firmsHasKey = firmsMapKey() !== null;

  return (
    <>
      {GIBS_OVERLAY_LAYERS.map((layer) => {
        const id = layer.id as LayerId;
        const isEnabled = overlays[id]?.enabled ?? false;
        if (!isEnabled) return null;
        if (id === 'gibs_fires' && firmsEnabled && !firmsHasKey) return null;
        return <GibsOverlay key={id} layerId={id} />;
      })}
    </>
  );
}
