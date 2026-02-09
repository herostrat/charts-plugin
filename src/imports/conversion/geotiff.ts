import fs from 'fs/promises'
import path from 'path'
import { fromArrayBuffer } from 'geotiff'
import { PNG } from 'pngjs'
import jpeg from 'jpeg-js'
import { lonLatToTileXY, tileToBBox } from '../../tiles/tile-utils'

type GeotiffConversionOptions = {
  outputDir: string
  tileSize?: number
  minZoom?: number
  maxZoom?: number
  format?: 'png' | 'jpg'
  quality?: number
}

type GeotiffMbtilesOptions = {
  outputPath: string
  tileSize?: number
  minZoom?: number
  maxZoom?: number
  format?: 'png' | 'jpg'
  quality?: number
}

type GeotiffConversionResult = {
  outputDir: string
  format: 'png' | 'jpg'
  minZoom: number
  maxZoom: number
  bounds: [number, number, number, number]
}

type MbtilesInstance = {
  putTile: (
    z: number,
    x: number,
    y: number,
    tile: Buffer,
    cb: (err: Error | null) => void
  ) => void
  putInfo?: (
    info: Record<string, unknown>,
    cb: (err: Error | null) => void
  ) => void
  startWriting: (cb: (err: Error | null) => void) => void
  stopWriting: (cb: (err: Error | null) => void) => void
  close?: (cb: (err: Error | null) => void) => void
}

type MbtilesConstructor = new (
  file: string,
  callback: (err: Error | null, mbtiles: MbtilesInstance) => void
) => void

let MBTiles: MbtilesConstructor | null = null
let mbtilesLoadError: Error | null = null

const ensureMbtilesLoaded = async () => {
  if (MBTiles !== null || mbtilesLoadError) return
  try {
    const module = await import('@signalk/mbtiles')
    MBTiles = (module.default || module) as MbtilesConstructor
  } catch (err) {
    mbtilesLoadError = err as Error
    console.error(
      'Failed to load @signalk/mbtiles module:',
      (err as Error).message
    )
  }
}

const openMbtilesWriter = async (
  filePath: string
): Promise<MbtilesInstance> => {
  await ensureMbtilesLoaded()
  if (!MBTiles) {
    throw mbtilesLoadError || new Error('MBTiles module not loaded')
  }
  const MBTilesCtor = MBTiles
  return new Promise<MbtilesInstance>((resolve, reject) => {
    new MBTilesCtor(`${filePath}?mode=rwc`, (err, mbtiles) => {
      if (err) return reject(err)
      mbtiles.startWriting((err) => {
        if (err) return reject(err)
        resolve(mbtiles)
      })
    })
  })
}

const closeMbtilesWriter = async (mbtiles: MbtilesInstance) => {
  await new Promise<void>((resolve, reject) => {
    mbtiles.stopWriting((err) => {
      if (err) return reject(err)
      resolve()
    })
  })
  if (mbtiles.close) {
    await new Promise<void>((resolve, reject) => {
      mbtiles.close?.((err) => {
        if (err) return reject(err)
        resolve()
      })
    })
  }
}

const toArrayBuffer = (buffer: Buffer): ArrayBuffer => {
  return Uint8Array.from(buffer).buffer
}

const ensureDir = async (dir: string) => {
  await fs.mkdir(dir, { recursive: true })
}

const clamp = (value: number, min: number, max: number) => {
  return Math.min(Math.max(value, min), max)
}

const toPixel = (
  lon: number,
  lat: number,
  bounds: [number, number, number, number],
  width: number,
  height: number
): [number, number] => {
  const [minLon, minLat, maxLon, maxLat] = bounds
  const lonSpan = maxLon - minLon
  const latSpan = maxLat - minLat
  const x = ((lon - minLon) / lonSpan) * width
  const y = ((maxLat - lat) / latSpan) * height
  return [x, y]
}

