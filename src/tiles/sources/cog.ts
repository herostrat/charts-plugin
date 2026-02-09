import type { Response } from 'express'
import { fromUrl } from 'geotiff'
import type { ChartProvider } from '../../types'
import { resolveTileContentType } from '../format'
import { DEFAULT_CACHE_HEADERS } from '../headers'
import { MbtilesTileCache } from '../../cache/tile-cache-mbtiles'
import type { TileKey } from '../../cache/tile-cache'
import { tileToBBox } from '../tile-utils'

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

export const serveTileFromCog = async (
  res: Response,
  cachePath: string,
  provider: ChartProvider,
  z: number,
  x: number,
  y: number
) => {
  if (!provider.remoteUrl) {
    res.status(500).send('COG remote URL not available')
    return
  }

  const cache = new MbtilesTileCache(cachePath, provider.identifier)
  const key: TileKey = {
    sourceId: provider.identifier,
    z,
    x,
    y,
    format: provider.format || 'png'
  }
  const cached = await cache.get(key)
  if (cached.hit && cached.tile?.data) {
    res.set('Content-Type', resolveTileContentType(provider.format))
    res.set('Cache-Control', DEFAULT_CACHE_HEADERS['Cache-Control'])
    res.send(cached.tile.data)
    return
  }

  try {
    const tiff = await fromUrl(provider.remoteUrl)
    const image = await tiff.getImage()
    const bounds = image.getBoundingBox() as [number, number, number, number]
    if (!bounds || bounds.length !== 4) {
      res.status(500).send('COG bounds unavailable')
      return
    }

    const tileBounds = tileToBBox(x, y, z)
    const [tileMinLon, tileMinLat, tileMaxLon, tileMaxLat] = tileBounds
    const [px1, py1] = toPixel(
      tileMinLon,
      tileMaxLat,
      bounds,
      image.getWidth(),
      image.getHeight()
    )
    const [px2, py2] = toPixel(
      tileMaxLon,
      tileMinLat,
      bounds,
      image.getWidth(),
      image.getHeight()
    )

    const left = clamp(Math.floor(px1), 0, image.getWidth() - 1)
    const right = clamp(Math.ceil(px2), 0, image.getWidth())
    const top = clamp(Math.floor(py1), 0, image.getHeight() - 1)
    const bottom = clamp(Math.ceil(py2), 0, image.getHeight())
    if (right <= left || bottom <= top) {
      res.sendStatus(404)
      return
    }

    const rgbRaw = await image.readRGB({
      window: [left, top, right, bottom],
      width: 256,
      height: 256,
      resampleMethod: 'bilinear'
    })
    const rgb: Uint8Array = Array.isArray(rgbRaw)
      ? Uint8Array.from(rgbRaw)
      : (rgbRaw as Uint8Array)

    const rgba = Buffer.alloc(256 * 256 * 4)
    for (let i = 0; i < 256 * 256; i += 1) {
      const src = i * 3
      const dst = i * 4
      rgba[dst] = rgb[src]
      rgba[dst + 1] = rgb[src + 1]
      rgba[dst + 2] = rgb[src + 2]
      rgba[dst + 3] = 255
    }

    const { PNG } = await import('pngjs')
    const raw = PNG.sync.write({
      data: rgba,
      width: 256,
      height: 256
    })
    const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw)

    await cache.set(key, { data: buffer })
    res.set('Content-Type', resolveTileContentType('png'))
    res.set('Cache-Control', DEFAULT_CACHE_HEADERS['Cache-Control'])
    res.send(buffer)
  } catch (err) {
    console.error('COG fetch failed:', err)
    res.sendStatus(502)
  }
}
