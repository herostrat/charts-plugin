import path from 'path'
import { promises as fs } from 'fs'
import type { ChartProvider } from '../../types'
import { openPmtilesFile } from './pmtiles'
import {
  ensureMbtilesLoaded,
  getMbtilesLoadError,
  openMbtilesFile
} from './mbtiles'
import { openDirectoryChart } from './directory'

export const findCharts = (chartBaseDir: string) => {
  return ensureMbtilesLoaded()
    .then(() => fs.readdir(chartBaseDir, { withFileTypes: true }))
    .then(async (files) => {
      const results: Array<ChartProvider | null | undefined> = []
      const mbtilesError = getMbtilesLoadError()
      console.log(
        'findCharts: Scanning',
        chartBaseDir,
        'files:',
        files.map((f) => f.name)
      )
      for (const file of files) {
        const isMbtilesFile = file.name.match(/\.mbtiles$/i)
        const isPmtilesFile = file.name.match(/\.pmtiles$/i)
        const filePath = path.resolve(chartBaseDir, file.name)
        const isDirectory = file.isDirectory()
        if (isMbtilesFile) {
          if (mbtilesError) {
            console.warn(
              `Skipping mbtiles file ${file.name}: MBTiles module not available`
            )
            results.push(null)
          } else {
            results.push(await openMbtilesFile(filePath, file.name))
          }
        } else if (isPmtilesFile) {
          results.push(await openPmtilesFile(filePath, file.name))
        } else if (isDirectory) {
          console.log('findCharts: Directory found', filePath)
          results.push(await openDirectoryChart(filePath, file.name))
        } else {
          results.push(null)
        }
      }
      return results
    })
    .then((result: Array<ChartProvider | null | undefined>) =>
      result.filter((entry): entry is ChartProvider => Boolean(entry))
    )
    .then((charts: ChartProvider[]) =>
      charts.reduce(
        (result, chart) => {
          result[chart.identifier] = chart
          return result
        },
        {} as { [key: string]: ChartProvider }
      )
    )
    .catch((err: Error) => {
      console.error(
        `Error reading charts directory ${chartBaseDir}:${err.message}`
      )
      return {} as { [key: string]: ChartProvider }
    })
}
