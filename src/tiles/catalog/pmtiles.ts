import fs from 'fs'
import {
  PMTiles,
  TileType,
  tileTypeExt,
  type RangeResponse,
  type Source
} from 'pmtiles'
import type { ChartProvider } from '../../types'

class NodeFileSource implements Source {
  private filePath: string
  constructor(filePath: string) {
    this.filePath = filePath
  }

  getKey(): string {
    return this.filePath
  }

  async getBytes(
    offset: number,
    length: number,
    signal?: AbortSignal
  ): Promise<RangeResponse> {
    if (signal?.aborted) {
      throw new Error('AbortError')
    }
    const handle = await fs.promises.open(this.filePath, 'r')
    try {
      const buffer = Buffer.alloc(length)
      const { bytesRead } = await handle.read(buffer, 0, length, offset)
      const view = buffer.subarray(0, bytesRead)
      return {
        data: view.buffer.slice(
          view.byteOffset,
          view.byteOffset + view.byteLength
        )
      }
    } finally {
      await handle.close()
    }
  }
}

const tileTypeToFormat = (tileType: TileType): string | undefined => {
  const ext = tileTypeExt(tileType)
  if (!ext) {
    return undefined
  }
  const normalized = ext.startsWith('.') ? ext.slice(1) : ext
  return normalized === 'mvt' ? 'mvt' : normalized
}

const parseLayers = (metaData: unknown): string[] => {
  if (!metaData || typeof metaData !== 'object') {
    return []
  }
  const candidate = (metaData as { vector_layers?: Array<{ id: string }> })
    .vector_layers
  if (!Array.isArray(candidate)) {
    return []
  }
  return candidate
    .map((entry) => entry?.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
}

const parseScale = (metaData: unknown): number => {
  if (!metaData || typeof metaData !== 'object') {
    return 250000
  }
  const raw = (metaData as { scale?: unknown }).scale
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw
  }
  if (typeof raw === 'string') {
    const parsed = parseInt(raw, 10)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return 250000
}

const parseName = (metaData: unknown, fallback: string): string => {
  if (!metaData || typeof metaData !== 'object') {
    return fallback
  }
  const raw = (metaData as { name?: unknown }).name
  return typeof raw === 'string' && raw.length > 0 ? raw : fallback
}

const parseDescription = (metaData: unknown): string => {
  if (!metaData || typeof metaData !== 'object') {
    return ''
  }
  const raw = (metaData as { description?: unknown }).description
  return typeof raw === 'string' ? raw : ''
}

export const openPmtilesFile = async (
  filePath: string,
  filename: string
): Promise<ChartProvider | null> => {
  try {
    const identifier = filename.replace(/\.pmtiles$/i, '')
    const source = new NodeFileSource(filePath)
    const handle = new PMTiles(source)
    const header = await handle.getHeader()
    const metaData = await handle.getMetadata().catch(() => ({}))
    const format = tileTypeToFormat(header.tileType)
    const layers = parseLayers(metaData)

    // Defensive checks for header values
    const bounds = [header.minLon, header.minLat, header.maxLon, header.maxLat]
    if (bounds.some((v) => typeof v !== 'number' || isNaN(v))) {
      return null
    }
    if (
      typeof header.minZoom !== 'number' ||
      typeof header.maxZoom !== 'number' ||
      isNaN(header.minZoom) ||
      isNaN(header.maxZoom)
    ) {
      return null
    }
    if (typeof format !== 'string' || !format.length) {
      return null
    }

    return {
      _fileFormat: 'pmtiles',
      _filePath: filePath,
      _pmtilesHandle: handle,
      _flipY: false,
      identifier,
      name: parseName(metaData, identifier),
      description: parseDescription(metaData),
      bounds,
      minzoom: header.minZoom,
      maxzoom: header.maxZoom,
      format,
      type: 'tilelayer',
      scale: parseScale(metaData),
      v1: {
        tilemapUrl: `~tilePath~/${identifier}/{z}/{x}/{y}`,
        chartLayers: layers
      },
      v2: {
        url: `~tilePath~/${identifier}/{z}/{x}/{y}`,
        layers
      }
    }
  } catch (err) {
    console.error(`Error loading PMTiles ${filePath}:`, (err as Error).message)
    return null
  }
}
