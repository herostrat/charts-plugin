import { basemapNote, mapEl, mapEmpty, mapToggle, mapWrap } from '../core/dom.js';
import { state } from '../core/state.js';
import { getBounds } from '../core/utils.js';

let renderImportsFn: () => void;
let leafletMap: any = null;
let boundsGroup: any = null;
let basemapLayer: any = null;

const assetUrl = (() => {
  const scriptEl = (document.currentScript as HTMLScriptElement | null) ||
    document.querySelector<HTMLScriptElement>('script[src$="index.js"]');
  const base = scriptEl?.src ? new URL('./', scriptEl.src) : new URL('./', window.location.href);
  return (rel: string) => new URL(rel, base).toString();
})();

const rectStyle = (focused: boolean) => ({
  color: focused ? '#2a67ff' : 'rgba(42,103,255,.75)',
  weight: focused ? 3 : 2,
  fillColor: '#2a67ff',
  fillOpacity: focused ? 0.18 : 0.10
});

const toLatLngBounds = (b: any) => {
  if (!Array.isArray(b) || b.length !== 4) return null;
  const [minLon, minLat, maxLon, maxLat] = b.map(Number);
  if ([minLon, minLat, maxLon, maxLat].some((v) => !Number.isFinite(v))) return null;
  return (window as any).L.latLngBounds([[minLat, minLon], [maxLat, maxLon]]);
};

export const focusBounds = (bounds: number[]) => {
  if (!leafletMap || !(window as any).L) return;
  const llb = toLatLngBounds(bounds);
  if (!llb) return;
  leafletMap.fitBounds(llb, { padding: [40, 40], maxZoom: 12 });
};

export const resetView = () => {
  if (!leafletMap || !(window as any).L) return;
  leafletMap.setView([20, 0], 2);
};

export const renderMap = (itemsWithJob: any[]) => {
  const boundsItems = (Array.isArray(itemsWithJob) ? itemsWithJob : [])
    .map(({ jobId, item, key }) => ({ jobId, item, key, b: getBounds(item) }))
    .filter((x) => Array.isArray(x.b) && x.b.length === 4);

  if (mapEmpty) mapEmpty.style.display = boundsItems.length ? 'none' : 'block';
  if (!leafletMap || !boundsGroup || !(window as any).L) return;

  boundsGroup.clearLayers();

  for (const { key, b } of boundsItems) {
    const llb = toLatLngBounds(b);
    if (!llb) continue;

    const focused = state.focusedKey === key;
    const rect = (window as any).L.rectangle(llb, { ...rectStyle(focused), pane: 'bounds' });
    rect.on('click', () => {
      state.focusedKey = key;
      renderImportsFn?.();
      focusBounds(b);
    });
    rect.addTo(boundsGroup);
  }
};

export const setMapHidden = (hidden: boolean) => {
  state.mapHidden = !!hidden;
  if (mapWrap) mapWrap.style.display = state.mapHidden ? 'none' : 'block';
  if (mapToggle) mapToggle.textContent = state.mapHidden ? 'Show' : 'Hide';
  if (!state.mapHidden && leafletMap) {
    setTimeout(() => leafletMap.invalidateSize(), 50);
  }
};

const addLocalVectorBasemap = async () => {
  if (!leafletMap || !(window as any).L) return;
  if (basemapNote) basemapNote.style.display = 'none';

  try {
    const r = await fetch(assetUrl('assets/world/ne_110m_admin_0_countries.geojson'), { cache: 'no-store' });
    if (r.ok) {
      const gj = await r.json();
      basemapLayer = (window as any).L.geoJSON(gj, {
        pane: 'basemap',
        interactive: false,
        style: {
          color: 'rgba(18,19,26,.14)',
          weight: 1,
          fillColor: 'rgba(18,19,26,.06)',
          fillOpacity: 1
        }
      }).addTo(leafletMap);
      if (basemapNote) basemapNote.style.display = 'none';
      return;
    }
  } catch (_) {}

  if (basemapNote) basemapNote.style.display = 'block';
};

export const initMap = (opts: { renderImports: () => void }) => {
  renderImportsFn = opts.renderImports;

  if (!mapEl) return;

  const L = (window as any).L;
  if (!L) {
    mapEl.innerHTML = `
      <div style="padding:14px;color:var(--muted);font-size:13px;line-height:1.45;">
        <b>Leaflet not found.</b><br/>
        Place <code>assets/leaflet/leaflet.js</code> and <code>assets/leaflet/leaflet.css</code> next to this HTML file (same directory), then reload.
      </div>
    `;
    return;
  }

  leafletMap = L.map(mapEl, {
    zoomControl: true,
    attributionControl: true,
    worldCopyJump: true
  });

  leafletMap.createPane('basemap');
  leafletMap.getPane('basemap').style.zIndex = 200;
  leafletMap.getPane('basemap').style.pointerEvents = 'none';

  leafletMap.createPane('bounds');
  leafletMap.getPane('bounds').style.zIndex = 400;

  boundsGroup = L.featureGroup().addTo(leafletMap);
  leafletMap.setView([20, 0], 2);

  addLocalVectorBasemap();

  mapToggle?.addEventListener('click', () => setMapHidden(!state.mapHidden));
};
