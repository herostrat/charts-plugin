export type RuntimeCopyTask = {
  from: string
  to: string
}

export type RuntimeDownloadTask = {
  url: string
  to: string
  cacheKey?: string
  executable?: boolean
  extract?: {
    type: 'tar.gz'
    entry: string
  }
}

export type RuntimeAssetContext = {
  pluginOutDir: string
  platform: NodeJS.Platform
  arch: string
  pmtilesCliVersion: string
}

const LEAFLET_VERSION = '1.9.4'

export const createRuntimeAssetContext = (
  pluginOutDir: string
): RuntimeAssetContext => ({
  pluginOutDir,
  platform: process.platform,
  arch: process.arch,
  pmtilesCliVersion: process.env.PMTILES_CLI_VERSION || '1.30.0'
})

const resolvePluginPath = (ctx: RuntimeAssetContext, relPath: string) =>
  relPath.replace('{pluginOutDir}', ctx.pluginOutDir)

const pmtilesCliUrlFor = (ctx: RuntimeAssetContext) => {
  if (ctx.platform !== 'linux') return null
  if (ctx.arch !== 'x64' && ctx.arch !== 'arm64') return null

  const arch = ctx.arch === 'x64' ? 'x86_64' : 'arm64'
  const template =
    process.env.PMTILES_CLI_URL_TEMPLATE ||
    'https://github.com/protomaps/go-pmtiles/releases/download/v{version}/go-pmtiles_{version}_Linux_{arch}.tar.gz'
  const url = template
    .replace(/{version}/g, ctx.pmtilesCliVersion)
    .replace('{arch}', arch)
  return url
}

export const runtimeCopyTasks = (ctx: RuntimeAssetContext): RuntimeCopyTask[] => [
  {
    from: 'public',
    to: resolvePluginPath(ctx, '{pluginOutDir}/public')
  }
]

export const runtimeDownloadTasks = (
  ctx: RuntimeAssetContext
): RuntimeDownloadTask[] => {
  const tasks: RuntimeDownloadTask[] = [
    {
      url: `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`,
      to: resolvePluginPath(ctx, '{pluginOutDir}/public/assets/leaflet/leaflet.css'),
      cacheKey: `leaflet-${LEAFLET_VERSION}.css`
    },
    {
      url: `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`,
      to: resolvePluginPath(ctx, '{pluginOutDir}/public/assets/leaflet/leaflet.js'),
      cacheKey: `leaflet-${LEAFLET_VERSION}.js`
    },
    {
      url: `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/images/marker-icon.png`,
      to: resolvePluginPath(
        ctx,
        '{pluginOutDir}/public/assets/leaflet/images/marker-icon.png'
      ),
      cacheKey: `leaflet-${LEAFLET_VERSION}-marker-icon.png`
    },
    {
      url: `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/images/marker-icon-2x.png`,
      to: resolvePluginPath(
        ctx,
        '{pluginOutDir}/public/assets/leaflet/images/marker-icon-2x.png'
      ),
      cacheKey: `leaflet-${LEAFLET_VERSION}-marker-icon-2x.png`
    },
    {
      url: `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/images/marker-shadow.png`,
      to: resolvePluginPath(
        ctx,
        '{pluginOutDir}/public/assets/leaflet/images/marker-shadow.png'
      ),
      cacheKey: `leaflet-${LEAFLET_VERSION}-marker-shadow.png`
    },
    {
      url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson',
      to: resolvePluginPath(
        ctx,
        '{pluginOutDir}/public/assets/world/ne_110m_admin_0_countries.geojson'
      ),
      cacheKey: 'ne_110m_admin_0_countries.geojson'
    }
  ]

  const pmtilesUrl = pmtilesCliUrlFor(ctx)
  if (pmtilesUrl) {
    tasks.push({
      url: pmtilesUrl,
      to: resolvePluginPath(ctx, '{pluginOutDir}/bin/pmtiles'),
      cacheKey: `pmtiles-${ctx.pmtilesCliVersion}-${ctx.platform}-${ctx.arch}.tar.gz`,
      executable: true,
      extract: {
        type: 'tar.gz',
        entry: 'pmtiles'
      }
    })
  }

  return tasks
}
