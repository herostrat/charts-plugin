import fs from 'fs/promises'
import path from 'path'
import _ from 'lodash'
import type { ChartProvider } from '../types'
import { isAllowedTileFormat, isVectorFormat } from '../tiles/format'

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

type ValidationResult = {
  errors: string[]
  warnings: string[]
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const validateBounds = (bounds?: number[]) => {
  if (!Array.isArray(bounds) || bounds.length !== 4) {
    return { error: 'Missing or invalid bounds.' }
  }
  const [minLon, minLat, maxLon, maxLat] = bounds
  if (![minLon, minLat, maxLon, maxLat].every(isFiniteNumber)) {
    return { error: 'Bounds contain non-numeric values.' }
  }
  if (minLon >= maxLon || minLat >= maxLat) {
    return { error: 'Bounds must be ordered [minLon, minLat, maxLon, maxLat].' }
  }
  if (Math.abs(minLon) > 180 || Math.abs(maxLon) > 180) {
    return { warning: 'Longitude bounds are outside [-180, 180].' }
  }
  if (Math.abs(minLat) > 90 || Math.abs(maxLat) > 90) {
    return { warning: 'Latitude bounds are outside [-90, 90].' }
  }
  return {}
}

const validateZoomRange = (minzoom?: number, maxzoom?: number) => {
  const result: ValidationResult = { errors: [], warnings: [] }
  if (isFiniteNumber(minzoom) && isFiniteNumber(maxzoom)) {
    if (minzoom > maxzoom) {
      result.errors.push('minzoom is greater than maxzoom.')
    }
  } else if (!isFiniteNumber(minzoom) || !isFiniteNumber(maxzoom)) {
    result.warnings.push('minzoom/maxzoom are missing or invalid.')
  }
  if (isFiniteNumber(minzoom) && minzoom < 0) {
    result.warnings.push('minzoom is below 0.')
  }
  if (isFiniteNumber(maxzoom) && maxzoom > 24) {
    result.warnings.push('maxzoom is above 24.')
  }
  return result
}

const allowedTypes = new Set([
  'tilelayer',
  'S-57',
  'WMS',
  'WMTS',
  'mapstyleJSON',
  'tileJSON'
])

const validateFormat = (format?: string) => {
  if (!format) {
    return { error: 'Missing format.' }
  }
  if (!isAllowedTileFormat(format)) {
    return { error: `Unsupported format: ${format}.` }
  }
  return {}
}

const validateType = (type?: string) => {
  if (!type) {
    return {}
  }
  if (!allowedTypes.has(type)) {
    return { warning: `Unexpected provider type: ${type}.` }
  }
  return {}
}

const buildResult = (...parts: Array<Partial<ValidationResult>>) => {
  return parts.reduce<ValidationResult>(
    (acc, part) => {
      if (part.errors) acc.errors.push(...part.errors)
      if (part.warnings) acc.warnings.push(...part.warnings)
      return acc
    },
    { errors: [], warnings: [] }
  )
}

export const validateChartProvider = (
  provider: ChartProvider
): ValidationResult => {
  const result: ValidationResult = { errors: [], warnings: [] }
  const boundsResult = validateBounds(provider.bounds)
  if (boundsResult.error) result.errors.push(boundsResult.error)
  if (boundsResult.warning) result.warnings.push(boundsResult.warning)

  const zoomResult = validateZoomRange(provider.minzoom, provider.maxzoom)
  result.errors.push(...zoomResult.errors)
  result.warnings.push(...zoomResult.warnings)

  const formatResult = validateFormat(provider.format)
  if (formatResult.error) result.errors.push(formatResult.error)

  const typeResult = validateType(provider.type)
  if (typeResult.warning) result.warnings.push(typeResult.warning)

  if (provider.format && isVectorFormat(provider.format)) {
    const layers = provider.v2?.layers || provider.v1?.chartLayers || []
    if (!layers.length) {
      result.warnings.push('Vector provider has no layer metadata.')
    }
  }

  return result
}

export const validateChartMetadata = (meta: {
  bounds?: [number, number, number, number]
  minzoom?: number
  maxzoom?: number
  format?: string
  type?: string
}): ValidationResult => {
  const boundsResult = validateBounds(meta.bounds)
  const zoomResult = validateZoomRange(meta.minzoom, meta.maxzoom)
  const formatResult = validateFormat(meta.format)
  const typeResult = validateType(meta.type)

  return buildResult(
    boundsResult.error ? { errors: [boundsResult.error] } : {},
    boundsResult.warning ? { warnings: [boundsResult.warning] } : {},
    zoomResult,
    formatResult.error ? { errors: [formatResult.error] } : {},
    typeResult.warning ? { warnings: [typeResult.warning] } : {}
  )
}
