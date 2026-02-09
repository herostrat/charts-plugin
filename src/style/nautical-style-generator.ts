/**
 * Chart Mapbox style generator.
 *
 * Replaces the old `buildBasicVectorStyle()` with a more flexible,
 * Chart style implementation for vector tiles.
 *
 * Introduced progressively and can coexist with the old
 * "basic" mode behind a feature flag.
 */

import type { ChartProvider } from '../types'
import { CHART_TILES_PATH } from '../routes/paths'
import { classifyLayers } from '../catalog/schema'
import type { ChartObjectDefinition } from '../catalog/schema'

// ============================================================================
// BASE STYLES (CHART COLOR PALETTES)
// ============================================================================

type ThemeColors = {
  water: string
  land: string
  urban: string
  lateralRed: string
  lateralGreen: string
  light: string
  hazard: string
  navLine: string
  depthLine: string
  symbolBlack: string
  symbolWhite: string
}

type StyleLayer = Record<string, unknown>
type ThemeVariant = {
  id: string
  name: string
  colors: ThemeColors
}

type ThemePack = {
  id: string
  name: string
  variants: ThemeVariant[]
}

type ThemeSelection = {
  pack: ThemePack
  variant: ThemeVariant
}

type ThemeKey = string

const DEFAULT_THEME_PACK_ID = 'signalk'
const DEFAULT_THEME_VARIANT_ID = 'day'
const DEFAULT_THEME_KEY = `${DEFAULT_THEME_PACK_ID}_${DEFAULT_THEME_VARIANT_ID}`

const CHART_THEME_PACKS: ThemePack[] = [
  {
    id: 's52',
    name: 'S-52',
    variants: [
      {
        id: 'day',
        name: 'Day',
        colors: {
          water: '#8db3e0',
          land: '#e8d8c8',
          urban: '#d4c4b0',
          lateralRed: '#e60000',
          lateralGreen: '#00b050',
          light: '#ffff00',
          hazard: '#ff00ff',
          navLine: '#cc00ff',
          depthLine: '#1a4d7a',
          symbolBlack: '#000000',
          symbolWhite: '#ffffff'
        }
      },
      {
        id: 'night',
        name: 'Night',
        colors: {
          water: '#0b1b2b',
          land: '#2a211a',
          urban: '#3a2f24',
          lateralRed: '#ff4d4d',
          lateralGreen: '#3ddc84',
          light: '#ffd75e',
          hazard: '#ff66ff',
          navLine: '#b366ff',
          depthLine: '#3b6b9a',
          symbolBlack: '#f0f0f0',
          symbolWhite: '#0a0a0a'
        }
      }
    ]
  },
  {
    id: 'signalk',
    name: 'Signal K',
    variants: [
      {
        id: 'day',
        name: 'Day',
        colors: {
          water: '#79a6d2',
          land: '#e2d1b8',
          urban: '#ccb79a',
          lateralRed: '#cc2b3e',
          lateralGreen: '#2f9b5f',
          light: '#f4d35e',
          hazard: '#c44536',
          navLine: '#5b6d9a',
          depthLine: '#2f5e88',
          symbolBlack: '#1d1d1d',
          symbolWhite: '#f5f5f5'
        }
      },
      {
        id: 'night',
        name: 'Night',
        colors: {
          water: '#0a1825',
          land: '#241a14',
          urban: '#2f231b',
          lateralRed: '#d46a6a',
          lateralGreen: '#5dc18f',
          light: '#e6c15c',
          hazard: '#d48b7b',
          navLine: '#7a8bb3',
          depthLine: '#3d6f9f',
          symbolBlack: '#eaeaea',
          symbolWhite: '#111111'
        }
      }
    ]
  }
]

const getDefaultThemePack = (): ThemePack => {
  return (
    CHART_THEME_PACKS.find((pack) => pack.id === DEFAULT_THEME_PACK_ID) ||
    CHART_THEME_PACKS[0]
  )
}

