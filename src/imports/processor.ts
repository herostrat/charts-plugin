import path from 'path'
import {
  addImportJobError,
  getImportJob,
  updateImportItem,
  updateImportJobState
} from './store'
import fs from 'fs/promises'
import { runConversion } from './runner'
import type { ImportItem } from './types'
import {
  buildStagingDir,
  commitStagingDir,
  getChartsStorageLayout,
  safeMove
} from './storage'
import { writeChartsMetadataFile } from '../metadata/charts-metadata'

const activeJobs = new Set<number>()

const resolveOutputDir = (sourcePath?: string) => {
  if (!sourcePath) {
    return path.resolve('.')
  }
  return path.dirname(sourcePath)
}

const buildBundleId = (jobId: number, itemId: string) => {
  return `${jobId}-${itemId}`
}

const buildMetadataPayload = (item: ImportItem) => {
  const meta = item.metadata ?? item.metadataOverrides
  if (!meta || !meta.bounds || !meta.format) {
    return null
  }
  return {
    schemaVersion: 1 as const,
    id: item.filename,
    name: item.filename,
    description: meta.description,
    bounds: meta.bounds,
    minzoom: meta.minZoom,
    maxzoom: meta.maxZoom,
    format: meta.format,
    type: meta.type ?? 'tilelayer',
    updatedAt: meta.updatedAt,
    detectedType: item.detectedType,
    source: {
      path: item.sourcePath,
      url: item.sourceUrl,
      streamUrl: item.streamUrl
    }
  }
}

const processItem = async (jobId: number, item: ImportItem) => {
  const sourcePath = item.sourcePath
  const sourceUrl = item.sourceUrl
  const streamUrl = item.streamUrl
  const convert = item.convert

  if (!sourcePath && !sourceUrl && !streamUrl) {
    updateImportItem(jobId, item.id, {
      state: 'FAILED',
      errors: ['Missing source path or URL']
    })
    return
  }

  if (sourceUrl) {
    updateImportItem(jobId, item.id, {
      state: 'FAILED',
      errors: ['Download workflow not implemented yet']
    })
    return
  }

  if (streamUrl) {
    updateImportItem(jobId, item.id, {
      state: 'AVAILABLE',
      output: streamUrl
    })
    return
  }

  if (!sourcePath) {
    updateImportItem(jobId, item.id, {
      state: 'FAILED',
      errors: ['Missing source path']
    })
    return
  }

  const layout = getChartsStorageLayout()
  let workingSourcePath = sourcePath
  if (layout) {
    const bundleId = buildBundleId(jobId, item.id)
    const stagingDir = buildStagingDir(layout.inputDir, bundleId)
    const finalDir = path.join(layout.inputDir, bundleId)
    const targetPath = path.join(finalDir, path.basename(sourcePath))

    await fs.mkdir(stagingDir, { recursive: true })
    await fs.copyFile(sourcePath, path.join(stagingDir, path.basename(sourcePath)))

    const metadataPayload = buildMetadataPayload(item)
    if (metadataPayload) {
      await writeChartsMetadataFile(stagingDir, metadataPayload)
    }

    await commitStagingDir(stagingDir, finalDir)
    workingSourcePath = targetPath
    updateImportItem(jobId, item.id, {
      sourcePath: workingSourcePath,
      state: 'DOWNLOADED'
    })
  }

  if (!layout) {
    updateImportItem(jobId, item.id, { state: 'COPYING' })
    updateImportItem(jobId, item.id, { state: 'DOWNLOADED' })
  }

  if (!convert) {
    if (layout) {
      const bundleId = buildBundleId(jobId, item.id)
      const inputDir = path.join(layout.inputDir, bundleId)
      const databaseDir = path.join(layout.databaseDir, bundleId)
      await safeMove(inputDir, databaseDir)
      updateImportItem(jobId, item.id, {
        output: databaseDir,
        state: 'AVAILABLE'
      })
    } else {
      updateImportItem(jobId, item.id, { state: 'AVAILABLE' })
    }
    return
  }

  try {
    updateImportItem(jobId, item.id, { state: 'CONVERTING' })
    const conversionOutputDir = layout
      ? buildStagingDir(layout.conversionDir, buildBundleId(jobId, item.id))
      : resolveOutputDir(workingSourcePath)
    const outcome = await runConversion(workingSourcePath, {
      detectedType: item.detectedType ?? detectTypeFromPath(workingSourcePath),
      outputDir: conversionOutputDir,
      target: convert
    })
    if (layout) {
      const bundleId = buildBundleId(jobId, item.id)
      const databaseDir = path.join(layout.databaseDir, bundleId)
      await commitStagingDir(conversionOutputDir, databaseDir)
      updateImportItem(jobId, item.id, {
        state: 'AVAILABLE',
        stagingDir: outcome.stagingDir,
        output: databaseDir
      })
    } else {
      updateImportItem(jobId, item.id, {
        state: 'AVAILABLE',
        stagingDir: outcome.stagingDir,
        output: outcome.outputPath
      })
    }
    // TODO: package staged tiles into PMTiles output.
  } catch (err) {
    updateImportItem(jobId, item.id, {
      state: 'FAILED',
      errors: [String((err as Error).message || err)]
    })
  }
}

const detectTypeFromPath = (filePath: string) => {
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.tif') || lower.endsWith('.tiff')) return 'geotiff'
  if (lower.endsWith('.mbtiles')) return 'mbtiles'
  if (lower.endsWith('.pmtiles')) return 'pmtiles'
  if (
    lower.endsWith('.000') ||
    lower.endsWith('.001') ||
    lower.endsWith('.s57')
  ) {
    return 's57'
  }
  return 'unknown'
}

export const enqueueImportJob = (jobId: number) => {
  if (activeJobs.has(jobId)) {
    return
  }
  activeJobs.add(jobId)
  setImmediate(async () => {
    try {
      const job = getImportJob(jobId)
      if (!job) {
        return
      }
      updateImportJobState(jobId, 'RUNNING')
      for (const item of job.items) {
        if (job.state === 'CANCELED') {
          break
        }
        await processItem(jobId, item)
      }
      const refreshed = getImportJob(jobId)
      if (
        refreshed?.items.some((item) =>
          ['FAILED', 'METADATA_FAILED'].includes(item.state)
        )
      ) {
        updateImportJobState(jobId, 'FAILED')
      } else if (refreshed?.state !== 'CANCELED') {
        updateImportJobState(jobId, 'COMPLETED')
      }
    } catch (err) {
      addImportJobError(jobId, String((err as Error).message || err))
      updateImportJobState(jobId, 'FAILED')
    } finally {
      activeJobs.delete(jobId)
    }
  })
}
