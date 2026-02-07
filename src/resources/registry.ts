import merge from 'lodash/merge.js'
import type { ChartProvider } from '../types'
import type { ResourceProviderRegistry } from '@signalk/server-api'
import { CHART_STYLE_PATH, CHART_TILES_PATH } from '../http/paths'
import { isVectorFormat } from '../tiles/format'

type ProviderMap = { [key: string]: ChartProvider }

type ResourceApp = ResourceProviderRegistry & {
  debug: (message: string, ...args: unknown[]) => void
}

export const registerResourcesProvider = (
  app: ResourceApp,
  getProviders: () => ProviderMap
) => {
  app.debug('** Registering as Resource Provider for `charts` **')
  try {
    app.registerResourceProvider({
      type: 'charts',
      methods: {
        listResources: (params: {
          [key: string]: number | string | object | null
        }) => {
          app.debug(`** listResources() ${params}`)
          return Promise.resolve(
            Object.values(getProviders()).map((provider) =>
              sanitizeProvider(provider, 2)
            )
          )
        },
        getResource: (id: string) => {
          app.debug(`** getResource() ${id}`)
          const provider = getProviders()[id]
          if (provider) {
            return Promise.resolve(sanitizeProvider(provider, 2))
          }
          throw new Error('Chart not found!')
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setResource: (id: string, value: any) => {
          throw new Error(`Not implemented!\n Cannot set ${id} to ${value}`)
        },
        deleteResource: (id: string) => {
          throw new Error(`Not implemented!\n Cannot delete ${id}`)
        }
      }
    })
  } catch (error) {
    app.debug('Failed Provider Registration!', error)
  }
}

export const sanitizeProvider = (provider: ChartProvider, version = 1) => {
  let v
  if (version === 1) {
    v = merge({}, provider.v1)
    v.tilemapUrl = v.tilemapUrl.replace('~tilePath~', CHART_TILES_PATH)
  } else if (version === 2) {
    v = merge({}, provider.v2)
    v.url = v.url ? v.url.replace('~tilePath~', CHART_TILES_PATH) : ''
  }
  // Remove internal fields and v1/v2
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _filePath, _fileFormat, _mbtilesHandle, _flipY, v1, v2, ...rest } =
    provider as ChartProvider
  const merged = merge({}, rest, v) as ChartProvider & {
    url?: string
    tilemapUrl?: string
    style?: string
  }
  if (version === 2 && isVectorFormat(provider.format)) {
    merged.type = 'mapstyleJSON'
    merged.url = `${CHART_STYLE_PATH}/${provider.identifier}`
    merged.style = merged.url
  }
  return merged
}

export const validateVectorProviders = (
  providers: ProviderMap,
  app: { debug: (message: string) => void }
) => {
  Object.values(providers).forEach((provider) => {
    if (!isVectorFormat(provider.format)) {
      return
    }
    const layerIds =
      provider.v2?.layers || provider.v1?.chartLayers || ([] as string[])
    if (!layerIds || layerIds.length === 0) {
      app.debug(
        `Vector chart "${provider.identifier}" has no vector_layers metadata; style will render empty.`
      )
    }
  })
}