const parseThemeKey = (themeKey?: string) => {
  const raw = String(themeKey ?? '').trim()
  if (!raw) {
    return {
      packId: DEFAULT_THEME_PACK_ID,
      variantId: DEFAULT_THEME_VARIANT_ID
    }
  }
  if (raw.includes(':')) {
    const [packId, variantId] = raw.split(':', 2)
    return {
      packId,
      variantId: variantId || DEFAULT_THEME_VARIANT_ID
    }
  }
  if (raw.includes('/')) {
    const [packId, variantId] = raw.split('/', 2)
    return {
      packId,
      variantId: variantId || DEFAULT_THEME_VARIANT_ID
    }
  }
  const parts = raw.split('_')
  if (parts.length >= 2) {
    return {
      packId: parts[0],
      variantId: parts.slice(1).join('_') || DEFAULT_THEME_VARIANT_ID
    }
  }
  return {
    packId: raw,
    variantId: DEFAULT_THEME_VARIANT_ID
  }
}

const resolveTheme = (themeKey?: string): ThemeSelection => {
  const { packId, variantId } = parseThemeKey(themeKey)
  const fallbackPack = getDefaultThemePack()
  const pack =
    CHART_THEME_PACKS.find((candidate) => candidate.id === packId) ||
    fallbackPack
  let variant = pack.variants.find((candidate) => candidate.id === variantId)
  if (!variant) {
    variant = pack.variants[0] || fallbackPack.variants[0]
  }
  if (!variant) {
    throw new Error('No vector chart themes configured')
  }
  return { pack, variant }
}

const getThemeKey = (packId: string, variantId: string) =>
  `${packId}_${variantId}`

const getThemeLabel = (themeKey?: string) => {
  const { pack, variant } = resolveTheme(themeKey)
  if (pack.variants.length <= 1) {
    return pack.name
  }
  return `${pack.name} / ${variant.name}`
}

const getThemeColors = (themeKey?: string): ThemeColors => {
  return resolveTheme(themeKey).variant.colors
}

export const getDefaultThemeKey = () => DEFAULT_THEME_KEY

export const getThemeOptions = () =>
  CHART_THEME_PACKS.flatMap((pack) =>
    pack.variants.map((variant) => {
      const key = getThemeKey(pack.id, variant.id)
      return { value: key, label: key }
    })
  )

// ============================================================================
// BASE STYLE SKELETON
// ============================================================================

function getNauticalBaseStyle(theme: ThemeKey) {
  const colors = getThemeColors(theme)
  const label = getThemeLabel(theme)
  return {
    version: 8,
    name: `Chart Style (${label})`,
    metadata: {
      description: 'Vector chart style for maritime navigation'
    },
    center: [0, 50] as [number, number],
    zoom: 4,
    pitch: 0,
    bearing: 0,
    sprite: '/@signalk/charts-plugin/styles/sprites/nautical',
    glyphs: '/@signalk/charts-plugin/fonts/{fontstack}/{range}.pbf',
    background: {
      paint: {
        'background-color': colors.water
      }
    }
  }
}

// ============================================================================
// LAYER GENERATORS
// ============================================================================

/**
 * Build water/depth contour layers
 */
