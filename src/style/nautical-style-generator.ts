/**
 * Nautischer Mapbox-Style Generator
 * 
 * Ersetzt das alte `buildBasicVectorStyle()` mit einer flexibleren,
 * S-52 konformen Implementierung für Vector Tiles.
 * 
 * Wird progressiv eingeführt, kann als Feature-Flag neben dem alten
 * "basic" Modus koexistieren.
 */

import type { ChartProvider } from '../types'
import {
  EXTENDED_CATALOG_EXAMPLES,
  classifyLayers,
  ClassifiedLayers,
  S52ObjectDefinition
} from './nautical-catalog'

// ============================================================================
// BASE STYLES (S-52 FARB-PALETTE)
// ============================================================================

type ThemeId = 'day' | 'night'

type S52ThemeColors = {
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

const S52_THEMES: Record<ThemeId, S52ThemeColors> = {
  day: {
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
  },
  night: {
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

const getThemeColors = (theme: ThemeId): S52ThemeColors => {
  return S52_THEMES[theme] || S52_THEMES.day
}

// ============================================================================
// BASE STYLE SKELETON
// ============================================================================

function getNauticalBaseStyle(theme: ThemeId) {
  const colors = getThemeColors(theme)
  return {
    version: 8,
    name: `Nautical Charts (S-52 Based, ${theme})`,
    metadata: {
      description: 'IHO S-52 compliant vector chart style for maritime navigation'
    },
    center: [0, 50] as [number, number],
    zoom: 4,
    pitch: 0,
    bearing: 0,
    sprite: '/@signalk/charts-plugin/styles/sprites/s52',
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
 * Generiere Wasser/Tiefenkonturen Layer
 */
function buildWaterAndDepthLayers(
  depthLayerIds: string[],
  sources: string[],
  colors: S52ThemeColors
): any[] {
  const layers: any[] = []

  // Base water (hinter anderen Elementen)
  // Hinweis: In realer Impl. könnte dies auch ein explizites "water" Feature sein
  // Für jetzt: Statischer Layer als Background
  layers.push({
    id: 'water-base',
    type: 'background',
    paint: {
        'background-color': colors.water
    }
  })

  // Tiefenkonturen (source-layer pro depthLayerId)
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
          6, 0.5,
          12, 1.0,
          16, 1.5
        ],
        'line-opacity': 0.6
      }
    })

    // Tiefen-Labels (z.B. "12 m")
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
 * Generiere Landmassen und Urban-Area Layer
 */
function buildLandLayers(
  areaLayerIds: string[],
  colors: S52ThemeColors
): any[] {
  const layers: any[] = []

  for (const layerId of areaLayerIds) {
    // Basis Land-Fläche
    layers.push({
      id: `land-${sanitizeId(layerId)}`,
      type: 'fill',
      source: 'charts-vector',
      'source-layer': layerId,
      paint: {
        'fill-color': colors.land,
        'fill-opacity': 1.0
      }
    })

    // Optional: Landmassen-Outline
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
 * Generiere Linien-Layer (Navigationslinie, Kabel, etc.)
 */
function buildLineLayers(
  lineLayerIds: string[],
  catalog: S52ObjectDefinition[] | undefined,
  colors: S52ThemeColors
): any[] {
  const layers: any[] = []
  const catalogMap = catalog ? new Map(catalog.map(obj => [obj.id, obj])) : new Map()

  for (const layerId of lineLayerIds) {
    const normalized = layerId.toUpperCase()
    const catalogEntry = catalogMap.get(normalized)

    // Standard-Linie
    const lineColor = catalogEntry?.s52ColorScheme?.default || colors.navLine
    const linePattern =
      normalized === 'NAVLNE' ? [4, 2] : undefined // Dashed für Navigationslinie

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
          5, 0.5,
          10, 1.0,
          16, 2.0
        ],
        ...(linePattern && { 'line-dasharray': linePattern })
      }
    })
  }

  return layers
}

/**
 * Generiere Area/Polygon Layer (Ankerbereiche, Sperrgebiete, etc.)
 */
function buildAreaLayers(
  areaLayerIds: string[],
  catalog: S52ObjectDefinition[] | undefined,
  colors: S52ThemeColors
): any[] {
  const layers: any[] = []
  const catalogMap = catalog ? new Map(catalog.map(obj => [obj.id, obj])) : new Map()

  for (const layerId of areaLayerIds) {
    const normalized = layerId.toUpperCase()
    const catalogEntry = catalogMap.get(normalized)

    const fillColor = catalogEntry?.s52ColorScheme?.default || colors.light
    const fillOpacity = normalized === 'ACHARE' ? 0.15 : 0.1 // Ankerbereiche deutlich sichtbar

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
  }

  return layers
}

