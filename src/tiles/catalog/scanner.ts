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
import { applyMetadataOverrides, readChartsMetadata } from '../../metadata/charts-metadata'

export const findCharts = (chartBaseDir: string) => {
  return ensureMbtilesLoaded()
    .then(() => fs.readdir(chartBaseDir, { withFileTypes: true }))
    .then(async (files) => {
      const results: Array<ChartProvider | null | undefined> = []
      const mbtilesError = getMbtilesLoadError()
      const fileNames = new Set(files.map((file) => file.name))
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
        const isGeotiffFile = file.name.match(/\.(tif|tiff)$/i)
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
        } else if (isGeotiffFile) {
          const pmtilesName = file.name.replace(/\.(tif|tiff)$/i, '.pmtiles')
          if (fileNames.has(pmtilesName)) {
            continue
          }
          // GeoTIFFs are only exposed after conversion; import flow handles them.
          results.push(null)
        } else if (isDirectory) {
          console.log('findCharts: Directory found', filePath)
          const entries = await fs.readdir(filePath, { withFileTypes: true })
          const metadataPath = path.join(filePath, 'metadata.json')
          const metadata = await readChartsMetadata(metadataPath)
          const pmtilesEntry = entries.find((entry) =>
            entry.isFile() && entry.name.match(/\.pmtiles$/i)
          )
          const mbtilesEntry = entries.find((entry) =>
            entry.isFile() && entry.name.match(/\.mbtiles$/i)
          )

          if (pmtilesEntry) {
            const provider = await openPmtilesFile(
              path.join(filePath, pmtilesEntry.name),
              pmtilesEntry.name
            )
            if (provider && metadata) {
              const overridden = applyMetadataOverrides(provider, metadata)
              overridden.identifier = file.name
              overridden._filePath = path.join(filePath, pmtilesEntry.name)
              if (overridden.v1) {
                overridden.v1.tilemapUrl = `~tilePath~/${file.name}/{z}/{x}/{y}`
              }
              if (overridden.v2) {
                overridden.v2.url = `~tilePath~/${file.name}/{z}/{x}/{y}`
              }
              results.push(overridden)
            } else {
              results.push(provider)
            }
            continue
          }

          if (mbtilesEntry) {
            if (mbtilesError) {
              console.warn(
                `Skipping mbtiles file ${mbtilesEntry.name}: MBTiles module not available`
              )
              results.push(null)
            } else {
              const provider = await openMbtilesFile(
                path.join(filePath, mbtilesEntry.name),
                mbtilesEntry.name
              )
              if (provider && metadata) {
                const overridden = applyMetadataOverrides(provider, metadata)
                overridden.identifier = file.name
                overridden._filePath = path.join(filePath, mbtilesEntry.name)
                if (overridden.v1) {
                  overridden.v1.tilemapUrl = `~tilePath~/${file.name}/{z}/{x}/{y}`
                }
                if (overridden.v2) {
                  overridden.v2.url = `~tilePath~/${file.name}/{z}/{x}/{y}`
                }
                results.push(overridden)
              } else {
                results.push(provider)
              }
            }
            continue
          }

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