function buildWaterAndDepthLayers(
  depthLayerIds: string[],
  colors: ThemeColors
): StyleLayer[] {
  const layers: StyleLayer[] = []

  // Base water (behind other elements)
  // Note: In a real implementation this could be an explicit "water" feature
  // For now: static layer as background
  layers.push({
    id: 'water-base',
    type: 'background',
    paint: {
      'background-color': colors.water
    }
  })

  // Depth contours (source-layer per depthLayerId)
  for (const layerId of depthLayerIds) {
    layers.push({
      id: `depth-contours-${sanitizeId(layerId)}`,
      type: 'line',
      source: 'charts-vector',
      'source-layer': layerId,
      paint: {
        'line-color': colors.depthLine,
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          6,
          0.5,
          12,
          1.0,
          16,
          1.5
        ],
        'line-opacity': 0.6
      }
    })

    // Depth labels (e.g. "12 m")
    layers.push({
      id: `depth-labels-${sanitizeId(layerId)}`,
      type: 'symbol',
      source: 'charts-vector',
      'source-layer': layerId,
      minzoom: 9,
      layout: {
        'text-field': ['get', 'depth'],
        'text-size': 9,
        'text-font': ['sans'],
        'text-anchor': 'center',
        'symbol-placement': 'line-center',
        'text-rotation-alignment': 'map'
      },
      paint: {
        'text-color': colors.depthLine,
        'text-halo-color': colors.symbolWhite,
        'text-halo-width': 1
      }
    })
  }

  return layers
}

/**
 * Build landmass and urban area layers
 */
function buildLandLayers(
  areaLayerIds: string[],
  colors: ThemeColors,
  fillColorOverride?: string
): StyleLayer[] {
  const layers: StyleLayer[] = []
  const fillColor = fillColorOverride ?? colors.land

  for (const layerId of areaLayerIds) {
    // Base land fill
    layers.push({
      id: `land-${sanitizeId(layerId)}`,
      type: 'fill',
      source: 'charts-vector',
      'source-layer': layerId,
      paint: {
        'fill-color': fillColor,
        'fill-opacity': 1.0
      }
    })

    // Optional: land outline
    layers.push({
      id: `land-outline-${sanitizeId(layerId)}`,
      type: 'line',
      source: 'charts-vector',
      'source-layer': layerId,
      paint: {
        'line-color': '#999999',
        'line-width': 0.5
      }
    })
  }

  return layers
}

/**
 * Build line layers (navigation line, cable, etc.)
 */
function buildLineLayers(
  lineLayerIds: string[],
  catalog: ChartObjectDefinition[] | undefined,
  colors: ThemeColors
): StyleLayer[] {
  const layers: StyleLayer[] = []
  const catalogMap = catalog
    ? new Map(catalog.map((obj) => [obj.id, obj]))
    : new Map()

  for (const layerId of lineLayerIds) {
    const normalized = layerId.toUpperCase()
    const catalogEntry = catalogMap.get(normalized)

    // Standard-Linie
    const lineColor = catalogEntry?.colorScheme?.default || colors.navLine
    const linePattern = normalized === 'NAVLNE' ? [4, 2] : undefined // Dashed for navigation line

    layers.push({
      id: `line-${sanitizeId(layerId)}`,
      type: 'line',
      source: 'charts-vector',
      'source-layer': layerId,
      paint: {
        'line-color': lineColor,
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          5,
          0.5,
          10,
          1.0,
          16,
          2.0
        ],
        ...(linePattern && { 'line-dasharray': linePattern })
      }
    })
  }

  return layers
}

/**
 * Build area/polygon layers (anchorage, restricted areas, etc.)
 */
