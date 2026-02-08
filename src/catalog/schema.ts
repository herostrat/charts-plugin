// Type-safe object definitions for the extended object catalog structure
// This file describes the structure with rendering hints

export interface CatalogColorScheme {
  default: string // Hex color for the default case
  [key: string]: string // e.g. "red", "green", "yellow" for lateral marks
}

export interface MapboxRenderingHints {
  layerType: 'poi' | 'line' | 'area' | 'depth' | 'hazard' | 'text' | 'auto'
  minZoom?: number
  maxZoom?: number
  iconId?: string // Reference to sprite sheet
  labelField?: string // Feature property for labels
  textPlacement?: 'point' | 'line'
  textAllowOverlap?: boolean
  textSize?: number
  textColor?: string
  textHaloColor?: string
  textHaloWidth?: number
  iconSizeByZoom?: {
    z8?: number
    z12?: number
    z16?: number
  }
  priority?: number // Stacking order (higher = on top)
  description?: string
}

export interface ChartObjectDefinition {
  // ...existing code...
  id: string // Canonical ID (e.g. "BOYLAT")
  aliases: string[] // Alternative names
  prettyName: string // For UI
  symbolId: string // Legacy symbol reference
  sprite?: string // Fallback sprite name
  notes?: string[]
  origin?: string

  // Rendering hints
  featureType?: 'poi' | 'line' | 'area' | 'depth' | 'hazard' | 'text'
  colorScheme?: CatalogColorScheme
  mapboxRenderingHints?: MapboxRenderingHints

  // Future
  s101Compatible?: boolean
  s101ObjectId?: string // If different in S-101
}

// ============================================================================
// LAYER CLASSIFICATION
// ============================================================================

export interface ClassifiedLayers {
  poi: string[]
  lines: string[]
  areas: string[]
  depth: string[]
  hazard: string[]
  text: string[]
  unknown: string[]
}

/**
 * Classifies layer IDs automatically based on:
 * 1. Object catalog featureType (priority 1)
 * 2. Regex pattern matching (priority 2)
 * 3. Fallback to 'unknown' (priority 3)
 */
export function classifyLayers(
  layerIds: string[],
  catalog?: ChartObjectDefinition[]
): ClassifiedLayers {
  const result: ClassifiedLayers = {
    poi: [],
    lines: [],
    areas: [],
    depth: [],
    hazard: [],
    text: [],
    unknown: []
  }

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

  for (const layerId of layerIds) {
    const normalized = layerId.toUpperCase()

    // Priority 0: label layers are text-only
    if (/(label|labels)/i.test(layerId)) {
      result.text.push(layerId)
      continue
    }

    // Priority 1: catalog lookup
    if (catalogMap.has(normalized)) {
      const feature = catalogMap.get(normalized)!
      const rawType =
        feature.mapboxRenderingHints?.layerType || feature.featureType || 'auto'
      const type =
        rawType === 'line'
          ? 'lines'
          : rawType === 'area'
            ? 'areas'
            : rawType === 'text'
              ? 'text'
              : rawType === 'poi' || rawType === 'depth' || rawType === 'hazard'
                ? rawType
                : 'unknown'
      result[type as keyof ClassifiedLayers].push(layerId)
      continue
    }

    // Priority 1b: alias lookup
    if (aliasMap.has(normalized)) {
      const feature = aliasMap.get(normalized)!
      const rawType =
        feature.mapboxRenderingHints?.layerType || feature.featureType || 'auto'
      const type =
        rawType === 'line'
          ? 'lines'
          : rawType === 'area'
            ? 'areas'
            : rawType === 'text'
              ? 'text'
              : rawType === 'poi' || rawType === 'depth' || rawType === 'hazard'
                ? rawType
                : 'unknown'
      result[type as keyof ClassifiedLayers].push(layerId)
      continue
    }

    // Priority 2: regex pattern
    if (/(depth|soundg|contour|depare|dredged|sounding)/i.test(layerId)) {
      result.depth.push(layerId)
    } else if (/(hazard|wreck|rock|obstruct|danger)/i.test(layerId)) {
      result.hazard.push(layerId)
    } else if (
      /(^|_)(area|zone|basin|ground|lane|roundabout|crossing|scheme|junction)(_|$)/i.test(
        layerId
      )
    ) {
      result.areas.push(layerId)
    } else if (
      /(^|_)(line|route|centreline|centerline|boundary|bank|shore|range|track|pipeline|cable|wall|fence|railway)(_|$)/i.test(
        layerId
      )
    ) {
      result.lines.push(layerId)
    } else if (
      /(^|_)(points|poi|buoy|bcn|light|beacon|daymark|landmark|radar|radio|signal|pilot|pile|pontoon|platform|crane|building|tower|gate|checkpoint|gridiron|tank|spring|bridge|station|facility|mark)(_|$)/i.test(
        layerId
      )
    ) {
      result.poi.push(layerId)
    } else {
      result.unknown.push(layerId)
    }
  }

  return result
}
