import type { Response } from 'express'
import type { ChartProvider } from '../../types'
import {
  isAllowedTileFormat,
  isGzipBuffer,
  resolveTileContentType
} from '../format'
import { DEFAULT_CACHE_HEADERS } from '../headers'

export const serveTileFromPmtiles = async (
  res: Response,
  provider: ChartProvider,
  z: number,
  x: number,
  y: number
) => {
  if (!isAllowedTileFormat(provider.format)) {
    res.status(404).send('Tile not found')
    return
  }
  if (!provider._pmtilesHandle) {
    res.status(500).send('PMTiles handle not available')
    return
  }
  try {
    const tile = await provider._pmtilesHandle.getZxy(z, x, y)
    if (!tile) {
      res.sendStatus(404)
      return
    }
    const payload = Buffer.from(tile.data)
    res.set('Content-Type', resolveTileContentType(provider.format))
    if (isGzipBuffer(payload)) {
      res.set('Content-Encoding', 'gzip')
    }
    if (tile.cacheControl) {
      res.set('Cache-Control', tile.cacheControl)
    } else {
      res.set('Cache-Control', DEFAULT_CACHE_HEADERS['Cache-Control'])
    }
    if (tile.expires) {
      res.set('Expires', tile.expires)
    }
    res.status(200).send(payload)
  } catch (err) {
    console.error(
      `Error fetching PMTiles tile ${provider.identifier}/${z}/${x}/${y}:`,
      err
    )
    res.sendStatus(500)
  }
}
