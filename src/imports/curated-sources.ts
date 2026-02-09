import fs from 'fs/promises'
import path from 'path'
import { fetchNoaaEncCharts } from './scrapers/noaa-enc'

export type CuratedChart = {
  id: string
  name: string
  url: string
  type?: 'geotiff' | 's57' | 'mbtiles' | 'pmtiles' | 'unknown'
  note?: string
  sizeBytes?: number
  details?: string
  lastUpdated?: string
  deliveries?: CuratedDelivery[]
}

export type CuratedDelivery = {
  id: string
  label?: string
  kind: 'direct' | 'bbox'
  method?: 'pmtiles' | 'url'
  type?: CuratedChart['type']
  url?: string
  sourceUrl?: string
  urlTemplate?: string
  bboxParam?: string
  maxZoom?: number
  preferred?: boolean
  note?: string
}

export type CuratedProvider = {
  id: string
  name: string
  homepage?: string
  note?: string
  checkedAt?: string
  charts: CuratedChart[]
}

export type CuratedSourceCatalog = {
  generatedAt: string
  source: 'cache' | 'generated'
  providers: CuratedProvider[]
}

export const CURATED_SOURCES_PATH = path.resolve(
  'dev-data',
  'curated-sources.json'
)

type CuratedProviderFetcher = {
  id: string
  name: string
  homepage?: string
  note?: string
  fetch: () => Promise<CuratedChart[]>
}

const providers: CuratedProviderFetcher[] = [
  {
    id: 'noaa-enc',
    name: 'NOAA Office of Coast Survey - ENC',
    homepage: 'https://charts.noaa.gov/ENCs/ENCs.shtml',
    note: 'U.S. coasts, Puerto Rico, US Virgin Islands, Hawaiian Islands to Midway, American Samoa, Guam, Northern Marianas Islands.',
    fetch: fetchNoaaEncCharts
  }
]

const buildPmtilesBboxChart = (opts: {
  id: string
  name: string
  sourceUrl: string
  maxZoom?: number
  format?: string
  details?: string
  note?: string
}) => {
  const details = [opts.format ? `format: ${opts.format}` : null, opts.details]
    .filter(Boolean)
    .join(' | ')
  return {
    id: opts.id,
    name: opts.name,
    url: opts.sourceUrl,
    type: 'pmtiles' as const,
    note: opts.note,
    details: details || undefined,
    deliveries: [
      {
        id: 'pmtiles-bbox',
        label: 'PMTiles (area extract)',
        kind: 'bbox' as const,
        method: 'pmtiles' as const,
        type: 'pmtiles' as const,
        sourceUrl: opts.sourceUrl,
        maxZoom: opts.maxZoom,
        preferred: true
      }
    ]
  }
}

const fetchOpenSeaMapCharts = async () => [
  buildPmtilesBboxChart({
    id: 'seamap',
    name: 'OpenSeaMap Seamarks',
    sourceUrl: 'https://fsn1.your-objectstorage.com/mtk-seamap/seamap.pmtiles',
    maxZoom: 14,
    format: 'pbf',
    note: 'Attribution: OpenSeaMap contributors.'
  })
]

const fetchOsmCharts = async () => [
  buildPmtilesBboxChart({
    id: 'osm',
    name: 'OpenStreetMap',
    sourceUrl: 'https://fsn1.your-objectstorage.com/mtk-seamap/osm.pmtiles',
    maxZoom: 14,
    format: 'pbf',
    note: 'Attribution: OpenStreetMap contributors (ODbL).'
  })
]

const fetchMapterhornCharts = async () => [
  buildPmtilesBboxChart({
    id: 'mapterhorn',
    name: 'Mapterhorn Terrain',
    sourceUrl: 'https://download.mapterhorn.com/planet.pmtiles',
    maxZoom: 10,
    format: 'webp',
    details: 'tileSize: 512 | encoding: terrarium',
    note: 'Attribution: mapterhorn.com/attribution.'
  })
]

