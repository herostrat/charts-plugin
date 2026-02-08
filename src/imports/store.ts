import type {
  ImportFileType,
  ImportItem,
  ImportJob,
  ImportJobState,
  ImportConversionOptions,
  ImportItemMetadata,
  ImportStreamType
} from './types'
import { emitImportEvent } from './events'

let nextJobId = 1
const jobs = new Map<number, ImportJob>()

const nowIso = () => new Date().toISOString()

const buildItem = (input: {
  filename: string
  detectedType: ImportFileType
  sizeBytes?: number
  convert?: ImportConversionOptions
  sourcePath?: string
  sourceUrl?: string
  streamUrl?: string
  streamType?: ImportStreamType
  metadata?: ImportItemMetadata
  metadataOverrides?: ImportItemMetadata
}): ImportItem => {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const metadata = input.metadata ?? input.metadataOverrides
  const bounds = metadata?.bounds
  return {
    id,
    filename: input.filename,
    sourcePath: input.sourcePath,
    sourceUrl: input.sourceUrl,
    streamUrl: input.streamUrl,
    streamType: input.streamType,
    detectedType: input.detectedType,
    sizeBytes: input.sizeBytes,
    state: 'QUEUED',
    convert: input.convert,
    metadata,
    metadataOverrides: input.metadataOverrides,
    bounds,
    errors: []
  }
}

export const createImportJob = (
  items: Array<{
    filename: string
    detectedType: ImportFileType
    sizeBytes?: number
    convert?: ImportConversionOptions
    sourcePath?: string
    sourceUrl?: string
    streamUrl?: string
    streamType?: ImportStreamType
    metadata?: ImportItemMetadata
    metadataOverrides?: ImportItemMetadata
  }>
): ImportJob => {
  const id = nextJobId++
  const createdAt = nowIso()
  const job: ImportJob = {
    id,
    createdAt,
    updatedAt: createdAt,
    state: 'QUEUED',
    items: items.map(buildItem),
    errors: []
  }
  jobs.set(id, job)
  emitImportEvent({ type: 'job', job })
  return job
}

export const listImportJobs = (): ImportJob[] => {
  return Array.from(jobs.values())
}

export const getImportJob = (id: number): ImportJob | undefined => {
  return jobs.get(id)
}

export const cancelImportJob = (id: number): ImportJob | undefined => {
  const job = jobs.get(id)
  if (!job) {
    return undefined
  }
  if (job.state === 'COMPLETED' || job.state === 'FAILED') {
    return job
  }
  job.state = 'CANCELED'
  job.items = job.items.map((item) => ({
    ...item,
    state: item.state === 'COMPLETED' ? item.state : 'CANCELED'
  }))
  job.updatedAt = nowIso()
  emitImportEvent({ type: 'job', job })
  return job
}

export const updateImportJobState = (id: number, state: ImportJobState) => {
  const job = jobs.get(id)
  if (!job) {
    return undefined
  }
  job.state = state
  job.updatedAt = nowIso()
  emitImportEvent({ type: 'job', job })
  return job
}

export const updateImportItem = (
  jobId: number,
  itemId: string,
  update: Partial<ImportItem>
) => {
  const job = jobs.get(jobId)
  if (!job) {
    return undefined
  }
  const idx = job.items.findIndex((item) => item.id === itemId)
  if (idx === -1) {
    return undefined
  }
  const nextItem = {
    ...job.items[idx],
    ...update
  }
  const nextBounds =
    update.bounds ?? update.metadata?.bounds ?? update.metadataOverrides?.bounds
  if (nextBounds && Array.isArray(nextBounds) && nextBounds.length === 4) {
    nextItem.bounds = nextBounds as [number, number, number, number]
  }
  job.items[idx] = nextItem
  job.updatedAt = nowIso()
  emitImportEvent({ type: 'item', jobId, item: job.items[idx] })
  return job.items[idx]
}

export const addImportJobError = (jobId: number, message: string) => {
  const job = jobs.get(jobId)
  if (!job) {
    return undefined
  }
  job.errors.push(message)
  job.updatedAt = nowIso()
  emitImportEvent({ type: 'job', job })
  return job
}

export const resetImportStore = () => {
  jobs.clear()
  nextJobId = 1
}
