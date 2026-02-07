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

// BEISPIEL-EINTRÄGE (Erweiterung zu object-catalog.json)

export const EXTENDED_CATALOG_EXAMPLES: S52ObjectDefinition[] = [
  {
    id: 'BOYLAT',
    aliases: ['buoy_lateral', 'buoy-lateral'],
    prettyName: 'Buoy Lateral',
    symbolId: 's52_boylat',
    featureType: 'poi',
    s52ColorScheme: {
      default: '#e60000', // Rot, if keine colour_pattern
      red: '#e60000',
      green: '#00b050',
      yellow: '#ffff00',
      white: '#ffffff'
    },
    mapboxRenderingHints: {
      layerType: 'poi',
      minZoom: 8,
      iconId: 'boylat',
      labelField: 'name',
      iconSizeByZoom: { z8: 0.8, z12: 1.0, z16: 1.4 },
      priority: 50,
      description: 'Lateral buoys mark port/starboard navigation channels'
    },
    s101Compatible: true
  },

  {
    id: 'BCNLAT',
    aliases: ['beacon_lateral', 'beacon-lateral'],
    prettyName: 'Beacon Lateral',
    symbolId: 's52_bcnlat',
    featureType: 'poi',
    s52ColorScheme: {
      default: '#e60000',
      red: '#e60000',
      green: '#00b050'
    },
    mapboxRenderingHints: {
      layerType: 'poi',
      minZoom: 8,
      iconId: 'bcnlat',
      labelField: 'name',
      priority: 60 // Feuer höher als Tonnen
    },
    s101Compatible: true
  },

  {
    id: 'LIGHTS',
    aliases: ['light', 'lighthouse', 'beacon'],
    prettyName: 'Light / Lighthouse',
    symbolId: 's52_lights',
    featureType: 'poi',
    s52ColorScheme: {
      default: '#ffff00' // Gelb nach S-52
    },
    mapboxRenderingHints: {
      layerType: 'poi',
      minZoom: 7,
      iconId: 'light_major',
      labelField: 'name',
      priority: 70, // Höchste Priorität
      description: 'Major lights with distinctive patterns'
    },
    s101Compatible: true
  },

  {
    id: 'WRECKS',
    aliases: ['wreck'],
    prettyName: 'Wreck',
    symbolId: 's52_wrecks',
    featureType: 'hazard',
    s52ColorScheme: {
      default: '#ff00ff' // Magenta für Gefahren
    },
    mapboxRenderingHints: {
      layerType: 'hazard',
      minZoom: 6,
      iconId: 'wreck',
      labelField: 'depth', // Falls vorhanden, zeige Tiefe
      priority: 45,
      description: 'Dangerous wrecks, may be submerged'
    },
    s101Compatible: true,
    s101ObjectId: 'WRECK' // Gleich in S-101, aber für Zukunft dokumentiert
  },

  {
    id: 'OBSTRN',
    aliases: ['obstruction', 'rock', 'shoal'],
    prettyName: 'Obstruction / Underwater Hazard',
    symbolId: 's52_obstrn',
    featureType: 'hazard',
    s52ColorScheme: {
      default: '#ff00ff'
    },
    mapboxRenderingHints: {
      layerType: 'hazard',
      minZoom: 8,
      iconId: 'obstruction',
      priority: 45,
      description: 'Rocks, reefs, and other underwater obstructions'
    },
    s101Compatible: true
  },

  {
    id: 'ACHARE',
    aliases: ['anchorage'],
    prettyName: 'Anchorage Area',
    symbolId: 's52_achare',
    featureType: 'area',
    s52ColorScheme: {
      default: '#ffff00' // Gelb für Ankerbereiche in S-52
    },
    mapboxRenderingHints: {
      layerType: 'area',
      minZoom: 8,
      description: 'Designated anchorage areas',
      priority: 20
    },
    s101Compatible: true
  },

  {
    id: 'NAVLNE',
    aliases: ['navigation_line', 'shipping_lane'],
    prettyName: 'Navigation Line',
    symbolId: 's52_navlne',
    featureType: 'line',
    s52ColorScheme: {
      default: '#cc00ff' // Magenta für Navigationsrouten
    },
    mapboxRenderingHints: {
      layerType: 'line',
      minZoom: 5,
      description: 'Recommended navigation routes and shipping lanes',
      priority: 25
    },
    s101Compatible: true
  },

  {
    id: 'DEPARE',
    aliases: ['depth_area'],
    prettyName: 'Depth Area',
    symbolId: 's52_depare',
    featureType: 'depth',
    s52ColorScheme: {
      // Für Tiefen-Isolinien: verschiedene Blautöne nach Tiefe
      default: '#1a4d7a'
    },
    mapboxRenderingHints: {
      layerType: 'depth',
      minZoom: 6,
      description: 'Depth contours and zones',
      priority: 10 // Unter anderen Elementen
    },
    s101Compatible: true
  },

  {
    id: 'SOUNDG',
    aliases: ['sounding', 'depth_point'],
    prettyName: 'Sounding / Depth Point',
    symbolId: 's52_soundg',
    featureType: 'depth',
    s52ColorScheme: {
      default: '#1a4d7a'
    },
    mapboxRenderingHints: {
      layerType: 'poi', // Punkte, aber tiefen-bezogen
      minZoom: 9,
      labelField: 'depth', // Zeige Tiefenwert
      priority: 15
    },
    s101Compatible: true
  },

  {
    id: 'LNDARE',
    aliases: ['land'],
    prettyName: 'Land Area',
    symbolId: 's52_lndare',
    featureType: 'area',
    s52ColorScheme: {
      default: '#e8d8c8' // Beige/Ocker nach S-52
    },
    mapboxRenderingHints: {
      layerType: 'area',
      minZoom: 0,
      priority: 5 // Unter Wasser
    },
    s101Compatible: true
  },

  {
    id: 'BUAARE',
    aliases: ['built_up_area', 'urban'],
    prettyName: 'Built-Up Area',
    symbolId: 's52_buaare',
    featureType: 'area',
    s52ColorScheme: {
      default: '#d4c4b0' // Dunkleres Beige
    },
    mapboxRenderingHints: {
      layerType: 'area',
      minZoom: 8,
      priority: 6
    },
    s101Compatible: true
  }
]

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
