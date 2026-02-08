import {
  bboxClose,
  bboxConfirm,
  bboxMapEl,
  bboxOverlay,
  bboxValue
} from '../core/dom.js'

type LeafletMap = {
  fitBounds: (
    bounds: unknown,
    options?: { padding?: [number, number]; maxZoom?: number }
  ) => void
  setView: (center: [number, number], zoom: number) => void
  invalidateSize: () => void
  on: (event: string, cb: (evt: LeafletMouseEvent) => void) => void
  off: (event: string, cb: (evt: LeafletMouseEvent) => void) => void
  dragging: { enable: () => void; disable: () => void }
  panBy: (offset: [number, number], options?: { animate?: boolean }) => void
}

type LeafletLatLng = {
  lat: number
  lng: number
}

type LeafletMouseEvent = {
  latlng: LeafletLatLng
  originalEvent?: MouseEvent
}

type LeafletBounds = {
  getSouthWest: () => LeafletLatLng
  getNorthEast: () => LeafletLatLng
}

type LeafletRectangle = {
  setBounds: (bounds: LeafletBounds) => void
  getBounds: () => LeafletBounds
  addTo: (map: LeafletMap) => LeafletRectangle
  remove: () => void
}

type LeafletGlobal = {
  map: (el: HTMLElement, options: Record<string, unknown>) => LeafletMap
  latLngBounds: (coords: [[number, number], [number, number]]) => LeafletBounds
  rectangle: (
    bounds: LeafletBounds,
    options: Record<string, unknown>
  ) => LeafletRectangle
  geoJSON: (
    data: unknown,
    options: Record<string, unknown>
  ) => { addTo: (map: LeafletMap) => void }
}

const getLeaflet = (): LeafletGlobal | null =>
  (window as unknown as { L?: LeafletGlobal }).L ?? null

const assetUrl = (() => {
  const scriptEl =
    (document.currentScript as HTMLScriptElement | null) ||
    document.querySelector<HTMLScriptElement>('script[src$="index.js"]')
  const base = scriptEl?.src
    ? new URL('./', scriptEl.src)
    : new URL('./', window.location.href)
  return (rel: string) => new URL(rel, base).toString()
})()

let bboxMap: LeafletMap | null = null
let bboxRect: LeafletRectangle | null = null
let drawing = false
let panning = false
let startLatLng: LeafletLatLng | null = null
let lastFocusEl: Element | null = null
let confirmCb: ((bbox: [number, number, number, number]) => void) | null = null
let currentBounds: [number, number, number, number] | null = null

const rectStyle = {
  color: '#2a67ff',
  weight: 2,
  fillColor: '#2a67ff',
  fillOpacity: 0.15
}

const toBounds = (bbox: [number, number, number, number]) => {
  const L = getLeaflet()
  if (!L) return null
  return L.latLngBounds([
    [bbox[1], bbox[0]],
    [bbox[3], bbox[2]]
  ])
}

const boundsToBbox = (b: LeafletBounds): [number, number, number, number] => {
  const sw = b.getSouthWest()
  const ne = b.getNorthEast()
  return [sw.lng, sw.lat, ne.lng, ne.lat]
}

const isRightClick = (evt: LeafletMouseEvent) => evt.originalEvent?.button === 2

const setBboxValue = (bbox: [number, number, number, number] | null) => {
  currentBounds = bbox
  if (!bboxValue) return
  if (!bbox) {
    bboxValue.textContent = '-'
    bboxConfirm?.setAttribute('disabled', 'true')
    return
  }
  bboxConfirm?.removeAttribute('disabled')
  bboxValue.textContent = `${bbox[0].toFixed(4)}, ${bbox[1].toFixed(4)}, ${bbox[2].toFixed(4)}, ${bbox[3].toFixed(4)}`
}

const addLocalVectorBasemap = async () => {
  const L = getLeaflet()
  if (!bboxMap || !L) return
  try {
    const r = await fetch(
      assetUrl('assets/world/ne_110m_admin_0_countries.geojson'),
      {
        cache: 'no-store'
      }
    )
    if (!r.ok) return
    const gj = await r.json()
    L.geoJSON(gj, {
      interactive: false,
      style: {
        color: 'rgba(18,19,26,.14)',
        weight: 1,
        fillColor: 'rgba(18,19,26,.06)',
        fillOpacity: 1
      }
    }).addTo(bboxMap)
  } catch (err) {
    void err
  }
}

