import path from 'path'
import * as xml2js from 'xml2js'
import fs from 'fs/promises'
import _ from 'lodash'
import type { ChartProvider } from '../../types'

/**
 * Loads chart metadata from a directory (tilemapresource.xml or metadata.json)
 */
export async function loadDirectoryChartMetadata(
  file: string,
  identifier: string
): Promise<ChartProvider | null | undefined> {
  const tilemapResource = path.join(file, 'tilemapresource.xml')
  const metadataJson = path.join(file, 'metadata.json')

  try {
    await fs.stat(tilemapResource)
    return await parseTilemapResource(tilemapResource, identifier, file)
  } catch {
    try {
      await fs.stat(metadataJson)
      return await parseMetadataJson(metadataJson, identifier, file)
    } catch {
      return null
    }
  }
}

export const openDirectoryChart = loadDirectoryChartMetadata

const parseTilemapResource = async (
  tilemapResource: string,
  identifier: string,
  file: string
): Promise<ChartProvider | null> => {
  try {
    const data = await fs.readFile(tilemapResource)
    const parsed = await xml2js.parseStringPromise(data)
    const result = parsed.TileMap
    if (!result) {
      console.warn('parseTilemapResource: No TileMap found in', tilemapResource)
      return null
    }
    const name = _.get(result, 'Title.0')
    const format = _.get(result, 'TileFormat.0.$.extension')
    const scale = _.get(result, 'Metadata.0.$.scale')
    const bbox = _.get(result, 'BoundingBox.0.$')
    const zoomLevels = _.map(_.get(result, 'TileSets.0.TileSet') || [], (set) =>
      parseInt(_.get(set, '$.href'), 10)
    )
    if (!format || !bbox) {
      console.warn(
        'parseTilemapResource: Missing format or bbox in',
        tilemapResource
      )
      return null
    }
    const chart: ChartProvider = {
      _flipY: true,
      name,
      description: name,
      bounds: [
        parseFloat(bbox.minx),
        parseFloat(bbox.miny),
        parseFloat(bbox.maxx),
        parseFloat(bbox.maxy)
      ],
      minzoom: !_.isEmpty(zoomLevels) ? _.min(zoomLevels) : undefined,
      maxzoom: !_.isEmpty(zoomLevels) ? _.max(zoomLevels) : undefined,
      format,
      type: 'tilelayer',
      scale: parseInt(scale, 10) || 250000,
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
    console.log('parseTilemapResource: Chart loaded', chart)
    return chart
  } catch (e) {
    console.warn('parseTilemapResource: Exception for', tilemapResource, e)
    return null
  }
}

async function parseMetadataJson(
  metadataJson: string,
  identifier: string,
  file: string
): Promise<ChartProvider | null> {
  try {
    const txt = await fs.readFile(metadataJson, { encoding: 'utf8' })
    const metadata = JSON.parse(txt)

    const parseBounds = (
      bounds: string | number[] | undefined
    ): number[] | undefined => {
      if (_.isString(bounds)) {
        return bounds.split(',').map((b) => parseFloat(_.trim(b)))
      }
      if (_.isArray(bounds) && bounds.length === 4) {
        return bounds.map((b) => (typeof b === 'string' ? parseFloat(b) : b))
      }
      return undefined
    }

    const parseIntSafe = (
      value: string | number | undefined
    ): number | undefined => {
      if (typeof value === 'number') return value
      if (typeof value === 'string') {
        const parsed = parseInt(value, 10)
        return Number.isFinite(parsed) ? parsed : undefined
      }
      return undefined
    }

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
      type: metadata.type || 'tilelayer',
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
  } catch {
    return null
  }
}
