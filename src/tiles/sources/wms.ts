import type { Response } from 'express'
import type { ChartProvider } from '../../types'
import { MbtilesTileCache } from '../../cache/tile-cache-mbtiles'
import type { TileKey } from '../../cache/tile-cache'
import { resolveTileContentType } from '../format'
import { DEFAULT_CACHE_HEADERS } from '../headers'
import { tileToBBoxMercator } from '../tile-utils'

const buildWmsUrl = (
  baseUrl: string,
  layers: string[],
  bbox: [number, number, number, number],
  format: string
) => {
  const url = new URL(baseUrl)
  const params = url.searchParams
  params.set('SERVICE', 'WMS')
  params.set('REQUEST', 'GetMap')
  params.set('VERSION', '1.3.0')
  params.set('CRS', 'EPSG:3857')
  params.set('BBOX', bbox.join(','))
  params.set('WIDTH', '256')
  params.set('HEIGHT', '256')
  params.set('FORMAT', `image/${format}`)
  params.set('LAYERS', layers.join(','))
  if (!params.has('STYLES')) {
    params.set('STYLES', '')
  }
  return url.toString()
}

export const serveTileFromWms = async (
  res: Response,
  cachePath: string,
  provider: ChartProvider,
  z: number,
  x: number,
  y: number
) => {
  if (!provider.remoteUrl) {
    res.status(500).send('WMS remote URL not available')
    return
  }
  if (!provider.layers || provider.layers.length === 0) {
    res.status(500).send('WMS layers are not configured')
    return
  }

  const cache = new MbtilesTileCache(cachePath, provider.identifier)
  const key: TileKey = {
    sourceId: provider.identifier,
    z,
    x,
    y,
    format: provider.format || 'png'
  }
  const cached = await cache.get(key)
  if (cached.hit && cached.tile?.data) {
    res.set('Content-Type', resolveTileContentType(provider.format))
    res.set('Cache-Control', DEFAULT_CACHE_HEADERS['Cache-Control'])
    res.send(cached.tile.data)
    return
  }

  const bbox = tileToBBoxMercator(x, y, z)
  const url = buildWmsUrl(
    provider.remoteUrl,
    provider.layers,
    bbox,
    provider.format || 'png'
  )
  try {
    const response = await fetch(url, { headers: provider.headers })
    if (!response.ok) {
      res.sendStatus(502)
      return
    }
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    await cache.set(key, { data: buffer })
    res.set('Content-Type', resolveTileContentType(provider.format))
    res.set('Cache-Control', DEFAULT_CACHE_HEADERS['Cache-Control'])
    res.send(buffer)
  } catch (err) {
    console.error('WMS fetch failed:', err)
    res.sendStatus(502)
  }
}
