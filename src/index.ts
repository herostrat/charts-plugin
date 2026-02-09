import path from 'path'
import fs from 'fs'

import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

import _ from 'lodash'

import { findCharts } from './tiles/catalog/scanner'
import { apiRoutePrefix } from './constants'
import type { ChartProvider, OnlineChartProvider } from './types'
import { convertOnlineProviderConfig } from './tiles/catalog/online'
import { registerTileRoutes } from './tiles/routes'
import { registerStyleRoutes } from './resources/style-routes'
import { getDefaultThemeKey } from './style/nautical-style-generator'
import { createImportsConfigService } from './web/imports/config'
import { registerCacheRoutes } from './web/cache/routes'
import {
  listOnlineProviders,
  loadOnlineProvidersFromFile,
  setOnlineProvidersPersistence
} from './online/providers-store'
import {
  buildChartsStorageLayout,
  ensureChartsStorageLayout,
  getChartsStorageLayout,
  resolveChartsRoot,
  setChartsStorageLayout
} from './imports/storage'
import { onImportEvent } from './imports/events'
import { startDebugInputWatcher } from './imports/debug-watcher'
import { registerImportRoutes } from './web/imports/routes'
import {
  loadImportStoreFromFile,
  seedImportJobsFromDatabase,
  setImportStorePersistence,
  listImportJobs
} from './imports/store'
import {
  registerResourcesProvider,
  sanitizeProvider,
  validateVectorProviders
} from './resources/registry'
import express from 'express'
import type { Request, Response, Application } from 'express'
import type {
  Plugin,
  ServerAPI,
  ResourceProviderRegistry
} from '@signalk/server-api'

interface Config {
  chartsRoot?: string
  vectorTheme?: string
  onlineChartProviders: OnlineChartProvider[]
  sidecarEnabled?: boolean
  sidecarBaseUrl?: string
  sidecarTileTemplate?: string
  vectorCatalogs?: Array<{
    identifier: string
    catalog: string
  }>
}

interface ChartProviderApp
  extends ServerAPI, ResourceProviderRegistry, Application {
  config: {
    ssl: boolean
    configPath: string
    version: string
    getExternalPort: () => number
  }
}

const MIN_ZOOM = 1
const MAX_ZOOM = 24
const defaultCatalogId = 'nautical'
type VectorCatalogChoice = typeof defaultCatalogId | 'none'

