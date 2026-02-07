import type { Application, Request, Response } from 'express'
import type { ChartProvider } from '../types'
import { CHART_STYLE_PATH } from '../http/paths'
import {
  buildNauticalVectorStyle,
  type ThemeId
} from '../style/nautical-style-generator'
import { isVectorFormat } from '../tiles/format'
import { loadS52Mapping } from './s52-mapping'

type ProvidersById = { [key: string]: ChartProvider }

type StyleRouteDeps = {
  app: Application
  getProviders: () => ProvidersById
  getCatalogChoice: (identifier: string) => 's52' | 'none'
  defaultCatalogId: 's52'
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
    const theme: ThemeId = 'day'
    const provider = getProviders()[identifier]
    if (!provider || !isVectorFormat(provider.format)) {
      return res.sendStatus(404)
    }
    const catalogChoice = getCatalogChoice(identifier) ?? defaultCatalogId
    const mapping = loadS52Mapping()
    const catalogObjects = catalogChoice === 'none' ? [] : mapping.objects || []
    return res.json(buildNauticalVectorStyle(provider, catalogObjects, theme))
  })
}
