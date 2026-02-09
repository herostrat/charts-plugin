import fs from 'fs'
import path from 'path'
import type {
  TileCache,
  TileCacheGetResult,
  TileData,
  TileKey
} from './tile-cache'

export class TileCacheStorageAdapter implements TileCache {
  private cachePath: string
  private sourceId: string

  constructor(cachePath: string, sourceId: string) {
    this.cachePath = cachePath
    this.sourceId = sourceId
  }

  private buildTilePath(key: TileKey): string {
    return path.join(
      this.cachePath,
      this.sourceId,
      `${key.z}`,
      `${key.x}`,
      `${key.y}.${key.format}`
    )
  }

  async has(key: TileKey): Promise<boolean> {
    const tilePath = this.buildTilePath(key)
    try {
      await fs.promises.access(tilePath)
      return true
    } catch {
      return false
    }
  }

  async get(key: TileKey): Promise<TileCacheGetResult> {
    const tilePath = this.buildTilePath(key)
    try {
      const data = await fs.promises.readFile(tilePath)
      return { hit: true, tile: { data } }
    } catch {
      return { hit: false }
    }
  }

  async set(key: TileKey, tile: TileData): Promise<void> {
    const tilePath = this.buildTilePath(key)
    await fs.promises.mkdir(path.dirname(tilePath), { recursive: true })
    await fs.promises.writeFile(tilePath, tile.data)
  }

  async remove(key: TileKey): Promise<void> {
    const tilePath = this.buildTilePath(key)
    await fs.promises.unlink(tilePath)
  }

  getBasePath(): string {
    return this.cachePath
  }
}