function buildAreaLayers(
  areaLayerIds: string[],
  catalog: ChartObjectDefinition[] | undefined,
  colors: ThemeColors
): StyleLayer[] {
  const layers: StyleLayer[] = []
  const catalogMap = catalog
    ? new Map(catalog.map((obj) => [obj.id, obj]))
    : new Map()
  const aliasMap = new Map<string, ChartObjectDefinition>()
  if (catalog) {
    for (const obj of catalog) {
      for (const alias of obj.aliases || []) {
        aliasMap.set(alias.toUpperCase(), obj)
      }
    }
  }
  const patternAreas = new Set(['ACHARE', 'SNDWAV', 'WEDKLP', 'SPLARE'])

  for (const layerId of areaLayerIds) {
    const normalized = layerId.toUpperCase()
    const catalogEntry = catalogMap.get(normalized) || aliasMap.get(normalized)

    const fillColor = catalogEntry?.colorScheme?.default || colors.light
    const fillOpacity = normalized === 'ACHARE' ? 0.15 : 0.1 // Make anchorage areas more visible

    layers.push({
      id: `area-fill-${sanitizeId(layerId)}`,
      type: 'fill',
      source: 'charts-vector',
      'source-layer': layerId,
      paint: {
        'fill-color': fillColor,
        'fill-opacity': fillOpacity
      }
    })

    if (
      patternAreas.has(normalized) &&
      catalogEntry?.mapboxRenderingHints?.iconId
    ) {
      const patternId = `${catalogEntry.mapboxRenderingHints.iconId}-pattern`
      layers.push({
        id: `area-pattern-${sanitizeId(layerId)}`,
        type: 'fill',
        source: 'charts-vector',
        'source-layer': layerId,
        paint: {
          'fill-pattern': patternId,
          'fill-opacity': 0.18
        }
      })
    }

    // Outline
    layers.push({
      id: `area-outline-${sanitizeId(layerId)}`,
      type: 'line',
      source: 'charts-vector',
      'source-layer': layerId,
      paint: {
        'line-color': fillColor,
        'line-width': 1.5,
        'line-opacity': 0.8
      }
    })

    const areaIconId = catalogEntry?.mapboxRenderingHints?.iconId
    if (areaIconId) {
      const minZoom = catalogEntry?.mapboxRenderingHints?.minZoom ?? 10
      const iconSizeByZoom = catalogEntry?.mapboxRenderingHints?.iconSizeByZoom
      layers.push({
        id: `area-symbol-${sanitizeId(layerId)}`,
        type: 'symbol',
        source: 'charts-vector',
        'source-layer': layerId,
        minzoom: minZoom,
        layout: {
          'icon-image': [
            'case',
            ['all', ['has', 'symbol_id'], ['!=', ['get', 'symbol_id'], '']],
            ['get', 'symbol_id'],
            areaIconId
          ],
          'symbol-placement': 'point',
          'icon-anchor': 'center',
          'icon-size': [
            'interpolate',
            ['linear'],
            ['zoom'],
            8,
            iconSizeByZoom?.z8 ?? 0.8,
            12,
            iconSizeByZoom?.z12 ?? 1.0,
            16,
            iconSizeByZoom?.z16 ?? 1.2
          ],
          'symbol-avoid-edges': false,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-optional': true
        }
      })
    }
  }

  return layers
}

/**
 * Build POI/symbol layers (buoys, beacons, lighthouses, etc.)
 */
function buildPOILayers(
  poiLayerIds: string[],
  catalog: ChartObjectDefinition[] | undefined,
  colors: ThemeColors
): StyleLayer[] {
  const layers: StyleLayer[] = []
  const catalogMap = catalog
    ? new Map(catalog.map((obj) => [obj.id, obj]))
    : new Map()

  for (const layerId of poiLayerIds) {
    const normalized = layerId.toUpperCase()
    const catalogEntry = catalogMap.get(normalized)

    const hints = catalogEntry?.mapboxRenderingHints || {}
    const minZoom = hints.minZoom ?? 8
    const maxZoom = hints.maxZoom ?? 24
    const labelField =
      hints.labelField && hints.labelField.trim() ? hints.labelField : 'name'
    const defaultIconId = hints.iconId || getDefaultPoiIconId(layerId)

    // Haupt-Symbol Layer
    layers.push({
      id: `poi-symbol-${sanitizeId(layerId)}`,
      type: 'symbol',
      source: 'charts-vector',
      'source-layer': layerId,
      minzoom: minZoom,
      maxzoom: maxZoom,
      layout: {
        // Icon-ID: entweder von Feature oder von Catalog
        'icon-image': [
          'case',
          ['has', 'symbol_id'],
          ['get', 'symbol_id'], // Feature-spezifisch
          defaultIconId // Fallback
        ],
        'icon-size': [
          'interpolate',
          ['linear'],
          ['zoom'],
          8,
          hints.iconSizeByZoom?.z8 ?? 0.8,
          12,
          hints.iconSizeByZoom?.z12 ?? 1.0,
          16,
          hints.iconSizeByZoom?.z16 ?? 1.4
        ],
        'icon-allow-overlap': true,
        'icon-optional': true,

        // Labels
        'text-field': ['case', ['has', labelField], ['get', labelField], ''],
        'text-offset': [0, 1.5],
        'text-size': 10,
        'text-font': ['OpenSans Regular'],
        'text-allow-overlap': false,
        'text-anchor': 'top'
      },
      paint: {
        'text-color': colors.symbolBlack,
        'text-halo-color': colors.symbolWhite,
        'text-halo-width': 1
      }
    })
  }

  return layers
}

