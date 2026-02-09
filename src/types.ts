import type { PMTiles } from 'pmtiles'

export type MapSourceType =
  | 'tilelayer'
  | 'S-57'
  | 'WMS'
  | 'WMTS'
  | 'mapstyleJSON'
  | 'tileJSON'

export type GeotiffMetadata = {
  width?: number
  height?: number
  samplesPerPixel?: number
  tileWidth?: number
  tileHeight?: number
  bbox?: number[]
  origin?: number[]
  resolution?: number[]
  geoKeys?: Record<string, unknown>
}

export interface ChartProvider {
  _fileFormat?: 'mbtiles' | 'directory' | 'pmtiles' | 'geotiff'
  _filePath: string
  _mbtilesHandle?: unknown
  _pmtilesHandle?: PMTiles
  _geotiffMeta?: GeotiffMetadata
  _flipY?: boolean
  identifier: string
  name: string
  description: string
  type: MapSourceType
  scale: number
  v1?: {
    tilemapUrl: string
    chartLayers?: string[]
  }
  v2?: {
    url: string
    layers?: string[]
  }
  bounds?: number[]
  minzoom?: number
  maxzoom?: number
  format?: string
  style?: string
  layers?: string[]
  proxy?: boolean
  sidecar?: boolean
  sidecarUrl?: string
  remoteUrl?: string
  headers?: { [key: string]: string }
}

export interface OnlineChartProvider {
  id?: string
  name: string
  description: string
  minzoom: number
  maxzoom: number
  serverType?: MapSourceType
  format: 'png' | 'jpg'
  url: string
  proxy: boolean
  headers?: string[]
  style?: string
  layers?: string[]
  bounds?: number[]
}
