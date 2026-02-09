import fs from 'fs'
import path from 'path'
import type { TileCache, TileCacheGetResult, TileData, TileKey } from './tile-cache'

type MbtilesInstance = {
  getTile: (
    z: number,
    x: number,
    y: number,
    cb: (err: Error | null, tile?: Buffer) => void
  ) => void
  putTile: (
    z: number,
    x: number,
    y: number,
    tile: Buffer,
    cb: (err: Error | null) => void
  ) => void
  startWriting: (cb: (err: Error | null) => void) => void
  stopWriting: (cb: (err: Error | null) => void) => void
  close?: (cb: (err: Error | null) => void) => void
}

type MbtilesConstructor = new (
  file: string,
  callback: (err: Error | null, mbtiles: MbtilesInstance) => void
) => void

let MBTiles: MbtilesConstructor | null = null
let mbtilesLoadError: Error | null = null

const ensureMbtilesLoaded = async () => {
  if (MBTiles !== null || mbtilesLoadError) return
  try {
    const module = await import('@signalk/mbtiles')
    MBTiles = (module.default || module) as MbtilesConstructor
  } catch (err) {
    mbtilesLoadError = err as Error
    console.error(
      'Failed to load @signalk/mbtiles module:',
      (err as Error).message
    )
  }
}

const openMbtiles = async (filePath: string): Promise<MbtilesInstance> => {
  await ensureMbtilesLoaded()
  if (!MBTiles) {
    throw mbtilesLoadError || new Error('MBTiles module not loaded')
  }
  const MBTilesCtor = MBTiles
  return new Promise<MbtilesInstance>((resolve, reject) => {
    new MBTilesCtor(`${filePath}?mode=rwc`, (err, mbtiles) => {
      if (err) return reject(err)
      mbtiles.startWriting((err) => {
        if (err) return reject(err)
        resolve(mbtiles)
      })
    })
  })
}

const stopMbtiles = (mbtiles: MbtilesInstance) => {
  return new Promise<void>((resolve, reject) => {
    mbtiles.stopWriting((err) => {
      if (err) return reject(err)
      if (mbtiles.close) {
        mbtiles.close((closeErr) => {
          if (closeErr) return reject(closeErr)
          resolve()
        })
      } else {
        resolve()
      }
    })
  })
}

export class MbtilesTileCache implements TileCache {
  private cacheDir: string
  private sourceId: string
  private filePath: string
  private handle: MbtilesInstance | null = null
  private opening: Promise<MbtilesInstance> | null = null

  constructor(cachePath: string, sourceId: string) {
    this.cacheDir = path.join(cachePath, 'mbtiles')
    this.sourceId = sourceId
    this.filePath = path.join(this.cacheDir, `${sourceId}.mbtiles`)
  }

  private async ensureOpen(): Promise<MbtilesInstance> {
    if (this.handle) return this.handle
    if (!this.opening) {
      await fs.promises.mkdir(this.cacheDir, { recursive: true })
      this.opening = openMbtiles(this.filePath)
    }
    this.handle = await this.opening
    return this.handle
  }

  async get(key: TileKey): Promise<TileCacheGetResult> {
    if (key.sourceId !== this.sourceId) {
      return { hit: false }
    }
    const handle = await this.ensureOpen()
    return new Promise<TileCacheGetResult>((resolve) => {
      handle.getTile(key.z, key.x, key.y, (err, tile) => {
        if (err || !tile) {
          resolve({ hit: false })
          return
        }
        resolve({ hit: true, tile: { data: tile } })
      })
    })
  }

  async set(key: TileKey, tile: TileData): Promise<void> {
    if (key.sourceId !== this.sourceId) {
      return
    }
    const handle = await this.ensureOpen()
    await new Promise<void>((resolve, reject) => {
      handle.putTile(key.z, key.x, key.y, tile.data, (err) => {
        if (err) return reject(err)
        resolve()
      })
    })
  }

  async remove(): Promise<void> {
    return
  }

  async close(): Promise<void> {
    if (!this.handle) return
    await stopMbtiles(this.handle)
    this.handle = null
    this.opening = null
  }
}
