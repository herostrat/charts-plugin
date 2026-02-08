import type { Response } from 'express'
import type { ChartProvider } from '../../types'
import {
  isAllowedTileFormat,
  isGzipBuffer,
  resolveTileContentType
} from '../format'
import { DEFAULT_CACHE_HEADERS } from '../headers'

export type StreamingTileResponse = {
  data: Buffer
  format?: string
  cacheControl?: string
  expires?: string
  contentEncoding?: string
}

export type StreamingTileSource = {
  getTile: (
    z: number,
    x: number,
    y: number,
    signal?: AbortSignal
  ) => Promise<StreamingTileResponse | null>
  isMock?: boolean
}

export const serveTileStreaming = async (
  res: Response,
  cachePath: string,
  provider: ChartProvider,
  z: number,
  x: number,
  y: number,
  source: StreamingTileSource
) => {
  if (source.isMock) {
    res.status(501).send('Streaming source not implemented')
    return
  }
  if (!isAllowedTileFormat(provider.format)) {
    res.status(404).send('Tile not found')
    return
  }

  try {
    // TODO: add streaming tile cache read/write using cachePath.
    void cachePath
    const tile = await source.getTile(z, x, y)
    if (!tile) {
      res.sendStatus(404)
      return
    }

    const format = tile.format ?? provider.format
    res.set('Content-Type', resolveTileContentType(format))
    if (tile.contentEncoding) {
      res.set('Content-Encoding', tile.contentEncoding)
    } else if (isGzipBuffer(tile.data)) {
      res.set('Content-Encoding', 'gzip')
    }
    res.set(
      'Cache-Control',
      tile.cacheControl ?? DEFAULT_CACHE_HEADERS['Cache-Control']
    )
    if (tile.expires) {
      res.set('Expires', tile.expires)
    }
    res.status(200).send(tile.data)
  } catch (err) {
    console.error(
      `Error streaming tile ${provider.identifier}/${z}/${x}/${y}:`,
      err
    )
    res.sendStatus(500)
  }
}
