import type { Application, Request, Response } from 'express'
import express from 'express'
import fs from 'fs/promises'
import path from 'path'
import { CHART_IMPORTS_PATH } from '../../routes/paths'
import {
  cancelImportJob,
  createImportJob,
  deleteImportJob,
  getImportJob,
  listImportJobs
} from '../../imports/store'
import { enqueueImportJob } from '../../imports/processor'
import type {
  ImportConversionOptions,
  ImportFileType,
  ImportItemMetadata,
  ImportStreamType
} from '../../imports/types'
import {
  getConvertersForType,
  isConversionSupported
} from '../../imports/converters'
import type { ConfigChange, ConfigService } from './config'
import { defaultConfigService } from './config'
import { registerImportEvents } from './sse'

type ImportRouteDeps = {
  app: Application
  configService?: ConfigService
}

type ImportRequestItem = {
  filename?: string
  sourcePath?: string
  sourceUrl?: string
  streamUrl?: string
  streamType?: ImportStreamType
  detectedType?: ImportFileType
  sizeBytes?: number
  convert?: ImportConversionOptions
  metadata?: ImportItemMetadata
}

type ImportRequestBody = {
  items?: ImportRequestItem[]
}

const normalizeParam = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) {
    return value[0] ?? ''
  }
  return value ?? ''
}

const detectTypeFromFilename = (filename: string): ImportFileType => {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.tif') || lower.endsWith('.tiff')) return 'geotiff'
  if (
    lower.endsWith('.000') ||
    lower.endsWith('.001') ||
    lower.endsWith('.s57')
  ) {
    return 's57'
  }
  if (lower.endsWith('.mbtiles')) return 'mbtiles'
  if (lower.endsWith('.pmtiles')) return 'pmtiles'
  return 'unknown'
}

const normalizeDetectedType = (value?: ImportFileType) => {
  if (!value) {
    return undefined
  }
  if (value === 'directory') {
    return 'folder'
  }
  return value
}

const isValidDetectedType = (value: string) => {
  return ['geotiff', 's57', 'mbtiles', 'pmtiles', 'folder', 'unknown'].includes(
    value
  )
}

const resolveFilename = (entry: ImportRequestItem) => {
  if (entry.filename && entry.filename.trim().length > 0) {
    return entry.filename.trim()
  }
  if (entry.sourcePath) {
    return path.basename(entry.sourcePath)
  }
  if (entry.sourceUrl) {
    try {
      const url = new URL(entry.sourceUrl)
      return path.basename(url.pathname) || 'download'
    } catch {
      return 'download'
    }
  }
  if (entry.streamUrl) {
    return 'stream'
  }
  return ''
}

const validateMetadata = (metadata?: ImportItemMetadata) => {
  if (!metadata) {
    return false
  }
  const bounds = metadata.bounds
  if (!Array.isArray(bounds) || bounds.length !== 4) {
    return false
  }
  if (bounds.some((value) => !Number.isFinite(value))) {
    return false
  }
  if (
    metadata.minZoom == null ||
    metadata.maxZoom == null ||
    !metadata.updatedAt ||
    !metadata.format ||
    !metadata.description
  ) {
    return false
  }
  return true
}

const parseItems = (items: ImportRequestItem[] | undefined) => {
  if (!Array.isArray(items) || items.length === 0) {
    return { items: [], error: 'No import items provided' }
  }

  const normalized = [] as Array<{
    filename: string
    sourcePath?: string
    sourceUrl?: string
    streamUrl?: string
    streamType?: ImportStreamType
    detectedType: ImportFileType
    sizeBytes?: number
    convert?: ImportConversionOptions
    metadata?: ImportItemMetadata
  }>

  for (const entry of items) {
    if (!entry) {
      continue
    }
    const sourceCount = [
      entry.sourcePath,
      entry.sourceUrl,
      entry.streamUrl
    ].filter((value) => typeof value === 'string' && value.length > 0).length
    if (sourceCount !== 1) {
      return { items: [], error: 'Exactly one source must be provided' }
    }

    const filename = resolveFilename(entry)
    if (!filename) {
      return { items: [], error: 'Filename could not be determined' }
    }

    const detectedTypeRaw = normalizeDetectedType(entry.detectedType)
    const detectedType = detectedTypeRaw ?? detectTypeFromFilename(filename)
    if (!isValidDetectedType(detectedType)) {
      return { items: [], error: 'Unsupported detectedType' }
    }

    if (detectedType === 'folder') {
      if (!validateMetadata(entry.metadata)) {
        return { items: [], error: 'metadata is required for folder' }
      }
    }

    let convert = entry.convert
    if (convert && !isConversionSupported(detectedType, convert)) {
      convert = undefined
    }

    normalized.push({
      filename,
      sourcePath: entry.sourcePath,
      sourceUrl: entry.sourceUrl,
      streamUrl: entry.streamUrl,
      streamType: entry.streamType,
      detectedType,
      sizeBytes: entry.sizeBytes,
      convert,
      metadata: entry.metadata
    })
  }

  return { items: normalized, error: null }
}

