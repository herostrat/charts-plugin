import type { Response } from 'express'
import type { ChartProvider } from '../../types'
import { MbtilesTileCache } from '../../cache/tile-cache-mbtiles'
import type { TileKey } from '../../cache/tile-cache'
import { resolveTileContentType } from '../format'
import { DEFAULT_CACHE_HEADERS } from '../headers'

const buildWmtsUrl = (
  baseUrl: string,
  layer: string,
  tileMatrixSet: string,
  z: number,
  x: number,
  y: number,
  format: string
) => {
  const url = new URL(baseUrl)
  const params = url.searchParams
  params.set('SERVICE', 'WMTS')
  params.set('REQUEST', 'GetTile')
  params.set('VERSION', '1.0.0')
  params.set('LAYER', layer)
  params.set('TILEMATRIXSET', tileMatrixSet)
  params.set('TILEMATRIX', z.toString())
  params.set('TILEROW', y.toString())
  params.set('TILECOL', x.toString())
  params.set('FORMAT', `image/${format}`)
  return url.toString()
}

export const serveTileFromWmts = async (
  res: Response,
  cachePath: string,
  provider: ChartProvider,
  z: number,
  x: number,
  y: number
) => {
  if (!provider.remoteUrl) {
    res.status(500).send('WMTS remote URL not available')
    return
  }
  if (!provider.layers || provider.layers.length === 0) {
    res.status(500).send('WMTS layers are not configured')
    return
  }

  const layer = provider.layers[0]
  const tileMatrixSet = provider.layers[1] || 'GoogleMapsCompatible'

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

  const url = buildWmtsUrl(
    provider.remoteUrl,
    layer,
    tileMatrixSet,
    z,
    x,
    y,
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
    console.error('WMTS fetch failed:', err)
    res.sendStatus(502)
  }
}
