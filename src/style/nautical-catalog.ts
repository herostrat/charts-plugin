// Type-Safe Objektdefinition für erweiterte Object-Katalog-Struktur
// Diese Datei zeigt die neue Struktur mit nautischen Rendering-Hints

export interface S52ColorScheme {
  default: string // Hex-Farbe für Standard-Fall
  [key: string]: string // z.B. "red", "green", "yellow" für Lateralmarken
}

export interface MapboxRenderingHints {
  layerType: 'poi' | 'line' | 'area' | 'depth' | 'hazard' | 'auto'
  minZoom?: number
  maxZoom?: number
  iconId?: string // Referenz zu sprite-sheet
  labelField?: string // Feature-Eigenschaft für Label
  iconSizeByZoom?: {
    z8?: number
    z12?: number
    z16?: number
  }
  priority?: number // Stacking order (höher = oben)
  description?: string
}

export interface S52ObjectDefinition {
  id: string // Canonical ID (z.B. "BOYLAT")
  aliases: string[] // Alternative Namen
  prettyName: string // Für UI
  symbolId: string // Legacy S-52 Symbol-ID
  sprite?: string // Fallback sprite name

  // NEU: Nautische Rendering-Hints
  featureType?: 'poi' | 'line' | 'area' | 'depth' | 'hazard'
  s52ColorScheme?: S52ColorScheme
  mapboxRenderingHints?: MapboxRenderingHints

  // Future
  s101Compatible?: boolean
  s101ObjectId?: string // Wenn anders in S-101
}

// ============================================================================
// LAYER-KLASSIFIKATION
// ============================================================================

export interface ClassifiedLayers {
  poi: string[]
  lines: string[]
  areas: string[]
  depth: string[]
  hazard: string[]
  unknown: string[]
}

/**
 * Klassifiziert Layer-IDs automatisch basierend auf:
 * 1. Object-Catalog featureType (Priorität 1)
 * 2. Regex-Pattern Matching (Priorität 2)
 * 3. Fallback auf 'unknown' (Priorität 3)
 */
export function classifyLayers(
  layerIds: string[],
  catalog?: S52ObjectDefinition[]
): ClassifiedLayers {
  const result: ClassifiedLayers = {
    poi: [],
    lines: [],
    areas: [],
    depth: [],
    hazard: [],
    unknown: []
  }

  const catalogMap = catalog
    ? new Map(catalog.map((obj) => [obj.id, obj]))
    : new Map()
  const aliasMap = new Map<string, S52ObjectDefinition>()
  if (catalog) {
    for (const obj of catalog) {
      for (const alias of obj.aliases || []) {
        aliasMap.set(alias.toUpperCase(), obj)
      }
    }
  }

  for (const layerId of layerIds) {
    const normalized = layerId.toUpperCase()

    // Priorität 1: Catalog Look-up
    if (catalogMap.has(normalized)) {
      const feature = catalogMap.get(normalized)!
      const rawType = feature.featureType || 'unknown'
      const type =
        rawType === 'line' ? 'lines' : rawType === 'area' ? 'areas' : rawType
      result[type as keyof ClassifiedLayers].push(layerId)
      continue
    }

    // Priorität 1b: Alias Look-up
    if (aliasMap.has(normalized)) {
      const feature = aliasMap.get(normalized)!
      const rawType = feature.featureType || 'unknown'
      const type =
        rawType === 'line' ? 'lines' : rawType === 'area' ? 'areas' : rawType
      result[type as keyof ClassifiedLayers].push(layerId)
      continue
    }

    // Priorität 2: Regex Pattern
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
