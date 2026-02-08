import fs from 'fs/promises'
import path from 'path'
import _ from 'lodash'
import type { ChartProvider } from '../types'

export type ChartsMetadataV1 = {
  schemaVersion: 1
  id?: string
  name?: string
  description?: string
  bounds?: number[] | string
  minzoom?: number | string
  maxzoom?: number | string
  format: string
  type?: string
  scale?: number | string
  updatedAt?: string
  detectedType?: string
  source?: {
    path?: string
    url?: string
    streamUrl?: string
  }
  conversion?: {
    target?: string
    output?: string
    stagingDir?: string
  }
}

export type ChartsMetadata = ChartsMetadataV1

const parseBounds = (bounds: string | number[] | undefined) => {
  if (_.isString(bounds)) {
    return bounds.split(',').map((b) => parseFloat(_.trim(b)))
  }
  if (_.isArray(bounds) && bounds.length === 4) {
    return bounds.map((b) => (typeof b === 'string' ? parseFloat(b) : b))
  }
  return undefined
}

const parseIntSafe = (value: string | number | undefined) => {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

export const readChartsMetadata = async (
  metadataJsonPath: string
): Promise<ChartsMetadata | null> => {
  try {
    const txt = await fs.readFile(metadataJsonPath, { encoding: 'utf8' })
    return JSON.parse(txt) as ChartsMetadata
  } catch {
    return null
  }
}

export const parseChartsMetadata = (
  metadata: ChartsMetadata,
  identifier: string,
  file: string
): ChartProvider | null => {
  const bounds = parseBounds(metadata.bounds)
  const format = metadata.format

  if (!format || !bounds) {
    return null
  }

  return {
    _flipY: false,
    name: metadata.name || metadata.id || '',
    description: metadata.description || '',
    bounds,
    minzoom: parseIntSafe(metadata.minzoom),
    maxzoom: parseIntSafe(metadata.maxzoom),
    format,
    type: 'tilelayer',
    scale: parseIntSafe(metadata.scale) || 250000,
    identifier,
    _filePath: file,
    _fileFormat: 'directory',
    v1: {
      tilemapUrl: `~tilePath~/${identifier}/{z}/{x}/{y}`,
      chartLayers: []
    },
    v2: {
      url: `~tilePath~/${identifier}/{z}/{x}/{y}`,
      layers: []
    }
  }
}

export const applyMetadataOverrides = (
  provider: ChartProvider,
  metadata: ChartsMetadata
) => {
  const bounds = parseBounds(metadata.bounds) ?? provider.bounds
  const minzoom = parseIntSafe(metadata.minzoom) ?? provider.minzoom
  const maxzoom = parseIntSafe(metadata.maxzoom) ?? provider.maxzoom
  const scale = parseIntSafe(metadata.scale) ?? provider.scale
  const format = metadata.format || provider.format

  const type =
    metadata.type === 'tilelayer' ||
    metadata.type === 'S-57' ||
    metadata.type === 'WMS' ||
    metadata.type === 'WMTS' ||
    metadata.type === 'mapstyleJSON' ||
    metadata.type === 'tileJSON'
      ? metadata.type
      : provider.type

  return {
    ...provider,
    name: metadata.name || metadata.id || provider.name,
    description: metadata.description || provider.description,
    bounds,
    minzoom,
    maxzoom,
    scale,
    format: format || provider.format,
    type
  }
}

export const readChartsMetadataFile = async (
  metadataJsonPath: string,
  identifier: string,
  file: string
): Promise<ChartProvider | null> => {
  const metadata = await readChartsMetadata(metadataJsonPath)
  if (!metadata) {
    return null
  }
  return parseChartsMetadata(metadata, identifier, file)
}

export const writeChartsMetadataFile = async (
  dirPath: string,
  metadata: ChartsMetadata
) => {
  const payload = JSON.stringify(metadata, null, 2)
  const target = path.join(dirPath, 'metadata.json')
  await fs.writeFile(target, payload)
  return target
}
