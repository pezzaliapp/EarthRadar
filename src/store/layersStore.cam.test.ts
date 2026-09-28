import { afterEach, describe, expect, it } from 'vitest';
import { useLayersStore } from './layersStore';

/** CAM è OFF di default e OFF a ogni avvio: lo stato ON non viene mai salvato. */

const STORAGE_KEY = 'earthradar:layers';

afterEach(() => {
  useLayersStore.getState().setOverlayEnabled('cam', false);
  useLayersStore.getState().setSelectedCam(null);
  window.localStorage.clear();
});

function persisted(): { state: { overlays: Record<string, { enabled: boolean }> } } {
  return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}');
}

describe('layersStore — CAM', () => {
  it('CAM è OFF di default', () => {
    expect(useLayersStore.getState().overlays.cam).toEqual({ enabled: false, opacity: 1 });
    expect(useLayersStore.getState().isActive('cam')).toBe(false);
  });

  it('accendere CAM non salva mai enabled=true nello storage', () => {
    useLayersStore.getState().setOverlayEnabled('cam', true);
    expect(useLayersStore.getState().overlays.cam.enabled).toBe(true);
    expect(persisted().state.overlays.cam.enabled).toBe(false);
    // Gli altri layer continuano a essere salvati normalmente.
    useLayersStore.getState().setOverlayEnabled('eonet', true);
    expect(persisted().state.overlays.eonet.enabled).toBe(true);
    useLayersStore.getState().setOverlayEnabled('eonet', false);
  });

  it('uno stato salvato con CAM ON viene riletto come OFF', async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { overlays: { cam: { enabled: true, opacity: 1 } } }, version: 7 }),
    );
    await useLayersStore.persist.rehydrate();
    expect(useLayersStore.getState().overlays.cam.enabled).toBe(false);
  });

  it('la camera selezionata è transiente', () => {
    useLayersStore.getState().setSelectedCam({ source: 'tfl', id: '00002.00865' });
    expect(useLayersStore.getState().selectedCam).toEqual({ source: 'tfl', id: '00002.00865' });
    expect(JSON.stringify(persisted())).not.toContain('selectedCam');
  });

  it('focusCam seleziona la camera e crea una richiesta di centratura sulle sue coordinate', () => {
    const st = useLayersStore.getState();
    st.focusCam({ source: 'hktd', id: 'H429F', lat: 22.24845, lon: 114.1505 });
    const a = useLayersStore.getState();
    expect(a.selectedCam).toEqual({ source: 'hktd', id: 'H429F' });
    expect(a.camFocus).toMatchObject({ lat: 22.24845, lon: 114.1505 });
    // Stessa camera di nuovo: nuova richiesta (seq diverso) → la mappa ricentra.
    st.focusCam({ source: 'hktd', id: 'H429F', lat: 22.24845, lon: 114.1505 });
    expect(useLayersStore.getState().camFocus!.seq).toBe(a.camFocus!.seq + 1);
    // Coordinate non valide: nessuna richiesta di centratura.
    st.focusCam({ source: 'tfl', id: '00001.00001', lat: NaN, lon: 0 });
    expect(useLayersStore.getState().camFocus!.seq).toBe(a.camFocus!.seq + 1);
  });

  it('setCamEnabled(false) chiude Explorer e CamCard; niente di tutto ciò viene salvato', () => {
    const st = useLayersStore.getState();
    st.setCamEnabled(true);
    st.setCamExplorerOpen(true);
    st.focusCam({ source: 'tfl', id: '00001.01251', lat: 51.5262, lon: -0.08563 });
    expect(JSON.stringify(persisted())).not.toMatch(/camExplorer|camFocus|selectedCam/);
    expect(persisted().state.overlays.cam.enabled).toBe(false);
    st.setCamEnabled(false);
    const s = useLayersStore.getState();
    expect(s.overlays.cam.enabled).toBe(false);
    expect(s.camExplorerOpen).toBe(false);
    expect(s.selectedCam).toBeNull();
    expect(s.camFocus).toBeNull();
  });

  it('filtro LIVE/SNAP transiente: non salvato, al reload torna TUTTE', () => {
    useLayersStore.getState().setCamTypeFilter('live');
    expect(useLayersStore.getState().camTypeFilter).toBe('live');
    expect(JSON.stringify(persisted())).not.toContain('camTypeFilter');
    useLayersStore.getState().setCamTypeFilter('all');
  });
});
