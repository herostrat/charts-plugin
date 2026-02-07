import type { Response } from 'express'
import type { ChartProvider } from '../../types'
import { ChartDownloader } from '../../cache/chart-downloader'
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
  const buffer = await ChartDownloader.getTileFromCacheOrRemote(
    cachePath,
    provider,
    { x, y, z }
  )
  if (!buffer) {
    res.sendStatus(502)
    return
  }
  res.set('Content-Type', resolveTileContentType(provider.format))
  res.set('Cache-Control', DEFAULT_CACHE_HEADERS['Cache-Control'])
  res.send(buffer)
}
