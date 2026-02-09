import {
  streamBtn,
  streamBoundsEl,
  streamDescriptionEl,
  streamFormatEl,
  streamHeadersEl,
  streamHeavyWarn,
  streamLayersEl,
  streamMaxZoomEl,
  streamMinZoomEl,
  streamNameEl,
  streamProxyEl,
  streamStatus,
  streamTileMatrixSetEl,
  streamTypeEl,
  streamUrlEl
} from '../core/dom.js'
import { api } from '../core/api.js'
import { setHeavyWarn, setStatus } from '../core/ui.js'
import { getErrorMessage } from '../core/utils.js'

const parseBounds = (raw: string) => {
  const parts = raw
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
  if (parts.length !== 4) return null
  const nums = parts.map((v) => Number(v))
  if (nums.some((v) => !Number.isFinite(v))) return null
  return nums as [number, number, number, number]
}

const parseList = (raw: string) => {
  const items = raw
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
  return items.length > 0 ? items : []
}

const parseHeaders = (raw: string) => {
  const lines = raw
    .split('\n')
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
  return lines.length > 0 ? lines : []
}

export const updateStreamState = () => {
  const name = streamNameEl?.value.trim() || ''
  const url = streamUrlEl?.value.trim() || ''
  const streamType = streamTypeEl?.value || 'wms'
  const formatSelect = streamFormatEl
  const format = streamType === 'cog' ? 'png' : formatSelect?.value || 'png'
  const minZoom = Number(streamMinZoomEl?.value || '1')
  const maxZoom = Number(streamMaxZoomEl?.value || '15')
  const layers = parseList(streamLayersEl?.value || '')
  const boundsRaw = streamBoundsEl?.value.trim() || ''

  setHeavyWarn(streamHeavyWarn, 'unknown')

  if (formatSelect) {
    formatSelect.value = format
    formatSelect.disabled = streamType === 'cog'
  }

  if (!name) {
    if (streamBtn) streamBtn.disabled = true
    setStatus(streamStatus, 'status', 'Provide a name for the source.')
    return
  }

  if (!url) {
    if (streamBtn) streamBtn.disabled = true
    setStatus(streamStatus, 'status', 'Provide a stream URL.')
    return
  }

  if (!Number.isFinite(minZoom) || !Number.isFinite(maxZoom)) {
    if (streamBtn) streamBtn.disabled = true
    setStatus(
      streamStatus,
      'status is-warn',
      'Min/max zoom must be valid numbers.'
    )
    return
  }

  if (minZoom < 1 || maxZoom > 24 || minZoom > maxZoom) {
    if (streamBtn) streamBtn.disabled = true
    setStatus(
      streamStatus,
      'status is-warn',
      'Zoom range must be between 1 and 24.'
    )
    return
  }

  if ((streamType === 'wms' || streamType === 'wmts') && layers.length === 0) {
    if (streamBtn) streamBtn.disabled = true
    setStatus(
      streamStatus,
      'status is-warn',
      'Provide at least one layer for WMS/WMTS.'
    )
    return
  }

  if (boundsRaw) {
    const bounds = parseBounds(boundsRaw)
    if (!bounds) {
      if (streamBtn) streamBtn.disabled = true
      setStatus(
        streamStatus,
        'status is-warn',
        'Bounds must be minLon,minLat,maxLon,maxLat.'
      )
      return
    }
  }

  if (streamBtn) streamBtn.disabled = false
  setStatus(streamStatus, 'status', 'Ready to register streaming source.')
}

export const initStream = (opts: {
  refreshProviders: () => Promise<void>
}) => {
  streamNameEl?.addEventListener('input', updateStreamState)
  streamDescriptionEl?.addEventListener('input', updateStreamState)
  streamUrlEl?.addEventListener('input', updateStreamState)
  streamTypeEl?.addEventListener('change', updateStreamState)
  streamFormatEl?.addEventListener('change', updateStreamState)
  streamMinZoomEl?.addEventListener('input', updateStreamState)
  streamMaxZoomEl?.addEventListener('input', updateStreamState)
  streamBoundsEl?.addEventListener('input', updateStreamState)
  streamLayersEl?.addEventListener('input', updateStreamState)
  streamTileMatrixSetEl?.addEventListener('input', updateStreamState)
  streamHeadersEl?.addEventListener('input', updateStreamState)
  streamProxyEl?.addEventListener('change', updateStreamState)

  streamBtn?.addEventListener('click', async () => {
    const name = streamNameEl?.value.trim() || ''
    const description = streamDescriptionEl?.value.trim() || ''
    const streamUrl = streamUrlEl?.value.trim() || ''
    const streamType = streamTypeEl?.value || 'wms'
    const format = streamType === 'cog' ? 'png' : streamFormatEl?.value || 'png'
    const minZoom = Number(streamMinZoomEl?.value || '1')
    const maxZoom = Number(streamMaxZoomEl?.value || '15')
    const boundsText = streamBoundsEl?.value.trim() || ''
    const layers = parseList(streamLayersEl?.value || '')
    const tileMatrixSet = streamTileMatrixSetEl?.value.trim() || ''
    const headers = parseHeaders(streamHeadersEl?.value || '')
    const proxy = streamProxyEl ? streamProxyEl.checked : true

    const bounds = boundsText ? parseBounds(boundsText) : null
    if (!name || !streamUrl) return
    if (!Number.isFinite(minZoom) || !Number.isFinite(maxZoom)) return

    if (streamBtn) streamBtn.disabled = true
    setStatus(streamStatus, 'status', 'Registering streaming source...')

    try {
      const serverType = streamType === 'cog' ? 'tilelayer' : streamType.toUpperCase()
      let layersWithMatrix = [...layers]
      if (serverType === 'WMTS') {
        const layer = layersWithMatrix[0] || ''
        layersWithMatrix = layer ? [layer] : []
        if (tileMatrixSet) {
          layersWithMatrix.push(tileMatrixSet)
        }
      }

      await api.createOnlineProvider({
        name,
        description,
        minzoom: minZoom,
        maxzoom: maxZoom,
        format,
        url: streamUrl,
        proxy,
        serverType,
        layers: layersWithMatrix.length > 0 ? layersWithMatrix : undefined,
        headers: headers.length > 0 ? headers : undefined,
        bounds: bounds || undefined
      })
      setStatus(streamStatus, 'status', 'Streaming source registered.')
      await opts.refreshProviders()
    } catch (err: unknown) {
      setStatus(
        streamStatus,
        'status is-bad',
        `Register stream failed: ${getErrorMessage(err)}`
      )
    } finally {
      if (streamBtn) streamBtn.disabled = false
    }
  })
}