const intersectBounds = (
  a: [number, number, number, number],
  b: [number, number, number, number]
) => {
  const minLon = Math.max(a[0], b[0])
  const minLat = Math.max(a[1], b[1])
  const maxLon = Math.min(a[2], b[2])
  const maxLat = Math.min(a[3], b[3])
  if (minLon >= maxLon || minLat >= maxLat) {
    return null
  }
  return [minLon, minLat, maxLon, maxLat] as [number, number, number, number]
}

export const convertGeotiffToTileDir = async (
  inputPath: string,
  options: GeotiffConversionOptions
): Promise<GeotiffConversionResult> => {
  const raw = await fs.readFile(inputPath)
  const tiff = await fromArrayBuffer(toArrayBuffer(raw))
  const image = await tiff.getImage()
  const bounds = image.getBoundingBox() as [number, number, number, number]
  if (!bounds || bounds.length !== 4) {
    throw new Error('GeoTIFF bounding box is missing')
  }

  const tileSize = options.tileSize ?? 256
  const minZoom = options.minZoom ?? 0
  const maxZoom = options.maxZoom ?? 10
  const format = options.format ?? 'png'
  const quality = options.quality ?? 85
  if (format !== 'png' && format !== 'jpg') {
    throw new Error('Unsupported output format')
  }

  const width = image.getWidth()
  const height = image.getHeight()
  await ensureDir(options.outputDir)

  for (let z = minZoom; z <= maxZoom; z += 1) {
    const [minX, minY] = lonLatToTileXY(bounds[0], bounds[3], z)
    const [maxX, maxY] = lonLatToTileXY(bounds[2], bounds[1], z)
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        const tileBounds = tileToBBox(x, y, z)
        const intersection = intersectBounds(
          bounds,
          tileBounds as [number, number, number, number]
        )
        if (!intersection) {
          continue
        }
        const [tileMinLon, tileMinLat, tileMaxLon, tileMaxLat] = tileBounds
        const [px1, py1] = toPixel(
          tileMinLon,
          tileMaxLat,
          bounds,
          width,
          height
        )
        const [px2, py2] = toPixel(
          tileMaxLon,
          tileMinLat,
          bounds,
          width,
          height
        )

        const left = clamp(Math.floor(px1), 0, width - 1)
        const right = clamp(Math.ceil(px2), 0, width)
        const top = clamp(Math.floor(py1), 0, height - 1)
        const bottom = clamp(Math.ceil(py2), 0, height)
        if (right <= left || bottom <= top) {
          continue
        }

        const rgbRaw = await image.readRGB({
          window: [left, top, right, bottom],
          width: tileSize,
          height: tileSize,
          resampleMethod: 'bilinear'
        })
        const rgb: Uint8Array = Array.isArray(rgbRaw)
          ? Uint8Array.from(rgbRaw)
          : (rgbRaw as Uint8Array)

        const rgba = Buffer.alloc(tileSize * tileSize * 4)
        for (let i = 0; i < tileSize * tileSize; i += 1) {
          const src = i * 3
          const dst = i * 4
          rgba[dst] = rgb[src]
          rgba[dst + 1] = rgb[src + 1]
          rgba[dst + 2] = rgb[src + 2]
          rgba[dst + 3] = 255
        }

        const buffer =
          format === 'png'
            ? PNG.sync.write({ data: rgba, width: tileSize, height: tileSize })
            : jpeg.encode(
                { data: rgba, width: tileSize, height: tileSize },
                quality
              ).data
        const tileDir = path.join(options.outputDir, `${z}`, `${x}`)
        await ensureDir(tileDir)
        const extension = format === 'jpg' ? 'jpg' : 'png'
        const tilePath = path.join(tileDir, `${y}.${extension}`)
        await fs.writeFile(tilePath, buffer)
      }
    }
  }

  const metadata = {
    bounds,
    format,
    minzoom: minZoom,
    maxzoom: maxZoom,
    type: 'tilelayer'
  }
  await fs.writeFile(
    path.join(options.outputDir, 'metadata.json'),
    JSON.stringify(metadata, null, 2)
  )

  return {
    outputDir: options.outputDir,
    format,
    minZoom,
    maxZoom,
    bounds
  }
}

