import path from 'path'
import pLimit from 'p-limit'
import type {
  BBox,
  FeatureCollection,
  Polygon,
  MultiPolygon,
  Feature,
  Position
} from 'geojson'
import splitGeoJSON from 'geojson-antimeridian-cut'
import booleanIntersects from '@turf/boolean-intersects'
import { bbox } from '@turf/bbox'
import { polygon } from '@turf/helpers'
import checkDiskSpace from 'check-disk-space'
import type { ResourcesApi } from '@signalk/server-api'
import { lonLatToTileXY, tileToBBox, getSubTiles } from '../tiles/tile-utils'
import type { ChartProvider } from '../types'
import type { TileCache } from './tile-cache'
import type { Tile } from './tile-types'
import { MbtilesTileCache } from './tile-cache-mbtiles'
import {
  createPmtilesTileFetcher,
  createRemoteTileFetcher,
  type TileFetcher
} from './tile-fetcher'

export const Status = {
  Stopped: 0,
  Running: 1
}

export class TileSeedingManager {
  public static ActiveJobs: { [key: number]: TileSeeder } = {}

  public static async createJob(
    resourcesApi: ResourcesApi,
    chartsPath: string,
    provider: ChartProvider,
    maxZoom: number,
    regionGUID: string | undefined = undefined,
    bbox: BBox | undefined = undefined,
    tile: Tile | undefined = undefined
  ): Promise<TileSeeder> {
    const cache = new MbtilesTileCache(chartsPath, provider.identifier)
    const fetcher = provider._fileFormat === 'pmtiles'
      ? (() => {
          if (!provider._filePath) {
            throw new Error('PMTiles file path not available for hotloading')
          }
          return createPmtilesTileFetcher(provider._filePath)
        })()
      : createRemoteTileFetcher(provider)
    const seeder = new TileSeeder(resourcesApi, provider, cache, fetcher, chartsPath)
    if (regionGUID) seeder.initializeJobFromRegion(regionGUID, maxZoom)
    else if (bbox) seeder.initializeJobFromBBox(bbox, maxZoom)
    else if (tile) seeder.initializeJobFromTile(tile, maxZoom)
    this.ActiveJobs[seeder.ID] = seeder
    return seeder
  }
}

export class TileSeeder {
  private static MINIMUM_FREE_DISK_SPACE = 1024 * 1024 * 1024 // 1 GB
  private static nextJobId = 1

  private id: number = TileSeeder.nextJobId++
  private maxZoom = 15
  private status: number = Status.Stopped
  private totalTiles = 0
  private downloadedTiles = 0
  private failedTiles = 0
  private cachedTiles = 0

  private concurrentDownloadsLimit = 20
  private areaDescription = ''
  private cancelRequested = false

  private tiles: Tile[] = []
  private tilesToDownload: Tile[] = []

  constructor(
    resourcesApi: ResourcesApi,
    provider: ChartProvider,
    cache: TileCache,
    fetcher: TileFetcher,
    cacheBasePath: string
  ) {
    this.resourcesApi = resourcesApi
    this.provider = provider
    this.cache = cache
    this.fetcher = fetcher
    this.cacheBasePath = cacheBasePath
  }

  resourcesApi: ResourcesApi
  provider: ChartProvider
  cache: TileCache
  fetcher: TileFetcher
  cacheBasePath: string

  get ID(): number {
    return this.id
  }

  public async initializeJobFromRegion(
    regionGUID: string,
    maxZoom: number
  ): Promise<void> {
    const region = (await this.resourcesApi.getResource(
      'regions',
      regionGUID
    )) as Record<string, unknown>
    const geojson = this.convertRegionToGeoJSON(region)
    this.tiles = this.getTilesForGeoJSON(
      geojson,
      this.provider.minzoom,
      maxZoom
    )
    this.tilesToDownload = await this.filterCachedTiles(this.tiles)

    this.status = Status.Stopped
    this.totalTiles = this.tiles.length
    this.cachedTiles = this.totalTiles - this.tilesToDownload.length
    this.areaDescription = `Region: ${region?.name ?? ''}`
    this.maxZoom = maxZoom
  }

  public async initializeJobFromBBox(
    bbox: BBox,
    maxZoom: number
  ): Promise<void> {
    this.tiles = this.getTilesForBBox(bbox, maxZoom)
    this.tilesToDownload = await this.filterCachedTiles(this.tiles)

    this.status = Status.Stopped
    this.totalTiles = this.tiles.length
    this.cachedTiles = this.totalTiles - this.tilesToDownload.length
    this.areaDescription = `BBox: [${bbox.join(', ')}]`
    this.maxZoom = maxZoom
  }

