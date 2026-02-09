import type { Application, Request, Response } from 'express'
import type { ResourcesApi } from '@signalk/server-api'
import type { ChartProvider } from '../../types'
import type { Tile } from '../../cache/tile-types'
import { TileSeedingManager } from '../../cache/tile-seeder'
import { CHART_CACHE_PATH } from '../../routes/paths'
import { createCacheSnapshot } from '../../cache/cache-snapshot'
import { getChartsStorageLayout } from '../../imports/storage'
import path from 'path'

type ProvidersById = { [key: string]: ChartProvider }

type CacheRouteDeps = {
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

const toRadians = (deg: number) => (deg * Math.PI) / 180

const nmToLat = (nm: number) => nm / 60

const nmToLon = (nm: number, lat: number) => nm / (60 * Math.cos(toRadians(lat)))

const computeCourseBBox = (opts: {
  lon: number
  lat: number
  heading: number
  distanceNm: number
  corridorNm: number
}): [number, number, number, number] => {
  const headingRad = toRadians(opts.heading)
  const dLat = nmToLat(opts.distanceNm) * Math.cos(headingRad)
  const dLon = nmToLon(opts.distanceNm, opts.lat) * Math.sin(headingRad)
  const endLat = opts.lat + dLat
  const endLon = opts.lon + dLon
  const bufferLat = nmToLat(opts.corridorNm)
  const bufferLon = nmToLon(opts.corridorNm, opts.lat)
  const minLat = Math.min(opts.lat, endLat) - bufferLat
  const maxLat = Math.max(opts.lat, endLat) + bufferLat
  const minLon = Math.min(opts.lon, endLon) - bufferLon
  const maxLon = Math.max(opts.lon, endLon) + bufferLon
  return [minLon, minLat, maxLon, maxLat]
}

const computePositionBBox = (opts: {
  lon: number
  lat: number
  radiusNm: number
}): [number, number, number, number] => {
  const bufferLat = nmToLat(opts.radiusNm)
  const bufferLon = nmToLon(opts.radiusNm, opts.lat)
  return [
    opts.lon - bufferLon,
    opts.lat - bufferLat,
    opts.lon + bufferLon,
    opts.lat + bufferLat
  ]
}

const mergeBboxes = (
  a: [number, number, number, number],
  b: [number, number, number, number]
): [number, number, number, number] => {
  return [
    Math.min(a[0], b[0]),
    Math.min(a[1], b[1]),
    Math.max(a[2], b[2]),
    Math.max(a[3], b[3])
  ]
}

const normalizePosition = (value: unknown) => {
  if (!value || typeof value !== 'object') return null
  const candidate = value as { latitude?: number; longitude?: number; value?: unknown }
  if (typeof candidate.latitude === 'number' && typeof candidate.longitude === 'number') {
    return { latitude: candidate.latitude, longitude: candidate.longitude }
  }
  if (candidate.value && typeof candidate.value === 'object') {
    const nested = candidate.value as { latitude?: number; longitude?: number }
    if (typeof nested.latitude === 'number' && typeof nested.longitude === 'number') {
      return { latitude: nested.latitude, longitude: nested.longitude }
    }
  }
  return null
}

const normalizeNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value && typeof value === 'object' && 'value' in value) {
    const v = (value as { value?: unknown }).value
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  return null
}

const readSelfPath = (app: Application, path: string) => {
  const anyApp = app as unknown as { getSelfPath?: (p: string) => unknown }
  if (typeof anyApp.getSelfPath === 'function') {
    try {
      return anyApp.getSelfPath(path)
    } catch {
      return null
    }
  }
  return null
}