const ensureMap = () => {
  if (!bboxMapEl || bboxMap) return
  const L = getLeaflet()
  if (!L) {
    bboxMapEl.innerHTML =
      '<div style="padding:14px;color:var(--muted);font-size:13px;line-height:1.45;">Leaflet not found.</div>'
    return
  }

  bboxMap = L.map(bboxMapEl, {
    zoomControl: true,
    attributionControl: true,
    worldCopyJump: true
  })
  bboxMap.dragging.disable()
  bboxMap.setView([20, 0], 2)
  addLocalVectorBasemap()

  const onMouseDown = (evt: LeafletMouseEvent) => {
    if (!bboxMap) return
    if (isRightClick(evt)) {
      panning = true
      return
    }
    drawing = true
    startLatLng = evt.latlng
    if (bboxRect) bboxRect.remove()
    const startBounds = L.latLngBounds([
      [startLatLng.lat, startLatLng.lng],
      [startLatLng.lat, startLatLng.lng]
    ])
    bboxRect = L.rectangle(startBounds, rectStyle)
    bboxRect.addTo(bboxMap)
    setBboxValue(null)
  }

  const onMouseMove = (evt: LeafletMouseEvent) => {
    if (panning && bboxMap && evt.originalEvent) {
      const dx = evt.originalEvent.movementX || 0
      const dy = evt.originalEvent.movementY || 0
      if (dx !== 0 || dy !== 0) {
        bboxMap.panBy([-dx, -dy], { animate: false })
      }
      return
    }
    if (!drawing || !bboxRect || !startLatLng) return
    const L = getLeaflet()
    if (!L) return
    const bounds = L.latLngBounds([
      [startLatLng.lat, startLatLng.lng],
      [evt.latlng.lat, evt.latlng.lng]
    ])
    bboxRect.setBounds(bounds)
    setBboxValue(boundsToBbox(bounds))
  }

  const onMouseUp = () => {
    if (!bboxMap) return
    if (panning) {
      panning = false
      return
    }
    if (drawing) {
      drawing = false
    }
  }

  bboxMap.on('mousedown', onMouseDown)
  bboxMap.on('mousemove', onMouseMove)
  bboxMap.on('mouseup', onMouseUp)
  bboxMap.on('contextmenu', (evt: LeafletMouseEvent) => {
    evt.originalEvent?.preventDefault()
  })
}

export const openBboxPicker = (opts: {
  initial?: [number, number, number, number] | null
  onConfirm: (bbox: [number, number, number, number]) => void
}) => {
  if (!bboxOverlay) return
  lastFocusEl = document.activeElement
  confirmCb = opts.onConfirm
  ensureMap()
  bboxOverlay.classList.remove('is-hidden')

  if (bboxMap) {
    setTimeout(() => bboxMap?.invalidateSize(), 50)
    if (opts.initial) {
      const bounds = toBounds(opts.initial)
      if (bounds) {
        const L = getLeaflet()
        if (L) {
          if (bboxRect) bboxRect.remove()
          bboxRect = L.rectangle(bounds, rectStyle)
          bboxRect.addTo(bboxMap)
          bboxMap.fitBounds(bounds, { padding: [20, 20], maxZoom: 10 })
          setBboxValue(opts.initial)
        }
      }
    } else {
      bboxMap.setView([20, 0], 2)
      setBboxValue(null)
    }
  }

  bboxClose?.focus()
}

export const closeBboxPicker = () => {
  if (!bboxOverlay) return
  bboxOverlay.classList.add('is-hidden')
  if (lastFocusEl instanceof HTMLElement) {
    try {
      lastFocusEl.focus()
    } catch (err) {
      void err
    }
  }
  lastFocusEl = null
}

export const initBboxPicker = () => {
  bboxClose?.addEventListener('click', closeBboxPicker)
  bboxOverlay?.addEventListener('click', (e) => {
    if (e.target === bboxOverlay) closeBboxPicker()
  })
  bboxConfirm?.addEventListener('click', () => {
    if (!currentBounds || !confirmCb) return
    confirmCb(currentBounds)
    closeBboxPicker()
  })
}
