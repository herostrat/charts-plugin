import path from 'path'
import fs from 'fs/promises'
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
import type { ChartsMetadata } from '../metadata/charts-metadata'
import { readChartsMetadata } from '../metadata/charts-metadata'

let nextJobId = 1
const jobs = new Map<number, ImportJob>()
let persistencePath: string | null = null
let persistTimer: NodeJS.Timeout | null = null
let isHydrating = false

const nowIso = () => new Date().toISOString()

const schedulePersist = () => {
  if (!persistencePath || isHydrating) {
    return
  }
  if (persistTimer) {
    return
  }
  persistTimer = setTimeout(() => {
    persistTimer = null
    persistStore().catch((err) => {
      console.error('Failed to persist import store:', err)
    })
  }, 250)
}

const persistStore = async () => {
  if (!persistencePath) {
    return
  }
  await fs.mkdir(path.dirname(persistencePath), { recursive: true })
  const payload = {
    nextJobId,
    jobs: Array.from(jobs.values())
  }
  await fs.writeFile(persistencePath, JSON.stringify(payload, null, 2))
}

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
}): ImportItem => {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
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
    metadata: input.metadata,
    errors: []
  }
}

const detectTypeFromFilename = (filename: string): ImportFileType => {
  const lower = filename.toLowerCase()
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

const parseBounds = (bounds?: number[] | string) => {
  if (Array.isArray(bounds) && bounds.length === 4) {
    const nums = bounds.map((value) => Number(value))
    return nums.every((value) => Number.isFinite(value))
      ? (nums as [number, number, number, number])
      : undefined
  }
  if (typeof bounds === 'string') {
    const nums = bounds.split(',').map((value) => Number(value.trim()))
    return nums.length === 4 && nums.every((value) => Number.isFinite(value))
      ? (nums as [number, number, number, number])
      : undefined
  }
  return undefined
}

const parseNumber = (value?: number | string) => {
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

const toImportMetadata = (
  metadata: ChartsMetadata | null
): ImportItemMetadata | undefined => {
  if (!metadata) return undefined
  const bounds = parseBounds(metadata.bounds)
  return {
    bounds,
    minZoom: parseNumber(metadata.minzoom),
    maxZoom: parseNumber(metadata.maxzoom),
    updatedAt: metadata.updatedAt,
    format: metadata.format,
    type: metadata.detectedType as ImportFileType | undefined,
    description: metadata.description
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
  schedulePersist()
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
  schedulePersist()
  return job
}

export const deleteImportJob = (id: number): ImportJob | undefined => {
  const job = jobs.get(id)
  if (!job) {
    return undefined
  }
  const deletable = [
    'FAILED',
    'COMPLETED',
    'AVAILABLE',
    'CANCELED',
    'METADATA_FAILED'
  ]
  if (!deletable.includes(job.state)) {
    return undefined
  }
  jobs.delete(id)
  emitImportEvent({ type: 'delete', jobId: id })
  schedulePersist()
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
  schedulePersist()
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
  job.items[idx] = nextItem
  job.updatedAt = nowIso()
  emitImportEvent({ type: 'item', jobId, item: job.items[idx] })
  schedulePersist()
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
  schedulePersist()
  return job
}

export const resetImportStore = () => {
  jobs.clear()
  nextJobId = 1
}

export const setImportStorePersistence = (filePath: string) => {
  persistencePath = filePath
}

export const loadImportStoreFromFile = async (filePath: string) => {
  persistencePath = filePath
  let raw: string
  try {
    raw = await fs.readFile(filePath, { encoding: 'utf8' })
  } catch {
    return
  }

  try {
    const parsed = JSON.parse(raw) as {
      nextJobId?: number
      jobs?: ImportJob[]
    }
    if (!Array.isArray(parsed.jobs)) {
      return
    }
    isHydrating = true
    jobs.clear()
    let maxId = 0
    for (const job of parsed.jobs) {
      if (job && typeof job.id === 'number') {
        jobs.set(job.id, job)
        if (job.id > maxId) maxId = job.id
      }
    }
    const seededNext =
      typeof parsed.nextJobId === 'number' ? parsed.nextJobId : maxId + 1
    nextJobId = Math.max(seededNext, maxId + 1)
  } catch (err) {
    console.error('Failed to load import store:', err)
  } finally {
    isHydrating = false
  }
}

export const seedImportJobsFromDatabase = async (databaseDir: string) => {
  if (jobs.size > 0) {
    return
  }

  let entries: fs.Dirent[]
  try {
    entries = await fs.readdir(databaseDir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    const entryPath = path.join(databaseDir, entry.name)
    try {
      if (entry.isDirectory()) {
        const inner = await fs.readdir(entryPath, { withFileTypes: true })
        const metadataPath = path.join(entryPath, 'metadata.json')
        const metadata = await readChartsMetadata(metadataPath)

        const chartFile = inner.find(
          (item) =>
            item.isFile() &&
            item.name.match(/\.(pmtiles|mbtiles|tif|tiff|s57|000|001)$/i)
        )
        if (!chartFile) continue

        const filePath = path.join(entryPath, chartFile.name)
        const stats = await fs.stat(filePath)
        const detectedType =
          (metadata?.detectedType as ImportFileType | undefined) ??
          detectTypeFromFilename(chartFile.name)
        const itemMeta = toImportMetadata(metadata)
        const sourcePath = metadata?.source?.path || filePath

        const job = createImportJob([
          {
            filename: chartFile.name,
            detectedType,
            sourcePath,
            sizeBytes: stats.size,
            metadata: itemMeta
          }
        ])
        updateImportItem(job.id, job.items[0].id, {
          state: 'AVAILABLE',
          output: filePath
        })
        updateImportJobState(job.id, 'COMPLETED')
        continue
      }

      if (entry.isFile()) {
        if (!entry.name.match(/\.(pmtiles|mbtiles|tif|tiff|s57|000|001)$/i)) {
          continue
        }
        const stats = await fs.stat(entryPath)
        const detectedType = detectTypeFromFilename(entry.name)
        const job = createImportJob([
          {
            filename: entry.name,
            detectedType,
            sourcePath: entryPath,
            sizeBytes: stats.size
          }
        ])
        updateImportItem(job.id, job.items[0].id, {
          state: 'AVAILABLE',
          output: entryPath
        })
        updateImportJobState(job.id, 'COMPLETED')
      }
    } catch (err) {
      console.error('Failed to seed import job from database:', entryPath, err)
    }
  }
  schedulePersist()
}