export const registerCacheRoutes = ({
  app,
  getProviders,
  getCachePath
}: CacheRouteDeps) => {
  app.post(
    `${CHART_CACHE_PATH}/seed/:identifier`,
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
      if (provider.sidecar) {
        return res
          .status(409)
          .send('Seeding is handled by sidecar for this provider')
      }
      if (!maxZoom) {
        return res.status(400).send('maxZoom parameter is required')
      }
      const maxZoomParsed = parseInt(maxZoom)
      try {
        await TileSeedingManager.createJob(
          app.resourcesApi,
          getCachePath(),
          provider,
          maxZoomParsed,
          regionGUID,
          bbox ? [bbox.minLon, bbox.minLat, bbox.maxLon, bbox.maxLat] : undefined,
          tile
        )
      } catch (err) {
        return res.status(500).json({
          state: 'FAILED',
          error: String((err as Error).message || err)
        })
      }
      return res.status(200).json({
        state: 'COMPLETED',
        statusCode: 200,
        message: 'OK'
      })
    }
  )

  app.get(`${CHART_CACHE_PATH}/jobs`, (req: Request, res: Response) => {
    const jobs = Object.values(TileSeedingManager.ActiveJobs).map((job) =>
      job.info()
    )
    return res.status(200).json(jobs)
  })

  app.post(`${CHART_CACHE_PATH}/jobs/:id`, (req: Request, res: Response) => {
    const id = normalizeParam(req.params.id)
    const { action } = req.body as { action?: string }
    const parsedId = parseInt(id)
    if (!action) {
      return res.status(400).send('action parameter is required')
    }
    const job = TileSeedingManager.ActiveJobs[parsedId]
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
      delete TileSeedingManager.ActiveJobs[parsedId]
    } else {
      return res.status(404).send(`Job ${parsedId} not found`)
    }
    return res.status(200).send(`Job ${parsedId} ${action}ed`)
  })

  app.post(
    `${CHART_CACHE_PATH}/snapshot/:identifier`,
    async (req: Request, res: Response) => {
      const identifier = normalizeParam(req.params.identifier)
      const provider = getProviders()[identifier]
      if (!provider) {
        return res.status(404).send('Provider not found')
      }
      const layout = getChartsStorageLayout()
      if (!layout) {
        return res.status(500).send('Charts storage layout not initialized')
      }
      const outputName =
        typeof req.body?.outputName === 'string' && req.body.outputName.trim()
          ? req.body.outputName.trim()
          : `${identifier}-cache.pmtiles`
      const snapshotsDir = path.join(layout.databaseDir, 'snapshots')
      const outputPath = path.join(snapshotsDir, outputName)
      try {
        const resultPath = await createCacheSnapshot({
          cachePath: getCachePath(),
          identifier,
          outputPath
        })
        return res.status(200).json({
          state: 'COMPLETED',
          output: resultPath
        })
      } catch (err) {
        return res.status(500).json({
          state: 'FAILED',
          error: String((err as Error).message || err)
        })
      }
    }
  )

  app.post(
    `${CHART_CACHE_PATH}/seed-course/:identifier`,
    async (req: Request, res: Response) => {
      const identifier = normalizeParam(req.params.identifier)
      const provider = getProviders()[identifier]
      if (!provider) {
        return res.sendStatus(500).send('Provider not found')
      }
      const maxZoomParsed = parseInt(String(req.body?.maxZoom ?? ''))
      if (!Number.isFinite(maxZoomParsed)) {
        return res.status(400).send('maxZoom parameter is required')
      }

      const bodyPos = normalizePosition(req.body?.position)
      const bodyHeading = normalizeNumber(req.body?.heading)
      const distanceNm = normalizeNumber(req.body?.distanceNm) ?? 2
      const corridorNm = normalizeNumber(req.body?.corridorNm) ?? 0.5
      const neighborRings =
        normalizeNumber(req.body?.neighborRings) ?? 1
      const zoomDelta =
        normalizeNumber(req.body?.zoomDelta) ?? 1

      const posFromSelf = normalizePosition(
        readSelfPath(app, 'navigation.position')
      )
      const headingFromSelf =
        normalizeNumber(readSelfPath(app, 'navigation.headingTrue')) ??
        normalizeNumber(readSelfPath(app, 'navigation.headingMagnetic')) ??
        normalizeNumber(readSelfPath(app, 'navigation.courseOverGroundTrue'))

      const position = bodyPos ?? posFromSelf
      const heading = bodyHeading ?? headingFromSelf

      if (!position) {
        return res.status(400).json({
          state: 'FAILED',
          error:
            'Missing position. Provide in request body or ensure SignalK navigation.position is available.'
        })
      }

      const positionBox = computePositionBBox({
        lon: position.longitude,
        lat: position.latitude,
        radiusNm: corridorNm
      })

      const bbox = heading == null
        ? positionBox
        : mergeBboxes(
            positionBox,
            computeCourseBBox({
              lon: position.longitude,
              lat: position.latitude,
              heading,
              distanceNm,
              corridorNm
            })
          )

      try {
        const centerTile = {
          x: Math.floor((bbox[0] + bbox[2]) / 2),
          y: Math.floor((bbox[1] + bbox[3]) / 2),
          z: Math.max(0, maxZoomParsed - zoomDelta)
        }

        await TileSeedingManager.createJob(
          app.resourcesApi,
          getCachePath(),
          provider,
          maxZoomParsed,
          undefined,
          bbox,
          undefined
        )

        for (let ring = 0; ring < neighborRings; ring += 1) {
          await TileSeedingManager.createJob(
            app.resourcesApi,
            getCachePath(),
            provider,
            maxZoomParsed,
            undefined,
            undefined,
            centerTile
          )
        }
      } catch (err) {
        return res.status(500).json({
          state: 'FAILED',
          error: String((err as Error).message || err)
        })
      }
      return res.status(200).json({
        state: 'COMPLETED',
        statusCode: 200,
        message: 'OK'
      })
    }
  )
}
