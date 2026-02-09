import fs from 'fs'
import type { ChartProvider } from '../types'
import type { Tile } from './tile-types'
import { fetchTileFromRemote } from './tile-remote-fetcher'
import { PMTiles, type RangeResponse, type Source } from 'pmtiles'

export type TileFetcher = {
  getTile: (tile: Tile, signal?: AbortSignal) => Promise<Buffer | null>
}

class NodeFileSource implements Source {
  private filePath: string
  constructor(filePath: string) {
    this.filePath = filePath
  }

  getKey(): string {
    return this.filePath
  }

  async getBytes(
    offset: number,
    length: number,
    signal?: AbortSignal
  ): Promise<RangeResponse> {
    if (signal?.aborted) {
      throw new Error('AbortError')
    }
    const handle = await fs.promises.open(this.filePath, 'r')
    try {
      const buffer = Buffer.alloc(length)
      const { bytesRead } = await handle.read(buffer, 0, length, offset)
      const view = buffer.subarray(0, bytesRead)
      return {
        data: view.buffer.slice(
          view.byteOffset,
          view.byteOffset + view.byteLength
        )
      }
    } finally {
      await handle.close()
    }
  }
}

export const createRemoteTileFetcher = (
  provider: ChartProvider
): TileFetcher => {
  return {
    getTile: (tile, signal) => {
      void signal
      return fetchTileFromRemote(provider, tile, 5000)
    }
  }
}

export const createPmtilesTileFetcher = (filePath: string): TileFetcher => {
  const source = new NodeFileSource(filePath)
  const handle = new PMTiles(source)
  return {
    getTile: async (tile, signal) => {
      const result = await handle.getZxy(tile.z, tile.x, tile.y, signal)
      if (!result) return null
      return Buffer.from(result.data)
    }
  }
}
