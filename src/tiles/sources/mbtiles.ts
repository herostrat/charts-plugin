import { isAllowedTileFormat } from '../format'
import type { Response } from 'express'
import type { OutgoingHttpHeaders } from 'http'
import type { ChartProvider } from '../../types'

import { DEFAULT_CACHE_HEADERS } from '../headers'

export const serveTileFromMbtiles = (
  res: Response,
  provider: ChartProvider,
  z: number,
  x: number,
  y: number
) => {
  if (!isAllowedTileFormat(provider.format)) {
    res.status(404).send('Tile not found')
    return
  }
  const handle = provider._mbtilesHandle as
    | {
        getTile: (
          z: number,
          x: number,
          y: number,
          cb: (err: Error, tile: Buffer, headers: OutgoingHttpHeaders) => void
        ) => void
      }
    | undefined
  if (!handle?.getTile) {
    res.status(500).send('Tile not found')
    return
  }
  handle.getTile(
    z,
    x,
    y,
    (err: Error, tile: Buffer, headers: OutgoingHttpHeaders) => {
      if (err && err.message && err.message === 'Tile does not exist') {
        res.sendStatus(404)
      } else if (err) {
        console.error(
          `Error fetching tile ${provider.identifier}/${z}/${x}/${y}:`,
          err
        )
        res.sendStatus(500)
      } else {
        if (headers) {
          headers['Cache-Control'] = DEFAULT_CACHE_HEADERS['Cache-Control']
          res.writeHead(200, headers)
        } else {
          res.set('Cache-Control', DEFAULT_CACHE_HEADERS['Cache-Control'])
          res.status(200)
        }
        res.end(tile)
      }
    }
  )
}
