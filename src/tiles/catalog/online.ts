import deburr from 'lodash/deburr.js'
import kebabCase from 'lodash/kebabCase.js'
import type { OnlineChartProvider } from '../../types'

export function convertOnlineProviderConfig(provider: OnlineChartProvider) {
  const nameId = kebabCase(deburr(provider.name))
  const id = provider.id && provider.id.trim().length > 0 ? provider.id : nameId

  const bounds =
    Array.isArray(provider.bounds) && provider.bounds.length === 4
      ? provider.bounds
      : [-180, -90, 180, 90]

  const parseHeaders = (
    arr: string[] | undefined
  ): { [key: string]: string } => {
    if (!Array.isArray(arr)) return {}
    return arr.reduce<{ [key: string]: string }>((acc, entry) => {
      if (typeof entry === 'string') {
        const idx = entry.indexOf(':')
        if (idx > 0) {
          const key = entry.slice(0, idx).trim()
          const value = entry.slice(idx + 1).trim()
          if (key && value) {
            acc[key] = value
          }
        }
      }
      return acc
    }, {})
  }

  const layers = Array.isArray(provider.layers)
    ? provider.layers
    : provider.layers
      ? [provider.layers]
      : undefined

  const data = {
    identifier: id,
    name: provider.name,
    description: provider.description,
    bounds,
    minzoom: Math.min(Math.max(1, provider.minzoom), 24),
    maxzoom: Math.min(Math.max(1, provider.maxzoom), 24),
    format: provider.format,
    scale: 250000,
    type: provider.serverType ? provider.serverType : 'tilelayer',
    style: provider.style ? provider.style : null,
    layers,
    v1: {
      tilemapUrl: provider.proxy
        ? `~tilePath~/${id}/{z}/{x}/{y}`
        : provider.url,
      chartLayers: layers ?? null
    },
    v2: {
      url: provider.proxy ? `~tilePath~/${id}/{z}/{x}/{y}` : provider.url,
      layers: layers ?? null
    },
    proxy: provider.proxy ? provider.proxy : false,
    remoteUrl: provider.proxy ? provider.url : null,
    headers: parseHeaders(provider.headers)
  }
  return data
}
