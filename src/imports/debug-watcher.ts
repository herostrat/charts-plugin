import fs from 'fs/promises'
import path from 'path'
import { createImportJob } from './store'
import { enqueueImportJob } from './processor'
import type { ImportFileType, ImportItemMetadata } from './types'
import {
  ensureMbtilesLoaded,
  getMbtilesLoadError,
  openMbtilesFile
} from '../tiles/catalog/mbtiles'
import { openPmtilesFile } from '../tiles/catalog/pmtiles'

const watchedExtensions = new Map<string, ImportFileType>([
  ['.pmtiles', 'pmtiles'],
  ['.mbtiles', 'mbtiles'],
  ['.tif', 'geotiff'],
  ['.tiff', 'geotiff']
])

const scanIntervalMs = 2000
const stableCyclesNeeded = 2
let watcherStarted = false

const isCandidateFile = (fileName: string) => {
  const ext = path.extname(fileName).toLowerCase()
  return watchedExtensions.has(ext)
}

const buildMetadata = async (
  detectedType: ImportFileType,
  filePath: string
): Promise<ImportItemMetadata | undefined> => {
  if (detectedType === 'pmtiles') {
    const provider = await openPmtilesFile(filePath, path.basename(filePath))
    if (!provider || !provider.bounds || !provider.format) {
      return undefined
    }
    return {
      bounds: provider.bounds as [number, number, number, number],
      minZoom: provider.minzoom,
      maxZoom: provider.maxzoom,
      updatedAt: new Date().toISOString(),
      format: provider.format,
      description: provider.description || provider.name || ''
    }
  }

  if (detectedType === 'mbtiles') {
    await ensureMbtilesLoaded()
    if (getMbtilesLoadError()) {
      return undefined
    }
    const provider = await openMbtilesFile(filePath, path.basename(filePath))
    if (!provider || !provider.bounds || !provider.format) {
      return undefined
    }
    return {
      bounds: provider.bounds as [number, number, number, number],
      minZoom: provider.minzoom,
      maxZoom: provider.maxzoom,
      updatedAt: new Date().toISOString(),
      format: provider.format,
      description: provider.description || provider.name || ''
    }
  }

  return undefined
}

export const startDebugInputWatcher = async (debugDir: string) => {
  if (watcherStarted) {
    return
  }
  watcherStarted = true
  await fs.mkdir(debugDir, { recursive: true })

  const seen = new Map<string, { size: number; stable: number }>()

  const scan = async () => {
    let entries
    try {
      entries = await fs.readdir(debugDir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (!entry.isFile()) {
        continue
      }
      if (!isCandidateFile(entry.name)) {
        continue
      }
      const filePath = path.join(debugDir, entry.name)
      const markerPath = `${filePath}.ingested`
      try {
        await fs.stat(markerPath)
        continue
      } catch {
        // marker missing
      }

      let stats
      try {
        stats = await fs.stat(filePath)
      } catch {
        continue
      }

      const previous = seen.get(filePath)
      if (!previous || previous.size !== stats.size) {
        seen.set(filePath, { size: stats.size, stable: 0 })
        continue
      }

      const stable = previous.stable + 1
      if (stable < stableCyclesNeeded) {
        seen.set(filePath, { size: stats.size, stable })
        continue
      }

      seen.delete(filePath)

      const ext = path.extname(entry.name).toLowerCase()
      const detectedType = watchedExtensions.get(ext) || 'unknown'
      let metadata: ImportItemMetadata | undefined
      try {
        metadata = await buildMetadata(detectedType, filePath)
      } catch {
        metadata = undefined
      }

      const job = createImportJob([
        {
          filename: entry.name,
          detectedType,
          sourcePath: filePath,
          sizeBytes: stats.size,
          metadata
        }
      ])
      enqueueImportJob(job.id)

      try {
        await fs.writeFile(markerPath, String(job.id))
      } catch {
        // ignore marker failures
      }
    }
  }

  setInterval(() => {
    scan().catch((err) => {
      console.error('Debug input watcher scan failed:', err)
    })
  }, scanIntervalMs)

  await scan()
}
