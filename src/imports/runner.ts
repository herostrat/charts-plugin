import path from 'path'
import type { ImportConversionOptions, ImportFileType } from './types'
import { convertGeotiffToTileDir } from './conversion/geotiff'

export type ConversionOutcome = {
  stagingDir: string
  outputPath: string
}

export const runConversion = async (
  inputPath: string,
  options: {
    detectedType: ImportFileType
    outputDir: string
    target: ImportConversionOptions
  }
) => {
  const baseName = path.parse(inputPath).name
  const outputPath = path.join(options.outputDir, `${baseName}.pmtiles`)
  const stagingDir = path.join(options.outputDir, `${baseName}.staging`)

  if (
    options.detectedType === 'geotiff' &&
    options.target.target === 'pmtiles'
  ) {
    await convertGeotiffToTileDir(inputPath, {
      outputDir: stagingDir,
      maxZoom: options.target.maxZoom,
      format: options.target.format
    })
    // TODO: package tiles into PMTiles archive at outputPath.
    return {
      stagingDir,
      outputPath
    } as ConversionOutcome
  }

  throw new Error('Conversion not supported for this file type')
}