export const convertGeotiffToMbtiles = async (
  inputPath: string,
  options: GeotiffMbtilesOptions
) => {
  const raw = await fs.readFile(inputPath)
  const tiff = await fromArrayBuffer(toArrayBuffer(raw))
  const image = await tiff.getImage()
  const bounds = image.getBoundingBox() as [number, number, number, number]
  if (!bounds || bounds.length !== 4) {
    throw new Error('GeoTIFF bounding box is missing')
  }

  const tileSize = options.tileSize ?? 256
  const minZoom = options.minZoom ?? 0
  const maxZoom = options.maxZoom ?? 10
  const format = options.format ?? 'png'
  const quality = options.quality ?? 85
  if (format !== 'png' && format !== 'jpg') {
    throw new Error('Unsupported output format')
  }

  const width = image.getWidth()
  const height = image.getHeight()
  const mbtiles = await openMbtilesWriter(options.outputPath)

  try {
    for (let z = minZoom; z <= maxZoom; z += 1) {
      const [minX, minY] = lonLatToTileXY(bounds[0], bounds[3], z)
      const [maxX, maxY] = lonLatToTileXY(bounds[2], bounds[1], z)
      for (let x = minX; x <= maxX; x += 1) {
        for (let y = minY; y <= maxY; y += 1) {
          const tileBounds = tileToBBox(x, y, z)
          const intersection = intersectBounds(
            bounds,
            tileBounds as [number, number, number, number]
          )
          if (!intersection) {
            continue
          }
          const [tileMinLon, tileMinLat, tileMaxLon, tileMaxLat] = tileBounds
          const [px1, py1] = toPixel(
            tileMinLon,
            tileMaxLat,
            bounds,
            width,
            height
          )
          const [px2, py2] = toPixel(
            tileMaxLon,
            tileMinLat,
            bounds,
            width,
            height
          )

          const left = clamp(Math.floor(px1), 0, width - 1)
          const right = clamp(Math.ceil(px2), 0, width)
          const top = clamp(Math.floor(py1), 0, height - 1)
          const bottom = clamp(Math.ceil(py2), 0, height)
          if (right <= left || bottom <= top) {
            continue
          }

          const rgbRaw = await image.readRGB({
            window: [left, top, right, bottom],
            width: tileSize,
            height: tileSize,
            resampleMethod: 'bilinear'
          })
          const rgb: Uint8Array = Array.isArray(rgbRaw)
            ? Uint8Array.from(rgbRaw)
            : (rgbRaw as Uint8Array)

          const rgba = Buffer.alloc(tileSize * tileSize * 4)
          for (let i = 0; i < tileSize * tileSize; i += 1) {
            const src = i * 3
            const dst = i * 4
            rgba[dst] = rgb[src]
            rgba[dst + 1] = rgb[src + 1]
            rgba[dst + 2] = rgb[src + 2]
            rgba[dst + 3] = 255
          }

          const raw =
            format === 'png'
              ? PNG.sync.write({
                  data: rgba,
                  width: tileSize,
                  height: tileSize
                })
              : jpeg.encode(
                  { data: rgba, width: tileSize, height: tileSize },
                  quality
                ).data
          const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw)

          await new Promise<void>((resolve, reject) => {
            mbtiles.putTile(z, x, y, buffer, (err) => {
              if (err) return reject(err)
              resolve()
            })
          })
        }
      }
    }

    const info = {
      bounds,
      format,
      minzoom: minZoom,
      maxzoom: maxZoom,
      type: 'tilelayer'
    }
    if (mbtiles.putInfo) {
      await new Promise<void>((resolve, reject) => {
        mbtiles.putInfo?.(info, (err) => {
          if (err) return reject(err)
          resolve()
        })
      })
    }
  } finally {
    await closeMbtilesWriter(mbtiles)
  }

  return {
    outputPath: options.outputPath,
    format,
    minZoom,
    maxZoom,
    bounds
  }
}
