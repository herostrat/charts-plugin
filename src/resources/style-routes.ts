import type { Application, Request, Response } from 'express'
import type { ChartProvider } from '../types'
import { CHART_STYLE_PATH } from '../routes/paths'
import {
  buildNauticalVectorStyle,
  type ThemeId
} from '../style/nautical-style-generator'
import { isVectorFormat } from '../tiles/format'
import { loadObjectCatalog } from '../catalog/loader'

type ProvidersById = { [key: string]: ChartProvider }

type StyleRouteDeps = {
  app: Application
  getProviders: () => ProvidersById
  getCatalogChoice: (identifier: string) => string | 'none'
  defaultCatalogId: string
}

export const registerStyleRoutes = ({
  app,
  getProviders,
  getCatalogChoice,
  defaultCatalogId
}: StyleRouteDeps) => {
  app.get(`${CHART_STYLE_PATH}/:identifier`, (req: Request, res: Response) => {
    const identifier = Array.isArray(req.params.identifier)
      ? req.params.identifier[0]
      : req.params.identifier
    const theme: ThemeId = 'signalk_day'
    const provider = getProviders()[identifier]
    if (!provider || !isVectorFormat(provider.format)) {
      return res.sendStatus(404)
    }
    const catalogChoice = getCatalogChoice(identifier) ?? defaultCatalogId
    const catalog = loadObjectCatalog()
    const catalogObjects = catalogChoice === 'none' ? [] : catalog.objects || []
    return res.json(buildNauticalVectorStyle(provider, catalogObjects, theme))
  })
}