const plugin = (app: ChartProviderApp): Plugin => {
  let chartProviders: { [key: string]: ChartProvider } = {}
  let refreshChartsFn: (() => Promise<void>) | null = null
  let pluginStarted = false
  let vectorCatalogById = new Map<string, VectorCatalogChoice>()
  let refreshListenerRegistered = false
  let props: Config = {
    vectorTheme: getDefaultThemeKey(),
    onlineChartProviders: []
  }

  let urlBase = ''
  const configBasePath = app.config.configPath
  const defaultChartsRoot = resolveChartsRoot(configBasePath)
  const serverMajorVersion = app.config.version
    ? parseInt(app.config.version.split('.')[0])
    : '1'
  ensureDirectoryExists(defaultChartsRoot)

  let cachePath = defaultChartsRoot

  // Check Node version for schema
  const nodeVersion = process.versions.node
  const nodeMajorVersion = parseInt(nodeVersion.split('.')[0])

  // ******** REQUIRED PLUGIN DEFINITION *******
  const CONFIG_SCHEMA = {
    title: 'Signal K Charts',
    type: 'object',
    properties: {
      ...(nodeMajorVersion < 22 && {
        versionWarning: {
          type: 'string',
          title: 'REQUIRES NODE VERSION >=22',
          description:
            'Starting with version 4 this plugin will not work with Node versions older than 22. You can install an older plugin version from the App store.',
          default: ''
        }
      }),
      chartsRoot: {
        type: 'string',
        title: 'Charts root',
        description: `Root directory for imports storage layout. Defaults to "${defaultChartsRoot}"`
      },
      sidecarEnabled: {
        type: 'boolean',
        title: 'Enable sidecar proxy/cache',
        description:
          'Use a sidecar service for online proxy/cache/seeding instead of the built-in proxy.',
        default: false
      },
      sidecarBaseUrl: {
        type: 'string',
        title: 'Sidecar base URL',
        description:
          'Base URL for the sidecar service, e.g. "http://localhost:8080".'
      },
      sidecarTileTemplate: {
        type: 'string',
        title: 'Sidecar tile URL template',
        description:
          'Template for sidecar tile URLs. Use {id}, {z}, {x}, {y}. Default: /tiles/{id}/{z}/{x}/{y}'
      },
      onlineChartProviders: {
        type: 'array',
        title: 'Online chart providers',
        items: {
          type: 'object',
          title: 'Provider',
          required: ['name', 'minzoom', 'maxzoom', 'format', 'url'],
          properties: {
            name: {
              type: 'string',
              title: 'Name'
            },
            description: {
              type: 'string',
              title: 'Description'
            },
            minzoom: {
              type: 'number',
              title: `Minimum zoom level, between [${MIN_ZOOM}, ${MAX_ZOOM}]`,
              maximum: MAX_ZOOM,
              minimum: MIN_ZOOM,
              default: MIN_ZOOM
            },
            maxzoom: {
              type: 'number',
              title: `Maximum zoom level, between [${MIN_ZOOM}, ${MAX_ZOOM}]`,
              maximum: MAX_ZOOM,
              minimum: MIN_ZOOM,
              default: 15
            },
            serverType: {
              type: 'string',
              title: 'Map source / server type',
              default: 'tilelayer',
              enum: [
                'tilelayer',
                'S-57',
                'WMS',
                'WMTS',
                'mapstyleJSON',
                'tileJSON'
              ],
              description:
                'Map data source type served by the supplied url. (Use tilelayer for xyz / tms tile sources.)'
            },
            format: {
              type: 'string',
              title: 'Format',
              enum: ['png', 'jpg', 'pbf'],
              description:
                'Format of map tiles: raster (png, jpg, etc.) / vector (pbf).'
            },
            url: {
              type: 'string',
              title: 'URL',
              description:
                'Map URL (for tilelayer include {z}, {x} and {y} parameters, e.g. "http://example.org/{z}/{x}/{y}.png")'
            },
            proxy: {
              type: 'boolean',
              title: 'Proxy through signalk server',
              description:
                'Create a proxy to serve remote tiles and cache fetched tiles from the remote server, to serve them locally on subsequent requests. Use webapp to configure seeding jobs to prefetch tiles to local cache.',
              default: false
            },
            headers: {
              type: 'array',
              title: 'Headers',
              description:
                'List of http headers to be sent to the remote server when requesting map tiles through proxy.',
              items: {
                title: 'Header Name: Value',
                description:
                  'Name and Value of the HTTP header separated by colon',
                type: 'string'
              }
            },
            style: {
              type: 'string',
              title: 'Vector Map Style',
              description:
                'Path to file containing map style definitions for Vector maps (e.g. "http://example.org/styles/mymapstyle.json")'
            },
            layers: {
              type: 'array',
              title: 'Layers',
              description:
                'List of map layer ids to display. (Use with WMS / WMTS types.)',
              items: {
                title: 'Layer Name',
                description: 'Name of layer to display',
                type: 'string'
              }
            }
          }
        }
      },
      vectorCatalogs: {
        type: 'array',
        title: 'Vector chart catalog selection',
        description:
          'Choose a catalog per vector chart identifier. Use "none" to disable catalog hints so the plotter uses defaults.',
        items: {
          type: 'object',
          title: 'Vector catalog entry',
          required: ['identifier', 'catalog'],
          properties: {
            identifier: {
              type: 'string',
              title: 'Chart identifier',
              description:
                'Matches the chart identifier returned by the resources API.'
            },
            catalog: {
              type: 'string',
              title: 'Catalog',
              default: defaultCatalogId,
              enum: [defaultCatalogId, 'none']
            }
          }
        }
      }
    }
  }

  const CONFIG_UISCHEMA = {}

  const plugin: Plugin = {
    id: 'charts',
    name: 'Signal K Charts',
    schema: () => CONFIG_SCHEMA,
    uiSchema: () => CONFIG_UISCHEMA,
    start: (settings: Config) => {
      return doStartup(settings) // return required for tests
    },
    stop: () => {
      app.setPluginStatus('stopped')
    }
  }

  const doStartup = async (config: Config) => {
    // Check Node version
    const nodeVersion = process.versions.node
    const majorVersion = parseInt(nodeVersion.split('.')[0])
    if (majorVersion < 22) {
      const errorMsg = `Node version ${nodeVersion} is not supported. This plugin requires Node version 22 or higher. Please upgrade Node or install an older plugin version.`
      app.setPluginError(errorMsg)
      app.debug(errorMsg)
      return Promise.reject(new Error(errorMsg))
    }

    app.debug(`** loaded config: ${config}`)
    props = { ...config }
    vectorCatalogById = buildVectorCatalogMap(props.vectorCatalogs)

    urlBase = `${app.config.ssl ? 'https' : 'http'}://localhost:${
      'getExternalPort' in app.config ? app.config.getExternalPort() : 3000
    }`
    app.debug(`**urlBase** ${urlBase}`)

    const chartsRoot = resolveChartsRoot(configBasePath, props.chartsRoot)
    const layout = buildChartsStorageLayout(chartsRoot)
    ensureChartsStorageLayout(layout)

    const chartPaths = [layout.databaseDir]
    cachePath = path.join(getChartsStorageLayout()?.root || chartsRoot, 'cache')
    ensureDirectoryExists(cachePath)
    setChartsStorageLayout(layout)

    const storePath = path.join(chartsRoot, 'imports-store.json')
    setImportStorePersistence(storePath)
    loadImportStoreFromFile(storePath)
      .then(async () => {
        if (listImportJobs().length === 0) {
          await seedImportJobsFromDatabase(layout.databaseDir)
        }
      })
      .catch((err) => {
        console.error('Failed to initialize import store:', err)
      })

    const onlineStorePath = path.join(chartsRoot, 'online-providers.json')
    setOnlineProvidersPersistence(onlineStorePath)
    await loadOnlineProvidersFromFile(onlineStorePath).catch((err) => {
      console.error('Failed to load online providers store:', err)
    })

    startDebugInputWatcher(path.join(chartsRoot, 'debug_input')).catch(
      (err) => {
        console.error('Failed to start debug input watcher:', err)
      }
    )

    const buildOnlineProviders = () => {
      const sidecarConfig = resolveSidecarConfig(props)
      const combined = [
        ...(props.onlineChartProviders ?? []),
        ...listOnlineProviders()
      ]
      return _.reduce(
        combined,
        (result: { [key: string]: ChartProvider }, data) => {
          const provider = convertOnlineProviderConfig(data) as ChartProvider
          if (sidecarConfig.enabled) {
            const sidecarUrl = buildSidecarTileUrl(
              sidecarConfig.baseUrl,
              sidecarConfig.template,
              provider.identifier
            )
            provider.v1 = {
              ...(provider.v1 ?? {}),
              tilemapUrl: sidecarUrl
            }
            provider.v2 = {
              ...(provider.v2 ?? {}),
              url: sidecarUrl
            }
            provider.proxy = false
            provider.remoteUrl = undefined
            provider.sidecar = true
            provider.sidecarUrl = sidecarUrl
          }
          result[provider.identifier] = provider
          return result
        },
        {}
      )
    }

    let onlineProviders = buildOnlineProviders()
    app.debug(
      `Start charts plugin. Chart paths: ${chartPaths.join(
        ', '
      )}, online charts: ${Object.keys(onlineProviders).length}`
    )

    // Do not register routes if plugin has been started once already
    if (!pluginStarted) {
      registerRoutes()
    }
    pluginStarted = true

    // v2 routes - register as Resource Provider, this needs to be always on startup
    if (serverMajorVersion === 2) {
      app.debug('** Registering v2 API paths **')
      registerAsProvider()
    }

    app.setPluginStatus('Started')

    const loadProviders = (async () => {
      const list = []
      for (const chartPath of chartPaths) {
        list.push(await findCharts(chartPath))
      }
      return list
    })().then((list: Array<{ [key: string]: ChartProvider }>) =>
      _.reduce(list, (result, charts) => _.merge({}, result, charts), {})
    )

    const refreshCharts = async () => {
      const list = []
      for (const chartPath of chartPaths) {
        list.push(await findCharts(chartPath))
      }
      const charts = _.reduce(
        list,
        (result, charts) => _.merge({}, result, charts),
        {}
      ) as { [key: string]: ChartProvider }
      onlineProviders = buildOnlineProviders()
      chartProviders = _.merge({}, charts, onlineProviders) as {
        [key: string]: ChartProvider
      }
      validateVectorProviders(chartProviders, app)
    }
    refreshChartsFn = refreshCharts

    if (!refreshListenerRegistered) {
      let refreshTimer: NodeJS.Timeout | null = null
      onImportEvent((event) => {
        if (event.type === 'item' && event.item.state !== 'AVAILABLE') {
          return
        }
        if (event.type !== 'item' && event.type !== 'delete') {
          return
        }
        if (refreshTimer) {
          return
        }
        refreshTimer = setTimeout(() => {
          refreshTimer = null
          refreshCharts().catch((err) => {
            console.error('Failed to refresh charts after import:', err)
          })
        }, 200)
      })
      refreshListenerRegistered = true
    }

    return loadProviders
      .then((charts: { [key: string]: ChartProvider }) => {
        app.debug(
          `Chart plugin: Found ${
            _.keys(charts).length
          } charts from ${chartPaths.join(', ')}.`
        )
        onlineProviders = buildOnlineProviders()
        chartProviders = _.merge({}, charts, onlineProviders)
        validateVectorProviders(chartProviders, app)
      })
      .catch((e: Error) => {
        console.error(`Error loading chart providers`, e.message)
        chartProviders = {}
        app.setPluginError(`Error loading chart providers`)
      })
  }

  const registerRoutes = () => {
    app.debug('** Registering API paths **')

    const publicAssetsCandidates = [
      path.resolve(__dirname, 'public'),
      path.resolve(__dirname, '..', 'plugin', 'public'),
      path.resolve(__dirname, '..', 'public')
    ]
    const publicAssets = publicAssetsCandidates.find((candidate) =>
      fs.existsSync(candidate)
    )
    if (publicAssets) {
      app.use('/@signalk/charts-plugin', express.static(publicAssets))
    }

    const normalizeParam = (value: string | string[] | undefined) => {
      if (Array.isArray(value)) {
        return value[0] ?? ''
      }
      return value ?? ''
    }

    registerTileRoutes({
      app,
      getProviders: () => chartProviders,
      getCachePath: () => cachePath
    })

    registerStyleRoutes({
      app,
      getProviders: () => chartProviders,
      getCatalogChoice: (identifier) =>
        vectorCatalogById.get(identifier) ?? defaultCatalogId,
      getThemeKey: () => props.vectorTheme,
      defaultCatalogId
    })

    const configService = createImportsConfigService({
      getConfig: () => props,
      setConfig: (next) => {
        props = { ...props, ...next }
      }
    })

    registerImportRoutes({
      app,
      configService,
      onOnlineProvidersChanged: () => {
        refreshChartsFn?.().catch((err) => {
          console.error('Failed to refresh charts after provider change:', err)
        })
      }
    })

    registerCacheRoutes({
      app,
      getProviders: () => chartProviders,
      getCachePath: () => cachePath
    })

    app.debug('** Registering v1 API paths **')

    app.get(
      apiRoutePrefix[1] + '/charts/:identifier',
      (req: Request, res: Response) => {
        const identifier = normalizeParam(req.params.identifier)
        const provider = chartProviders[identifier]
        if (provider) {
          return res.json(sanitizeProvider(provider))
        } else {
          return res.status(404).send('Not found')
        }
      }
    )

    app.get(apiRoutePrefix[1] + '/charts', (req: Request, res: Response) => {
      const sanitized = _.mapValues(chartProviders, (provider) =>
        sanitizeProvider(provider)
      )
      res.json(sanitized)
    })
  }

  // Resources API provider registration
  const registerAsProvider = () => {
    registerResourcesProvider(app, () => chartProviders)
  }

  return plugin
}

