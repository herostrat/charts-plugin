export type TileKey = {
  sourceId: string
  z: number
  x: number
  y: number
  format: string
}

export type TileData = {
  data: Buffer
  etag?: string
  expires?: string
  cacheControl?: string
  contentEncoding?: string
  status?: number
  updatedAt?: string
}

export type TileCacheGetResult = {
  hit: boolean
  tile?: TileData
}

export type TileCache = {
  has?: (key: TileKey) => Promise<boolean>
  get: (key: TileKey) => Promise<TileCacheGetResult>
  set: (key: TileKey, tile: TileData) => Promise<void>
  remove?: (key: TileKey) => Promise<void>
  close?: () => Promise<void>
}

export type TileCacheFactory = {
  create: (opts: { cachePath: string; sourceId: string }) => TileCache
}