  public async initializeJobFromTile(
    tile: Tile,
    maxZoom: number
  ): Promise<void> {
    this.tiles = this.getSubTiles(tile, maxZoom)
    this.tilesToDownload = await this.filterCachedTiles(this.tiles)

    this.status = Status.Stopped
    this.totalTiles = this.tiles.length
    this.cachedTiles = this.totalTiles - this.tilesToDownload.length
    this.areaDescription = `Tile: [${tile.x}, ${tile.y}, ${tile.z}]`
    this.maxZoom = maxZoom
  }

  async seedCache(): Promise<void> {
    this.cancelRequested = false
    this.status = Status.Running
    this.tilesToDownload = await this.filterCachedTiles(this.tiles)
    this.downloadedTiles = 0
    this.failedTiles = 0
    this.cachedTiles = this.totalTiles - this.tilesToDownload.length
    const limit = pLimit(this.concurrentDownloadsLimit)
    let tileCounter = 0
    this.tilesToDownload = await this.filterCachedTiles(this.tiles)

    const tasks = this.tilesToDownload.map((tile) =>
      limit(async () => {
        if (this.cancelRequested) {
          this.status = Status.Stopped
          return
        }
        if (tileCounter % 1000 === 0) {
          await new Promise((r) => setTimeout(r, 0))
          try {
            const { free } = await checkDiskSpace(this.getCacheBasePath())
            if (free < TileSeeder.MINIMUM_FREE_DISK_SPACE) {
              console.warn(`Low disk space. Stopping download.`)
              this.status = Status.Stopped
              return
            }
          } catch (err) {
            console.error(`Error checking disk space:`, err)
            this.status = Status.Stopped
            return
          }
        }
        tileCounter++
        const buffer = await this.fetcher.getTile(tile)
        if (!buffer) {
          this.failedTiles++
          return
        }
        try {
          await this.cache.set(
            {
              sourceId: this.provider.identifier,
              z: tile.z,
              x: tile.x,
              y: tile.y,
              format: this.provider.format || 'png'
            },
            { data: buffer }
          )
          this.downloadedTiles++
        } catch (err) {
          console.error('Error writing tile cache:', err)
          this.failedTiles++
        }
      })
    )

    try {
      await Promise.all(tasks)
    } catch (err) {
      console.error('Error downloading tiles:', err)
    }
    this.status = Status.Stopped
  }

