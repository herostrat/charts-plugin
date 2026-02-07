import fs from 'fs'
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

export interface Tile {
  x: number
  y: number
  z: number
}

export const Status = {
  Stopped: 0,
  Running: 1
}

export class ChartSeedingManager {
  public static ActiveJobs: { [key: number]: ChartDownloader } = {}

  public static async createJob(
    resourcesApi: ResourcesApi,
    chartsPath: string,
    provider: ChartProvider,
    maxZoom: number,
    regionGUI: string | undefined = undefined,
    bbox: BBox | undefined = undefined,
    tile: Tile | undefined = undefined
  ): Promise<ChartDownloader> {
    const downloader = new ChartDownloader(resourcesApi, chartsPath, provider)
    if (regionGUI) downloader.initalizeJobFromRegion(regionGUI, maxZoom)
    else if (bbox) downloader.initializeJobFromBBox(bbox, maxZoom)
    else if (tile) {
      downloader.initializeJobFromTile(tile, maxZoom)
    }
    this.ActiveJobs[downloader.ID] = downloader
    return downloader
  }
}

export class ChartDownloader {
  private static MINIMUM_FREE_DISK_SPACE = 1024 * 1024 * 1024 // 1 GB
  private static nextJobId = 1

  private id: number = ChartDownloader.nextJobId++
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
    chartsPath: string,
    provider: ChartProvider
  ) {
    this.resourcesApi = resourcesApi
    this.chartsPath = chartsPath
    this.provider = provider
  }

  resourcesApi: ResourcesApi
  chartsPath: string
  provider: ChartProvider

  get ID(): number {
    return this.id
  }

  public async initalizeJobFromRegion(
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
            const { free } = await checkDiskSpace(this.chartsPath)
            if (free < ChartDownloader.MINIMUM_FREE_DISK_SPACE) {
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
        const buffer = await ChartDownloader.getTileFromCacheOrRemote(
          this.chartsPath,
          this.provider,
          tile
        )
        if (buffer === null) {
          this.failedTiles++
        } else {
          this.downloadedTiles++
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
      const tilePath = path.join(
        this.chartsPath,
        `${this.provider.name}`,
        `${tile.z}`,
        `${tile.x}`,
        `${tile.y}.${this.provider.format}`
      )

      try {
        await fs.promises.unlink(tilePath)
        this.cachedTiles = Math.max(this.cachedTiles - 1, 0)
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
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
      const tilePath = path.join(
        this.chartsPath,
        this.provider.name,
        `${tile.z}`,
        `${tile.x}`,
        `${tile.y}.${this.provider.format}`
      )

      try {
        await fs.promises.access(tilePath)
        return null
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          return tile
        }
        console.error('Unexpected fs error:', err)
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

  static async getTileFromCacheOrRemote(
    chartsPath: string,
    provider: ChartProvider,
    tile: Tile
  ): Promise<Buffer | null> {
    const tilePath = path.join(
      chartsPath,
      `${provider.name}`,
      `${tile.z}`,
      `${tile.x}`,
      `${tile.y}.${provider.format}`
    )

    try {
      const data = await fs.promises.readFile(tilePath)
      return data
    } catch {
      // Cache miss, proceed to fetch from remote
    }
    const buffer = await this.fetchTileFromRemote(provider, tile)
    if (buffer) {
      try {
        await fs.promises.mkdir(path.dirname(tilePath), { recursive: true })
        await fs.promises.writeFile(tilePath, buffer)
      } catch (err) {
        console.error(`Error writing tile ${tilePath}:`, err)
      }
    }
    return buffer
  }

  static async fetchTileFromRemote(
    provider: ChartProvider,
    tile: Tile,
    timeoutMs = 5000
  ): Promise<Buffer | null> {
    if (!provider.remoteUrl) {
      console.error(`No remote URL defined for provider ${provider.name}`)
      return null
    }
    const url = provider.remoteUrl
      .replace('{z}', tile.z.toString())
      .replace('{z-2}', (tile.z - 2).toString())
      .replace('{x}', tile.x.toString())
      .replace('{y}', tile.y.toString())
      .replace('{-y}', (Math.pow(2, tile.z) - 1 - tile.y).toString())
    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, {
        headers: provider.headers,
        signal: controller.signal
      })
      if (!response.ok) {
        return null
      }
      const arrayBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      return buffer
    } catch {
      return null
    } finally {
      clearTimeout(id)
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
            // bboxPolygon expects a tuple with 4 or 6 numbers; tileBbox is number[]
            // Cast to [number, number, number, number] as returned by tileToBBox
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
}
