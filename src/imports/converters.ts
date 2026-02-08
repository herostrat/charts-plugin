import type { ImportConversionOptions, ImportFileType } from './types'

export type ConverterId =
  | 'geotiff-to-pmtiles-png'
  | 'geotiff-to-pmtiles-jpg'
  | 's57-to-pmtiles-mvt'

export type ConverterDefinition = {
  id: ConverterId
  source: ImportFileType
  target: ImportConversionOptions
}

const CONVERTERS: ConverterDefinition[] = [
  {
    id: 'geotiff-to-pmtiles-png',
    source: 'geotiff',
    target: { target: 'pmtiles', format: 'png' }
  },
  {
    id: 'geotiff-to-pmtiles-jpg',
    source: 'geotiff',
    target: { target: 'pmtiles', format: 'jpg' }
  },
  {
    id: 's57-to-pmtiles-mvt',
    source: 's57',
    target: { target: 'pmtiles', vectorFormat: 'mvt' }
  }
]

export const listConverters = () => [...CONVERTERS]

export const getConvertersForType = (source: ImportFileType) => {
  return CONVERTERS.filter((converter) => converter.source === source)
}

export const isConversionSupported = (
  source: ImportFileType,
  target?: ImportConversionOptions
) => {
  if (!target) {
    return false
  }
  return CONVERTERS.some(
    (converter) =>
      converter.source === source &&
      converter.target.target === target.target &&
      (!target.format || converter.target.format === target.format) &&
      (!target.vectorFormat ||
        converter.target.vectorFormat === target.vectorFormat)
  )
}