/**
 * Build text-only label layers (street names, place labels, etc.)
 */
function buildTextLayers(
  textLayerIds: string[],
  catalog: ChartObjectDefinition[] | undefined,
  colors: ThemeColors
): StyleLayer[] {
  const layers: StyleLayer[] = []
  const catalogMap = catalog
    ? new Map(catalog.map((obj) => [obj.id, obj]))
    : new Map()
  const aliasMap = new Map<string, ChartObjectDefinition>()
  if (catalog) {
    for (const obj of catalog) {
      for (const alias of obj.aliases || []) {
        aliasMap.set(alias.toUpperCase(), obj)
      }
    }
  }

  for (const layerId of textLayerIds) {
    const normalized = layerId.toUpperCase()
    const catalogEntry = catalogMap.get(normalized) || aliasMap.get(normalized)
    const hints = catalogEntry?.mapboxRenderingHints || {}
    const labelField =
      hints.labelField && hints.labelField.trim() ? hints.labelField : 'name'
    const minZoom = hints.minZoom ?? 8
    const maxZoom = hints.maxZoom ?? 24
    const placement =
      hints.textPlacement ||
      (/(line|lines|street|water_lines|river)/i.test(layerId)
        ? 'line'
        : 'point')

    layers.push({
      id: `text-label-${sanitizeId(layerId)}`,
      type: 'symbol',
      source: 'charts-vector',
      'source-layer': layerId,
      minzoom: minZoom,
      maxzoom: maxZoom,
      layout: {
        'text-field': ['case', ['has', labelField], ['get', labelField], ''],
        'text-size': hints.textSize ?? 11,
        'text-font': ['OpenSans Regular'],
        ...(placement === 'line'
          ? {
              'symbol-placement': 'line',
              'text-rotation-alignment': 'map'
            }
          : {
              'symbol-placement': 'point',
              'text-offset': [0, 0.8],
              'text-anchor': 'top'
            }),
        'text-allow-overlap': hints.textAllowOverlap ?? false
      },
      paint: {
        'text-color': hints.textColor ?? colors.symbolBlack,
        'text-halo-color': hints.textHaloColor ?? colors.symbolWhite,
        'text-halo-width': hints.textHaloWidth ?? 1
      }
    })
  }

  return layers
}

/**
 * Build hazard layers (wrecks, rocks, shoals)
 */
