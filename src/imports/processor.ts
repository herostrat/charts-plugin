import path from 'path'
import {
  addImportJobError,
  getImportJob,
  updateImportItem,
  updateImportJobState
} from './store'
import { runConversion } from './runner'
import type { ImportItem } from './types'

const activeJobs = new Set<number>()

const resolveOutputDir = (sourcePath?: string) => {
  if (!sourcePath) {
    return path.resolve('.')
  }
  return path.dirname(sourcePath)
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
      state: 'COMPLETED',
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

  updateImportItem(jobId, item.id, { state: 'RUNNING' })

  if (!convert) {
    updateImportItem(jobId, item.id, { state: 'COMPLETED' })
    return
  }

  try {
    const outcome = await runConversion(sourcePath, {
      detectedType: item.detectedType ?? detectTypeFromPath(sourcePath),
      outputDir: resolveOutputDir(sourcePath),
      target: convert
    })
    updateImportItem(jobId, item.id, {
      state: 'STAGED',
      stagingDir: outcome.stagingDir,
      output: outcome.outputPath
    })
    // TODO: package staged tiles into PMTiles output.
    updateImportItem(jobId, item.id, { state: 'COMPLETED' })
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
      if (refreshed?.items.some((item) => item.state === 'FAILED')) {
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
