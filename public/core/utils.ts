import { SUPPORTED_TYPES } from './constants.js'
import type { ImportItem, ImportJob } from './state.js'

export const fmtBytes = (n: number) => {
  if (!Number.isFinite(n) || n <= 0) return '-'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = n
  let i = 0
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024
    i += 1
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`
}

export const fmtIso = (iso?: string) => {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export const detectTypeFromName = (name?: string) => {
  if (!name) return 'unknown'
  const lower = String(name).toLowerCase()
  if (lower.endsWith('.tif') || lower.endsWith('.tiff')) return 'geotiff'
  if (lower.endsWith('.mbtiles')) return 'mbtiles'
  if (lower.endsWith('.pmtiles')) return 'pmtiles'
  if (
    lower.endsWith('.000') ||
    lower.endsWith('.001') ||
    lower.endsWith('.s57')
  )
    return 's57'
  return 'unknown'
}

export const isSupportedType = (t?: string) =>
  SUPPORTED_TYPES.includes(String(t || 'unknown'))

export const escapeHtml = (s: unknown) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[c] as string
  )

export const escapeAttr = (s: unknown) => escapeHtml(s).replace(/"/g, '&quot;')

export const getBounds = (item?: ImportItem | null) =>
  item?.meta?.bounds ?? item?.metadata?.bounds ?? null

export const boundsToText = (b: unknown) => {
  if (!Array.isArray(b) || b.length !== 4) return '-'
  const [minLon, minLat, maxLon, maxLat] = b.map(Number)
  if ([minLon, minLat, maxLon, maxLat].some((v) => !Number.isFinite(v)))
    return '-'
  return `${minLon.toFixed(4)}, ${minLat.toFixed(4)} -> ${maxLon.toFixed(4)}, ${maxLat.toFixed(4)}`
}

export const boundsToCompact = (b: unknown) => {
  if (!Array.isArray(b) || b.length !== 4) return '-'
  const [minLon, minLat, maxLon, maxLat] = b.map(Number)
  if ([minLon, minLat, maxLon, maxLat].some((v) => !Number.isFinite(v)))
    return '-'
  return `${minLon.toFixed(4)}, ${minLat.toFixed(4)} / ${maxLon.toFixed(4)}, ${maxLat.toFixed(4)}`
}

export const normalizeStatus = (
  job?: ImportJob | null,
  item?: ImportItem | null
) => {
  const s = String(item?.state ?? job?.state ?? '').toUpperCase()
  if (s === 'DOWNLOADING') return 'progress'
  if (s === 'COPYING') return 'progress'
  if (s === 'DOWNLOADED') return 'progress'
  if (s === 'CONVERTING') return 'converting'
  if (s === 'AVAILABLE') return 'available'
  if (s === 'METADATA_FAILED') return 'error'
  if (s === 'RUNNING') return 'progress'
  if (s === 'STAGED') return 'converting'
  if (s === 'COMPLETED') return 'available'
  if (s === 'FAILED') return 'error'
  if (s === 'CANCELED' || s === 'CANCELLED') return 'canceled'
  if (s === 'QUEUED') return 'progress'
  return 'progress'
}

export const getErrorMessage = (err: unknown) =>
  err instanceof Error ? err.message : String(err)

export const chipClass = (status: string) => {
  switch (status) {
    case 'progress':
      return 'chip chip--uploading'
    case 'converting':
      return 'chip chip--converting'
    case 'available':
      return 'chip chip--available'
    case 'error':
      return 'chip chip--failed'
    case 'canceled':
      return 'chip chip--canceled'
    default:
      return 'chip chip--queued'
  }
}
