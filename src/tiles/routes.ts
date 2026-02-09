import type { Application, Request, Response } from 'express'
import type { ResourcesApi } from '@signalk/server-api'
import type { ChartProvider } from '../types'
import { CHART_TILES_PATH } from '../routes/paths'
import { serveTileFromCacheOrRemote } from './sources/proxy'
import { serveTileFromDirectory } from './sources/directory'
import { serveTileFromMbtiles } from './sources/mbtiles'
import { serveTileFromPmtiles } from './sources/pmtiles'
import { serveTileFromGeotiff } from './sources/geotiff'
import { serveTileFromWms } from './sources/wms'
import { serveTileFromWmts } from './sources/wmts'
import { serveTileFromCog } from './sources/cog'

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
        if (provider.type === 'WMS') {
          return serveTileFromWms(res, getCachePath(), provider, iz, ix, iy)
        }
        if (provider.type === 'WMTS') {
          return serveTileFromWmts(res, getCachePath(), provider, iz, ix, iy)
        }
        if (
          provider.type === 'tilelayer' &&
          provider.remoteUrl?.endsWith('.tif')
        ) {
          return serveTileFromCog(res, getCachePath(), provider, iz, ix, iy)
        }
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
}
