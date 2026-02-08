export type ImportFileType =
  | 'geotiff'
  | 's57'
  | 'mbtiles'
  | 'pmtiles'
  | 'folder'
  | 'directory'
  | 'unknown'

export type ImportStreamType = 'wms' | 'wmts' | 'cog'

export type ImportJobState =
  | 'QUEUED'
  | 'RUNNING'
  | 'STAGED'
  | 'FAILED'
  | 'COMPLETED'
  | 'CANCELED'

export type ImportConversionTarget = 'pmtiles'

export type ImportConversionOptions = {
  target: ImportConversionTarget
  format?: 'png' | 'jpg'
  vectorFormat?: 'mvt'
  maxZoom?: number
}

export type ImportItemMetadata = {
  bounds?: [number, number, number, number]
  minZoom?: number
  maxZoom?: number
  updatedAt?: string
  format?: string
  type?: ImportFileType
  description?: string
}

export type ImportItem = {
  id: string
  filename: string
  detectedType: ImportFileType
  sizeBytes?: number
  state: ImportJobState
  convert?: ImportConversionOptions
  stagingDir?: string
  sourcePath?: string
  sourceUrl?: string
  streamUrl?: string
  streamType?: ImportStreamType
  metadata?: ImportItemMetadata
  metadataOverrides?: ImportItemMetadata
  bounds?: [number, number, number, number]
  output?: string
  errors: string[]
}

export type ImportJob = {
  id: number
  createdAt: string
  updatedAt: string
  state: ImportJobState
  items: ImportItem[]
  errors: string[]
}
