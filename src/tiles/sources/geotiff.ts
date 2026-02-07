import type { Response } from 'express'
import type { ChartProvider } from '../../types'

export const serveTileFromGeotiff = (
  res: Response,
  provider: ChartProvider,
  z: number,
  x: number,
  y: number
) => {
  void provider
  void z
  void x
  void y
  res.status(501).send('GeoTIFF support not implemented')
}