/**
 * Generiere POI/Symbol Layer (Buoys, Beacons, Lighthouses, etc.)
 */
function buildPOILayers(
  poiLayerIds: string[],
  catalog: S52ObjectDefinition[] | undefined,
  colors: S52ThemeColors
): any[] {
  const layers: any[] = []
  const catalogMap = catalog ? new Map(catalog.map(obj => [obj.id, obj])) : new Map()

  for (const layerId of poiLayerIds) {
    const normalized = layerId.toUpperCase()
    const catalogEntry = catalogMap.get(normalized)

    const hints = catalogEntry?.mapboxRenderingHints || {}
    const minZoom = hints.minZoom ?? 8
    const maxZoom = hints.maxZoom ?? 24
    const priority = hints.priority ?? 50

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
          hints.iconId || 'circle' // Fallback
        ],
        'icon-size': [
          'interpolate',
          ['linear'],
          ['zoom'],
          8, hints.iconSizeByZoom?.z8 ?? 0.8,
          12, hints.iconSizeByZoom?.z12 ?? 1.0,
          16, hints.iconSizeByZoom?.z16 ?? 1.4
        ],
        'icon-allow-overlap': true,
        'icon-optional': true,

        // Labels
        'text-field': [
          'case',
          ['has', hints.labelField || 'name'],
          ['get', hints.labelField || 'name'],
          ''
        ],
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
 * Generiere Hazard Layer (Wracks, Felsen, Untiefen)
 */
function buildHazardLayers(
  hazardLayerIds: string[],
  catalog: S52ObjectDefinition[] | undefined,
  colors: S52ThemeColors
): any[] {
  const layers: any[] = []
  const catalogMap = catalog ? new Map(catalog.map(obj => [obj.id, obj])) : new Map()

  for (const layerId of hazardLayerIds) {
    const normalized = layerId.toUpperCase()
    const catalogEntry = catalogMap.get(normalized)

    const hazardColor = catalogEntry?.s52ColorScheme?.default || colors.hazard
    const iconId = catalogEntry?.mapboxRenderingHints?.iconId || 'cross'

    // Hazard-Symbol (höhere Priorität als normale POIs)
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

    // Halo/Marker für Hazards (visuelles Highlight)
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
 * Generiere einen vollständigen nautischen Mapbox-Style für Vektor-Tiles
 * 
 * Diese Funktion sollte das alte `buildBasicVectorStyle()` ersetzen.
 * Sie ist modular und unterstützt verschiedene Layer-Typen
 * mit automatischer Klassifikation.
 */
export function buildNauticalVectorStyle(
  provider: ChartProvider,
  catalog: S52ObjectDefinition[] = EXTENDED_CATALOG_EXAMPLES,
  theme: ThemeId = 'day'
) {
  const colors = getThemeColors(theme)
  // 1. Hole Layer-IDs aus Provider
  const layerIds = provider.v2?.layers || provider.v1?.chartLayers || []

  // 2. Klassifiziere Layers
  const classified = classifyLayers(layerIds, catalog)

  // 3. Baue Layer-Array auf (Reihenfolge wichtig!)
  const generatedLayers = [
    // Background (Wasser)
    ...buildWaterAndDepthLayers(classified.depth, layerIds, colors),

    // Land under everything
    ...buildLandLayers(
      classified.areas.filter((id) => /LNDARE|BUAARE|LAND|URBAN/i.test(id)),
      colors
    ),

    // Navigation lines (mittlere Ebene)
    ...buildLineLayers(classified.lines, catalog, colors),

    // Areas/zones (z.B. Ankerbereiche)
    ...buildAreaLayers(
      classified.areas.filter(
        (id) => !/LNDARE|BUAARE|LAND|URBAN/i.test(id)
      ),
      catalog,
      colors
    ),

    // POIs (Tonnen, Feuer, etc.) - über Areas
    ...buildPOILayers(classified.poi, catalog, colors),

    // Hazards (Wracks, Felsen) - höchste Priorität
    ...buildHazardLayers(classified.hazard, catalog, colors)
  ]

  // 4. Zusammenfassen mit Base-Style
  const baseStyle = getNauticalBaseStyle(theme)

  return {
    ...baseStyle,
    sources: {
      'charts-vector': {
        type: 'vector' as const,
        tiles: [`/signalk/chart-tiles/${provider.identifier}/{z}/{x}/{y}`],
        minzoom: provider.minzoom || 0,
        maxzoom: provider.maxzoom || 16
      }
    },
    layers: generatedLayers
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Sanitize Layer-ID für Mapbox (nur alphanumeric, -, _)
 */
function sanitizeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]/g, '_')
}

/**
 * Feature-Flag Option: Nutze entweder neuen "nautical" oder alten "basic" Style
 */
export type { ThemeId }