export default plugin

const buildVectorCatalogMap = (
  entries?: Array<{ identifier: string; catalog: string }>
) => {
  const map = new Map<string, VectorCatalogChoice>()
  if (!entries) {
    return map
  }
  entries.forEach((entry) => {
    if (!entry?.identifier) {
      return
    }
    const normalized = (entry.catalog || '').toLowerCase()
    const choice = normalized === 'none' ? 'none' : defaultCatalogId
    map.set(entry.identifier, choice)
  })
  return map
}

const ensureDirectoryExists = (path: string) => {
  if (!fs.existsSync(path)) {
    fs.mkdirSync(path)
  }
}

const resolveSidecarConfig = (config: Config) => {
  const enabled = Boolean(config.sidecarEnabled)
  const baseUrl = (config.sidecarBaseUrl || '').trim()
  const template = (
    config.sidecarTileTemplate || '/tiles/{id}/{z}/{x}/{y}'
  ).trim()
  if (!enabled || baseUrl.length === 0) {
    return { enabled: false, baseUrl: '', template }
  }
  return { enabled: true, baseUrl, template }
}

const buildSidecarTileUrl = (
  baseUrl: string,
  template: string,
  identifier: string
) => {
  const normalizedBase = baseUrl.replace(/\/+$/, '')
  const normalizedTemplate = template.startsWith('/')
    ? template
    : `/${template}`
  return `${normalizedBase}${normalizedTemplate}`.replace('{id}', identifier)
}