const fetchGebcoCharts = async () => [
  buildPmtilesBboxChart({
    id: 'gebco',
    name: 'GEBCO Bathymetry',
    sourceUrl: 'https://fsn1.your-objectstorage.com/mtk-seamap/gebco.pmtiles',
    maxZoom: 9,
    format: 'webp',
    details: 'tileSize: 512 | encoding: terrarium',
    note: 'Attribution: GEBCO.'
  })
]

const fetchEmodnetCharts = async () => [
  buildPmtilesBboxChart({
    id: 'emodnet',
    name: 'EMODnet Bathymetry',
    sourceUrl: 'https://fsn1.your-objectstorage.com/mtk-seamap/emod.pmtiles',
    maxZoom: 11,
    format: 'webp',
    details: 'tileSize: 512 | encoding: terrarium',
    note: 'Attribution: EMODnet.'
  })
]

const stubProviders: CuratedProviderFetcher[] = [
  {
    id: 'openseamap',
    name: 'OpenSeaMap (stub)',
    homepage: 'https://www.openseamap.org/',
    note: 'Terms: https://openseamap.org/index.php?id=copyright (site content CC BY-SA 2.0). Verify data licensing before use.',
    fetch: fetchOpenSeaMapCharts
  },
  {
    id: 'openstreetmap',
    name: 'OpenStreetMap (stub)',
    homepage: 'https://www.openstreetmap.org/',
    note: 'Terms: https://www.openstreetmap.org/copyright (ODbL; attribution required).',
    fetch: fetchOsmCharts
  },
  {
    id: 'mapterhorn',
    name: 'Mapterhorn Terrain (stub)',
    homepage: 'https://mapterhorn.com/',
    note: 'Terms: https://mapterhorn.com/attribution (source-specific licenses).',
    fetch: fetchMapterhornCharts
  },
  {
    id: 'gebco',
    name: 'GEBCO (stub)',
    homepage: 'https://www.gebco.net/',
    note: 'Terms: https://www.gebco.net/data_and_products/gridded_bathymetry_data/ (public domain with attribution guidance).',
    fetch: fetchGebcoCharts
  },
  {
    id: 'emodnet',
    name: 'EMODnet (stub)',
    homepage: 'https://emodnet.ec.europa.eu/',
    note: 'Terms: https://emodnet.ec.europa.eu/en/terms-use (site blocked during lookup; verify manually).',
    fetch: fetchEmodnetCharts
  }
]

const allProviders: CuratedProviderFetcher[] = [...providers, ...stubProviders]

const readCachedSources = async (): Promise<CuratedSourceCatalog | null> => {
  try {
    const raw = await fs.readFile(CURATED_SOURCES_PATH, 'utf8')
    const parsed = JSON.parse(raw) as CuratedSourceCatalog
    if (!parsed || !Array.isArray(parsed.providers)) {
      return null
    }
    return { ...parsed, source: 'cache' }
  } catch {
    return null
  }
}

export const writeCuratedSources = async (catalog: CuratedSourceCatalog) => {
  await fs.mkdir(path.dirname(CURATED_SOURCES_PATH), { recursive: true })
  const payload = JSON.stringify(catalog, null, 2)
  await fs.writeFile(CURATED_SOURCES_PATH, payload)
}

const buildProviders = async (): Promise<CuratedProvider[]> => {
  const now = new Date().toISOString()
  const results: CuratedProvider[] = []
  for (const provider of allProviders) {
    const charts = await provider.fetch()
    results.push({
      id: provider.id,
      name: provider.name,
      homepage: provider.homepage,
      note: provider.note,
      checkedAt: now,
      charts
    })
  }
  return results
}

export const generateCuratedSources =
  async (): Promise<CuratedSourceCatalog> => {
    const generatedAt = new Date().toISOString()
    const generatedProviders = await buildProviders()
    return { generatedAt, source: 'generated', providers: generatedProviders }
  }

export const getCuratedSources = async (opts?: { refresh?: boolean }) => {
  if (!opts?.refresh) {
    const cached = await readCachedSources()
    if (cached && cached.providers.length > 0) return cached
  }
  // TODO: consider TTL-based cache refresh for curated sources.
  const generated = await generateCuratedSources()
  await writeCuratedSources(generated)
  return generated
}
