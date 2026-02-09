import path from 'path'
import type { ImportConversionOptions, ImportFileType } from './types'
import { convertGeotiffToMbtiles } from './conversion/geotiff'
import { convertS57ToPmtiles } from './conversion/s57'
import { runPmtilesConvert } from '../utils/pmtiles-cli'

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
  const stagingDir = options.outputDir
  const outputPath = path.join(stagingDir, `${baseName}.pmtiles`)
  const mbtilesPath = path.join(stagingDir, `${baseName}.mbtiles`)

  if (
    options.detectedType === 'geotiff' &&
    options.target.target === 'pmtiles'
  ) {
    await convertGeotiffToMbtiles(inputPath, {
      outputPath: mbtilesPath,
      maxZoom: options.target.maxZoom,
      format: options.target.format
    })
    await runPmtilesConvert(mbtilesPath, outputPath)
    return {
      stagingDir,
      outputPath
    } as ConversionOutcome
  }

  if (
    options.detectedType === 's57' &&
    options.target.target === 'pmtiles' &&
    options.target.vectorFormat === 'mvt'
  ) {
    const result = await convertS57ToPmtiles(inputPath, {
      outputDir: stagingDir,
      layerName: 's57'
    })
    return {
      stagingDir,
      outputPath: result.outputPath
    } as ConversionOutcome
  }

  throw new Error('Conversion not supported for this file type')
}