  async deleteCache(): Promise<void> {
    this.status = Status.Running
    for (const tile of this.tiles) {
      if (this.cancelRequested) break
      const key = {
        sourceId: this.provider.identifier,
        z: tile.z,
        x: tile.x,
        y: tile.y,
        format: this.provider.format || 'png'
      }

      try {
        await this.cache.remove?.(key)
        this.cachedTiles = Math.max(this.cachedTiles - 1, 0)
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          const tilePath = path.join(
            this.getCacheBasePath(),
            `${this.provider.name}`,
            `${tile.z}`,
            `${tile.x}`,
            `${tile.y}.${this.provider.format}`
          )
          console.error(`Error deleting cached tile ${tilePath}:`, err)
        }
      }
    }
    this.status = Status.Stopped
  }

  public cancelJob() {
    this.cancelRequested = true
  }

  private async filterCachedTiles(allTiles: Tile[]): Promise<Tile[]> {
    const checks = allTiles.map(async (tile) => {
      const key = {
        sourceId: this.provider.identifier,
        z: tile.z,
        x: tile.x,
        y: tile.y,
        format: this.provider.format || 'png'
      }

      try {
        if (this.cache.has) {
          const exists = await this.cache.has(key)
          return exists ? null : tile
        }
        const result = await this.cache.get(key)
        return result.hit ? null : tile
      } catch {
        return tile
      }
    })

    const results = await Promise.all(checks)
    return results.filter((t): t is Tile => t !== null)
  }

  public info() {
    return {
      id: this.id,
      chartName: this.provider.name,
      regionName: this.areaDescription,
      totalTiles: this.totalTiles,
      downloadedTiles: this.downloadedTiles,
      cachedTiles: this.cachedTiles,
      failedTiles: this.failedTiles,
      progress:
        this.totalTiles > 0
          ? (this.downloadedTiles + this.cachedTiles + this.failedTiles) /
            this.totalTiles
          : 0,
      status: this.status
    }
  }

  getSubTiles(tile: Tile, maxZoom: number): Tile[] {
    return getSubTiles(tile, maxZoom)
  }

  getTilesForBBox(bbox: BBox, maxZoom: number): Tile[] {
    const tiles: Tile[] = []
    const [minLon, minLat, maxLon, maxLat] = bbox

    const crossesAntiMeridian = minLon > maxLon

    const processBBox = (
      lo1: number,
      la1: number,
      lo2: number,
      la2: number
    ) => {
      for (let z = 0; z <= maxZoom; z++) {
        const [minX, maxY] = lonLatToTileXY(lo1, la1, z)
        const [maxX, minY] = lonLatToTileXY(lo2, la2, z)

        for (let x = minX; x <= maxX; x++) {
          for (let y = minY; y <= maxY; y++) {
            tiles.push({ x, y, z })
          }
        }
      }
    }

    if (!crossesAntiMeridian) {
      processBBox(minLon, minLat, maxLon, maxLat)
    } else {
      processBBox(minLon, minLat, 180, maxLat)
      processBBox(-180, minLat, maxLon, maxLat)
    }

    return tiles
  }

  getTilesForGeoJSON(
    geojson: FeatureCollection,
    zoomMin = 1,
    zoomMax = 14
  ): Tile[] {
    if (!geojson || !Array.isArray(geojson.features)) {
      return []
    }
    const minZoom = zoomMin ?? 1
    const maxZoom = zoomMax ?? 14
    const tiles: Tile[] = []

    for (const feature of geojson.features) {
      if (
        feature.geometry.type !== 'Polygon' &&
        feature.geometry.type !== 'MultiPolygon'
      ) {
        console.warn('Skipping non-polygon feature')
        continue
      }

      const boundingBox = bbox(feature.geometry as Polygon)
      for (let z = minZoom; z <= maxZoom; z++) {
        const [minX, minY] = lonLatToTileXY(boundingBox[0], boundingBox[3], z)
        const [maxX, maxY] = lonLatToTileXY(boundingBox[2], boundingBox[1], z)

        for (let x = minX; x <= maxX; x++) {
          for (let y = minY; y <= maxY; y++) {
            const tileBbox = tileToBBox(x, y, z)
            const tilePoly = this.bboxPolygon(
              tileBbox as [number, number, number, number]
            )

            if (booleanIntersects(feature as Feature, tilePoly)) {
              tiles.push({ x, y, z })
            }
          }
        }
      }
    }

    return tiles
  }

  private convertRegionToGeoJSON(
    region: Record<string, unknown>
  ): FeatureCollection {
    const feature = region.feature as
      | {
          type?: string
          geometry?: Polygon | MultiPolygon
          id?: string
          properties?: Record<string, unknown>
        }
      | undefined
    if (!feature || feature.type !== 'Feature' || !feature.geometry) {
      throw new Error('Invalid region: missing feature or geometry')
    }

    const geoFeature = {
      type: 'Feature' as const,
      id: feature.id || undefined,
      geometry: feature.geometry,
      properties: {
        name: (region.name as string) || '',
        description: (region.description as string) || '',
        timestamp: (region.timestamp as string) || '',
        source: (region.$source as string) || '',
        ...(feature.properties || {})
      }
    }
    const splitGeoFeature = splitGeoJSON(geoFeature)
    const features: Feature<Polygon>[] = []

    const pushFeaturePolygon = (
      orig: Feature,
      coords: Position[][],
      idx?: number
    ) => {
      const poly: Feature<Polygon> = {
        type: 'Feature',
        id: idx != null && orig.id ? `${orig.id}-${idx}` : orig.id,
        geometry: {
          type: 'Polygon',
          coordinates: coords
        },
        properties: orig.properties || {}
      }
      features.push(poly)
    }

    const f = splitGeoFeature as Feature
    if (f.geometry && f.geometry.type === 'MultiPolygon') {
      for (
        let i = 0;
        i < (f.geometry as MultiPolygon).coordinates.length;
        i++
      ) {
        pushFeaturePolygon(f, (f.geometry as MultiPolygon).coordinates[i], i)
      }
    } else if (f.geometry && f.geometry.type === 'Polygon') {
      features.push(f as Feature<Polygon>)
    }

    return {
      type: 'FeatureCollection' as const,
      features
    }
  }

  private bboxPolygon(boundingBox: BBox) {
    const [minLon, minLat, maxLon, maxLat] = boundingBox
    return polygon([
      [
        [minLon, minLat],
        [maxLon, minLat],
        [maxLon, maxLat],
        [minLon, maxLat],
        [minLon, minLat]
      ]
    ])
  }

  private getCacheBasePath(): string {
    return this.cacheBasePath
  }
}
