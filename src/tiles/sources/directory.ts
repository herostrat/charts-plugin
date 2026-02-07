import fs from 'fs'
import path from 'path'
import type { Response } from 'express'
import type { ChartProvider } from '../../types'
import { isAllowedTileFormat, resolveTileContentType } from '../format'
import { DEFAULT_CACHE_HEADERS } from '../headers'

export const serveTileFromDirectory = (
  res: Response,
  provider: ChartProvider,
  z: number,
  x: number,
  y: number
) => {
  const { format, _flipY, _filePath } = provider
  const normalizedFormat = format ? format.toLowerCase() : ''
  if (!isAllowedTileFormat(normalizedFormat)) {
    res.status(404).send('Tile not found')
    return
  }
  const flippedY = Math.pow(2, z) - 1 - y
  const tileFile = `${z}/${x}/${_flipY ? flippedY : y}.${normalizedFormat}`
  const file = _filePath ? path.resolve(_filePath, tileFile) : ''
  try {
    if (!file) {
      res.status(404).send('Tile not found')
      return
    }
    const stats = fs.statSync(file)
    if (!stats.isFile()) {
      res.status(404).send('Tile not found')
      return
    }
    fs.accessSync(file, fs.constants.R_OK)
  } catch {
    res.status(404).send('Tile not found')
    return
  }
  // Setze Content-Type explizit
  res.type(resolveTileContentType(normalizedFormat))
  res.sendFile(file, { headers: DEFAULT_CACHE_HEADERS })
}