function buildHazardLayers(
  hazardLayerIds: string[],
  catalog: ChartObjectDefinition[] | undefined,
  colors: ThemeColors
): StyleLayer[] {
  const layers: StyleLayer[] = []
  const catalogMap = catalog
    ? new Map(catalog.map((obj) => [obj.id, obj]))
    : new Map()

  for (const layerId of hazardLayerIds) {
    const normalized = layerId.toUpperCase()
    const catalogEntry = catalogMap.get(normalized)

    const hazardColor = catalogEntry?.colorScheme?.default || colors.hazard
    const iconId =
      catalogEntry?.mapboxRenderingHints?.iconId ||
      getDefaultHazardIconId(layerId)

    // Hazard symbol (higher priority than regular POIs)
    layers.push({
      id: `hazard-symbol-${sanitizeId(layerId)}`,
      type: 'symbol',
      source: 'charts-vector',
      'source-layer': layerId,
      minzoom: catalogEntry?.mapboxRenderingHints?.minZoom ?? 6,
      layout: {
        'icon-image': [
          'case',
          ['has', 'symbol_id'],
          ['get', 'symbol_id'],
          iconId
        ],
        'icon-size': 1.2,
        'icon-allow-overlap': true,
        'icon-pitch-alignment': 'map'
      }
    })

    // Halo/marker for hazards (visual highlight)
    layers.push({
      id: `hazard-halo-${sanitizeId(layerId)}`,
      type: 'circle',
      source: 'charts-vector',
      'source-layer': layerId,
      minzoom: 6,
      paint: {
        'circle-radius': 8,
        'circle-color': hazardColor,
        'circle-opacity': 0.1,
        'circle-stroke-width': 2,
        'circle-stroke-color': hazardColor,
        'circle-stroke-opacity': 0.6
      }
    })
  }

  return layers
}

// ============================================================================
// MAIN GENERATOR FUNCTION
// ============================================================================

/**
 * Build a complete nautical Mapbox style for vector tiles
 *
 * Diese Funktion sollte das alte `buildBasicVectorStyle()` ersetzen.
 * Sie ist modular und unterstützt verschiedene Layer-Typen
 * mit automatischer Klassifikation.
 */
export function buildNauticalVectorStyle(
  provider: ChartProvider,
  catalog: ChartObjectDefinition[],
  theme: ThemeKey = getDefaultThemeKey()
) {
  const colors = getThemeColors(theme)
  // 1. Hole Layer-IDs aus Provider
  const layerIds = provider.v2?.layers || provider.v1?.chartLayers || []

  // 2. Classify layers
  const classified = classifyLayers(layerIds, catalog)

  // 3. Build layer array (order matters)
  const generatedLayers = [
    // Background (Wasser)
    ...buildWaterAndDepthLayers(classified.depth, colors),

    // Land under everything
    ...buildLandLayers(
      classified.areas.filter((id) => /LNDARE|LAND/i.test(id)),
      colors
    ),

    // Urban areas above land
    ...buildLandLayers(
      classified.areas.filter((id) => /BUAARE|URBAN/i.test(id)),
      colors,
      colors.urban
    ),

    // Areas/zones (e.g. anchorage)
    ...buildAreaLayers(
      classified.areas.filter((id) => !/LNDARE|BUAARE|LAND|URBAN/i.test(id)),
      catalog,
      colors
    ),

    // Navigation lines (middle layer, above areas)
    ...buildLineLayers(classified.lines, catalog, colors),

    // Text-only labels (street/water/place labels)
    ...buildTextLayers(classified.text, catalog, colors),

    // POIs (buoys, lights, etc.) - above areas
    ...buildPOILayers(classified.poi, catalog, colors),

    // Hazards (wrecks, rocks) - highest priority
    ...buildHazardLayers(classified.hazard, catalog, colors)
  ]

  // 4. Combine with base style
  const baseStyle = getNauticalBaseStyle(theme)

  const sourceBase = {
    type: 'vector' as const,
    minzoom: provider.minzoom || 0,
    maxzoom: provider.maxzoom || 16
  }

  const vectorSource = {
    ...sourceBase,
    tiles: [`${CHART_TILES_PATH}/${provider.identifier}/{z}/{x}/{y}`]
  }

  return {
    ...baseStyle,
    sources: {
      'charts-vector': vectorSource
    },
    layers: generatedLayers
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Sanitize layer ID for Mapbox (alphanumeric, -, _ only)
 */
function sanitizeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]/g, '_')
}

function getDefaultPoiIconId(layerId: string): string {
  const normalized = normalizeIconKey(layerId)
  if (normalized.includes('light')) {
    return 'light_major'
  }
  const freeboardIcon = getFreeboardPoiIconId(normalized)
  if (freeboardIcon) {
    return freeboardIcon
  }
  return 'circle'
}

