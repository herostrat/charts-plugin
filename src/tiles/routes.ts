import type { Application, Request, Response } from 'express'
import type { ResourcesApi } from '@signalk/server-api'
import type { ChartProvider } from '../types'
import type { Tile } from '../cache/chart-downloader'
import { ChartSeedingManager } from '../cache/chart-downloader'
import { CHART_TILES_PATH } from '../routes/paths'
import { serveTileFromCacheOrRemote } from './sources/proxy'
import { serveTileFromDirectory } from './sources/directory'
import { serveTileFromMbtiles } from './sources/mbtiles'
import { serveTileFromPmtiles } from './sources/pmtiles'
import { serveTileFromGeotiff } from './sources/geotiff'

type ProvidersById = { [key: string]: ChartProvider }

type TileRouteDeps = {
  app: Application & { resourcesApi: ResourcesApi }
  getProviders: () => ProvidersById
  getCachePath: () => string
}

const normalizeParam = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) {
    return value[0] ?? ''
  }
  return value ?? ''
}

const isValidTileParam = (value: string) => /^\d+$/.test(value)

export const registerTileRoutes = ({
  app,
  getProviders,
  getCachePath
}: TileRouteDeps) => {
  app.get(
    `${CHART_TILES_PATH}/:identifier/:z/:x/:y`,
    async (req: Request, res: Response) => {
      const identifier = normalizeParam(req.params.identifier)
      const z = normalizeParam(req.params.z)
      const x = normalizeParam(req.params.x)
      const y = normalizeParam(req.params.y)
      if (
        !isValidTileParam(z) ||
        !isValidTileParam(x) ||
        !isValidTileParam(y)
      ) {
        return res.sendStatus(404)
      }
      const ix = parseInt(x)
      const iy = parseInt(y)
      const iz = parseInt(z)
      const provider = getProviders()[identifier]
      if (!provider) {
        return res.sendStatus(404)
      }
      if (provider.proxy === true) {
        return serveTileFromCacheOrRemote(
          res,
          getCachePath(),
          provider,
          iz,
          ix,
          iy
        )
      }
      switch (provider._fileFormat) {
        case 'directory':
          return serveTileFromDirectory(res, provider, iz, ix, iy)
        case 'mbtiles':
          return serveTileFromMbtiles(res, provider, iz, ix, iy)
        case 'pmtiles':
          return serveTileFromPmtiles(res, provider, iz, ix, iy)
        case 'geotiff':
          return serveTileFromGeotiff(res, provider, iz, ix, iy, getCachePath())
        default:
          console.log(
            `Unknown chart provider fileformat ${provider._fileFormat}`
          )
          res.status(500).send()
      }
    }
  )

  app.post(
    `${CHART_TILES_PATH}/cache/:identifier`,
    async (req: Request, res: Response) => {
      const identifier = normalizeParam(req.params.identifier)
      const { regionGUID, tile, bbox, maxZoom } = req.body as {
        regionGUID?: string
        tile?: Tile
        bbox?: {
          minLon: number
          minLat: number
          maxLon: number
          maxLat: number
        }
        maxZoom?: string
      }
      const provider = getProviders()[identifier]
      if (!provider) {
        return res.sendStatus(500).send('Provider not found')
      }
      if (!maxZoom) {
        return res.status(400).send('maxZoom parameter is required')
      }
      const maxZoomParsed = parseInt(maxZoom)
      await ChartSeedingManager.createJob(
        app.resourcesApi,
        getCachePath(),
        provider,
        maxZoomParsed,
        regionGUID,
        bbox ? [bbox.minLon, bbox.minLat, bbox.maxLon, bbox.maxLat] : undefined,
        tile
      )
      return res.status(200).json({
        state: 'COMPLETED',
        statusCode: 200,
        message: 'OK'
      })
    }
  )

  app.get(`${CHART_TILES_PATH}/cache/jobs`, (req: Request, res: Response) => {
    const jobs = Object.values(ChartSeedingManager.ActiveJobs).map((job) =>
      job.info()
    )
    return res.status(200).json(jobs)
  })

  app.post(
    `${CHART_TILES_PATH}/cache/jobs/:id`,
    (req: Request, res: Response) => {
      const id = normalizeParam(req.params.id)
      const { action } = req.body as { action?: string }
      const parsedId = parseInt(id)
      if (!action) {
        return res.status(400).send('action parameter is required')
      }
      const job = ChartSeedingManager.ActiveJobs[parsedId]
      if (!job) {
        return res.status(404).send(`Job ${parsedId} not found`)
      }
      if (action === 'start') {
        job.seedCache()
      } else if (action === 'stop') {
        job.cancelJob()
      } else if (action === 'delete') {
        job.deleteCache()
      } else if (action === 'remove') {
        delete ChartSeedingManager.ActiveJobs[parsedId]
      } else {
        return res.status(404).send(`Job ${parsedId} not found`)
      }
      return res.status(200).send(`Job ${parsedId} ${action}ed`)
    }
  )
}
