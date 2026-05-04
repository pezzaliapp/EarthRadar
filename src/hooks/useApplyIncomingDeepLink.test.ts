import { describe, expect, it, vi } from 'vitest';
import { applyIncomingDeepLink } from './useApplyIncomingDeepLink';

function makeTargets() {
  return {
    setOverlayEnabled: vi.fn(),
    setViewMode: vi.fn(),
    setMapCenter: vi.fn(),
    setSelectedSatelliteByNorad: vi.fn(),
  };
}

describe('applyIncomingDeepLink', () => {
  it('sets the view mode when present', () => {
    const t = makeTargets();
    applyIncomingDeepLink({ view: '3d' }, t);
    expect(t.setViewMode).toHaveBeenCalledWith('3d');
  });

  it('sets the map center when both lat/lon are present', () => {
    const t = makeTargets();
    applyIncomingDeepLink({ center: { lat: 44.7, lon: 10.6 } }, t);
    expect(t.setMapCenter).toHaveBeenCalledWith([44.7, 10.6]);
  });

  it('enables every layer in activeLayers', () => {
    const t = makeTargets();
    applyIncomingDeepLink({ activeLayers: ['quakes', 'iss', 'satellites'] }, t);
    expect(t.setOverlayEnabled).toHaveBeenCalledWith('quakes', true);
    expect(t.setOverlayEnabled).toHaveBeenCalledWith('iss', true);
    expect(t.setOverlayEnabled).toHaveBeenCalledWith('satellites', true);
    expect(t.setOverlayEnabled).toHaveBeenCalledTimes(3);
  });

  it('enables the focusLayer (MeteorWatch ?layer=...)', () => {
    const t = makeTargets();
    applyIncomingDeepLink({ focusLayer: 'satellites' }, t);
    expect(t.setOverlayEnabled).toHaveBeenCalledWith('satellites', true);
  });

  it('forwards norad to setSelectedSatelliteByNorad if provided', () => {
    const t = makeTargets();
    applyIncomingDeepLink({ norad: 25544 }, t);
    expect(t.setSelectedSatelliteByNorad).toHaveBeenCalledWith(25544);
  });

  it('does nothing on an empty link', () => {
    const t = makeTargets();
    applyIncomingDeepLink({}, t);
    expect(t.setOverlayEnabled).not.toHaveBeenCalled();
    expect(t.setViewMode).not.toHaveBeenCalled();
    expect(t.setMapCenter).not.toHaveBeenCalled();
    expect(t.setSelectedSatelliteByNorad).not.toHaveBeenCalled();
  });

  it('combines: lat+lon+view+layers in one shot', () => {
    const t = makeTargets();
    applyIncomingDeepLink(
      {
        center: { lat: 35.7, lon: 139.7 },
        view: '2d',
        activeLayers: ['quakes', 'eonet'],
      },
      t,
    );
    expect(t.setViewMode).toHaveBeenCalledWith('2d');
    expect(t.setMapCenter).toHaveBeenCalledWith([35.7, 139.7]);
    expect(t.setOverlayEnabled).toHaveBeenCalledTimes(2);
  });
});
