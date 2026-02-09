import type { Response } from 'express'
import type { ChartProvider } from '../../types'
import { MbtilesTileCache } from '../../cache/tile-cache-mbtiles'
import { fetchTileFromRemote } from '../../cache/tile-remote-fetcher'
import type { TileKey } from '../../cache/tile-cache'
import { resolveTileContentType } from '../format'
import { DEFAULT_CACHE_HEADERS } from '../headers'

export const serveTileFromCacheOrRemote = async (
  res: Response,
  cachePath: string,
  provider: ChartProvider,
  z: number,
  x: number,
  y: number
) => {
  const cache = new MbtilesTileCache(cachePath, provider.identifier)
  const key: TileKey = {
    sourceId: provider.identifier,
    z,
    x,
    y,
    format: provider.format || 'png'
  }
  const cached = await cache.get(key)
  const buffer = cached.hit ? cached.tile?.data : null
  if (buffer) {
    res.set('Content-Type', resolveTileContentType(provider.format))
    res.set('Cache-Control', DEFAULT_CACHE_HEADERS['Cache-Control'])
    res.send(buffer)
    return
  }

  const fetched = await fetchTileFromRemote(provider, { x, y, z })
  if (!fetched) {
    res.sendStatus(502)
    return
  }
  await cache.set(key, { data: fetched })
  res.set('Content-Type', resolveTileContentType(provider.format))
  res.set('Cache-Control', DEFAULT_CACHE_HEADERS['Cache-Control'])
  res.send(fetched)
}
