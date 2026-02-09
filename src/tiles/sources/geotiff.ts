import type { Response } from 'express'
import type { ChartProvider } from '../../types'
import { type StreamingTileSource, serveTileStreaming } from './streaming'

const createGeotiffStreamingSource = (): StreamingTileSource => {
  return {
    isMock: true,
    getTile: async () => null
  }
}

export const serveTileFromGeotiff = (
  res: Response,
  provider: ChartProvider,
  z: number,
  x: number,
  y: number,
  cachePath: string
) => {
  const source = createGeotiffStreamingSource()
  return serveTileStreaming(res, cachePath, provider, z, x, y, source)
}
