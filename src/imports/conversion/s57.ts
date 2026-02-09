import fs from 'fs/promises'
import path from 'path'
import { spawn } from 'child_process'
import { runPmtilesConvert } from '../../utils/pmtiles-cli'

type S57ConversionOptions = {
  outputDir: string
  layerName?: string
}

const runCommand = (
  command: string,
  args: string[],
  cwd?: string
): Promise<void> => {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { cwd })
    let stderr = ''
    proc.stderr.on('data', (data) => {
      stderr += data.toString()
    })
    proc.on('error', (err) => {
      reject(err)
    })
    proc.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(
        new Error(
          `${command} failed (${code ?? 'unknown'}): ${stderr.trim() || 'unknown error'}`
        )
      )
    })
  })
}

export const convertS57ToPmtiles = async (
  inputPath: string,
  options: S57ConversionOptions
) => {
  const baseName = path.parse(inputPath).name
  const geojsonPath = path.join(options.outputDir, `${baseName}.geojson`)
  const mbtilesPath = path.join(options.outputDir, `${baseName}.mbtiles`)
  const pmtilesPath = path.join(options.outputDir, `${baseName}.pmtiles`)
  const layerName = options.layerName || 's57'

  await runCommand('ogr2ogr', ['-f', 'GeoJSON', geojsonPath, inputPath])
  await runCommand('tippecanoe', [
    '-o',
    mbtilesPath,
    '--force',
    '-l',
    layerName,
    geojsonPath
  ])

  await runPmtilesConvert(mbtilesPath, pmtilesPath)

  await fs.rm(geojsonPath, { force: true })
  await fs.rm(mbtilesPath, { force: true })

  return {
    outputPath: pmtilesPath
  }
}