function getDefaultHazardIconId(layerId: string): string {
  const normalized = normalizeIconKey(layerId)
  if (normalized.includes('wreck')) {
    return 'wreck'
  }
  if (normalized.includes('rock') || normalized.includes('obstruction')) {
    return 'obstruction'
  }
  if (normalized.includes('hazard')) {
    return 'obstrn'
  }
  return 'cross'
}

const FREEBOARD_POI_ICON_MAP = new Map<string, string>([
  ['anchorage', 'achare'],
  ['basestation', 'basestation'],
  ['boatramp', 'smcfac'],
  ['business', 'buisgl'],
  ['dam', 'damcon'],
  ['dock', 'docare'],
  ['ferry', 'feryrt'],
  ['fuel', 'hrbfac'],
  ['hazard', 'obstrn'],
  ['inlet', 'seaare'],
  ['lock', 'lokbsn'],
  ['marina', 'smcfac'],
  ['navigation-structure', 'lndmrk'],
  ['notice-to-mariners', 'sistaw'],
  ['radio-call-point', 'rdocal'],
  ['transhipment-dock', 'ctsare'],
  ['turning-basin', 'hrbare'],
  ['waterway-guage', 'tidewy']
])

const FREEBOARD_ATON_VARIANTS: Array<{ pattern: RegExp; icon: string }> = [
  { pattern: /virtual.*north|north.*virtual/, icon: 'virtual-north' },
  { pattern: /virtual.*east|east.*virtual/, icon: 'virtual-east' },
  { pattern: /virtual.*south|south.*virtual/, icon: 'virtual-south' },
  { pattern: /virtual.*west|west.*virtual/, icon: 'virtual-west' },
  { pattern: /virtual.*danger|danger.*virtual/, icon: 'virtual-danger' },
  { pattern: /virtual.*safe|safe.*virtual/, icon: 'virtual-safe' },
  { pattern: /virtual.*special|special.*virtual/, icon: 'virtual-special' },
  { pattern: /virtual.*port|port.*virtual/, icon: 'virtual-port' },
  {
    pattern: /virtual.*starboard|starboard.*virtual/,
    icon: 'virtual-starboard'
  },
  { pattern: /real.*north|north.*real/, icon: 'real-north' },
  { pattern: /real.*east|east.*real/, icon: 'real-east' },
  { pattern: /real.*south|south.*real/, icon: 'real-south' },
  { pattern: /real.*west|west.*real/, icon: 'real-west' },
  { pattern: /real.*danger|danger.*real/, icon: 'real-danger' },
  { pattern: /real.*safe|safe.*real/, icon: 'real-safe' },
  { pattern: /real.*special|special.*real/, icon: 'real-special' },
  { pattern: /real.*port|port.*real/, icon: 'real-port' },
  { pattern: /real.*starboard|starboard.*real/, icon: 'real-starboard' }
]

function getFreeboardPoiIconId(normalizedLayerId: string): string | null {
  for (const [key, icon] of FREEBOARD_POI_ICON_MAP.entries()) {
    if (normalizedLayerId === key || normalizedLayerId.includes(key)) {
      return icon
    }
  }

  for (const variant of FREEBOARD_ATON_VARIANTS) {
    if (variant.pattern.test(normalizedLayerId)) {
      return variant.icon
    }
  }

  if (
    normalizedLayerId.includes('virtual') &&
    normalizedLayerId.includes('aton')
  ) {
    return 'virtual-aton'
  }

  if (
    normalizedLayerId.includes('aton') ||
    normalizedLayerId.includes('beacon') ||
    normalizedLayerId.includes('buoy')
  ) {
    return 'real-aton'
  }

  return null
}

function normalizeIconKey(value: string): string {
  return value.toLowerCase().replace(/_/g, '-')
}

/**
 * Feature flag option: use the new "nautical" or the old "basic" style
 */
export type { ThemeKey }