const sendError = (
  res: Response,
  status: number,
  message: string,
  details?: Record<string, unknown>
) => {
  return res.status(status).json({
    error: status >= 500 ? 'ServerError' : 'BadRequest',
    message,
    details
  })
}

const normalizeFsPath = (input: string | undefined) => {
  const safeInput = input && input.trim().length > 0 ? input.trim() : '/'
  if (path.isAbsolute(safeInput)) {
    return path.normalize(safeInput)
  }
  return path.resolve('/', safeInput)
}

const listDirectory = async (dirPath: string) => {
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  const results = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dirPath, entry.name)
      let size: number | undefined
      let mtime: string | undefined
      try {
        const stats = await fs.stat(fullPath)
        size = stats.isFile() ? stats.size : undefined
        mtime = stats.mtime.toISOString()
      } catch {
        size = undefined
        mtime = undefined
      }
      return {
        name: entry.name,
        path: fullPath,
        type: entry.isDirectory() ? 'directory' : 'file',
        size,
        mtime
      }
    })
  )
  return results
}

export const registerImportRoutes = ({
  app,
  configService = defaultConfigService
}: ImportRouteDeps) => {
  app.use(CHART_IMPORTS_PATH, express.json({ limit: '10mb' }))
  registerImportEvents(app)

  app.get(`${CHART_IMPORTS_PATH}/fs`, async (req: Request, res: Response) => {
    const requested = normalizeParam(req.query.path as string | undefined)
    const dirPath = normalizeFsPath(requested)
    try {
      const stats = await fs.stat(dirPath)
      if (!stats.isDirectory()) {
        return sendError(res, 400, 'Path is not a directory')
      }
      const entries = await listDirectory(dirPath)
      const parent = dirPath === '/' ? null : path.dirname(dirPath)
      return res.status(200).json({ path: dirPath, parent, entries })
    } catch (err) {
      console.error(`Failed to list directory ${dirPath}:`, err)
      return sendError(res, 404, 'Directory not found')
    }
  })

  app.get(
    `${CHART_IMPORTS_PATH}/converters/:type`,
    (req: Request, res: Response) => {
      const type = normalizeParam(req.params.type) as ImportFileType
      return res.status(200).json(getConvertersForType(type))
    }
  )

  app.get(`${CHART_IMPORTS_PATH}`, (req: Request, res: Response) => {
    return res.status(200).json(listImportJobs())
  })

  app.post(`${CHART_IMPORTS_PATH}`, (req: Request, res: Response) => {
    const body = req.body as ImportRequestBody
    const parsed = parseItems(body.items)
    if (parsed.error || parsed.items.length === 0) {
      return sendError(res, 400, parsed.error || 'No import items provided')
    }
    const job = createImportJob(parsed.items)
    enqueueImportJob(job.id)
    return res.status(202).json(job)
  })

  app.delete(
    `${CHART_IMPORTS_PATH}/:id`,
    (req: Request, res: Response, next) => {
      const idRaw = normalizeParam(req.params.id)
      if (['config', 'events', 'fs', 'converters'].includes(idRaw)) {
        return next()
      }
      const id = parseInt(idRaw, 10)
      if (!Number.isFinite(id)) {
        return sendError(res, 400, 'Invalid job id')
      }
      const action = String(req.query.action || '').toLowerCase()
      if (action === 'delete') {
        const existing = getImportJob(id)
        if (!existing) {
          return sendError(res, 404, 'Import job not found')
        }
        const job = deleteImportJob(id)
        if (!job) {
          return sendError(res, 409, 'Import job is still in progress')
        }
        return res.status(200).json(job)
      }
      const job = cancelImportJob(id)
      if (!job) {
        return sendError(res, 404, 'Import job not found')
      }
      return res.status(200).json(job)
    }
  )

  app.get(`${CHART_IMPORTS_PATH}/config`, (req: Request, res: Response) => {
    const entries = configService.getEntries()
    return res.status(200).json(entries)
  })

  app.put(`${CHART_IMPORTS_PATH}/config`, (req: Request, res: Response) => {
    const body = req.body as { changes?: ConfigChange[] }
    const changes = Array.isArray(body?.changes) ? body.changes : []
    const entries = configService.applyChanges(changes)
    return res.status(200).json(entries)
  })

  app.get(`${CHART_IMPORTS_PATH}/:id`, (req: Request, res: Response, next) => {
    const idRaw = normalizeParam(req.params.id)
    if (['config', 'events', 'fs', 'converters'].includes(idRaw)) {
      return next()
    }
    const id = parseInt(idRaw, 10)
    if (!Number.isFinite(id)) {
      return sendError(res, 400, 'Invalid job id')
    }
    const job = getImportJob(id)
    if (!job) {
      return sendError(res, 404, 'Import job not found')
    }
    return res.status(200).json(job)
  })
}
