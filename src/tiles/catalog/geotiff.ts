import fs from 'fs/promises'
import path from 'path'
import { fromArrayBuffer } from 'geotiff'
import type { ChartProvider, GeotiffMetadata } from '../../types'

const toArrayBuffer = (buffer: Buffer): ArrayBuffer => {
  return Uint8Array.from(buffer).buffer
}

const parseBounds = (bounds: number[] | undefined): number[] | undefined => {
  if (!bounds || bounds.length !== 4) {
    return undefined
  }
  if (bounds.some((value) => !Number.isFinite(value))) {
    return undefined
  }
  return bounds
}

export const openGeotiffFile = async (
  filePath: string,
  filename: string
): Promise<ChartProvider | null> => {
  try {
    const raw = await fs.readFile(filePath)
    const tiff = await fromArrayBuffer(toArrayBuffer(raw))
    const image = await tiff.getImage()

    const meta: GeotiffMetadata = {
      width: image.getWidth(),
      height: image.getHeight(),
      samplesPerPixel: image.getSamplesPerPixel(),
      tileWidth: image.getTileWidth(),
      tileHeight: image.getTileHeight()
    }

    try {
      meta.bbox = parseBounds(image.getBoundingBox())
    } catch {
      // GeoTIFF without bbox is allowed; keep metadata minimal.
    }

    try {
      meta.origin = image.getOrigin()
      meta.resolution = image.getResolution()
    } catch {
      // Origin/resolution are optional.
    }

    try {
      const geoKeys = await image.getGeoKeys()
      if (geoKeys) {
        meta.geoKeys = geoKeys
      }
    } catch {
      // GeoKeys are optional.
    }

    const identifier = filename.replace(/\.(tif|tiff)$/i, '')
    const name = path.parse(filename).name

    return {
      _fileFormat: 'geotiff',
      _filePath: filePath,
      _geotiffMeta: meta,
      _flipY: false,
      identifier,
      name,
      description: '',
      bounds: meta.bbox,
      format: 'png',
      type: 'tilelayer',
      scale: 250000,
      v1: {
        tilemapUrl: `~tilePath~/${identifier}/{z}/{x}/{y}`,
        chartLayers: []
      },
      v2: {
        url: `~tilePath~/${identifier}/{z}/{x}/{y}`,
        layers: []
      }
    }
  } catch (err) {
    console.error(`Error loading GeoTIFF ${filePath}:`, (err as Error).message)
    return null
  }
}
