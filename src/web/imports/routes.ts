import type { Application, Request, Response } from 'express'
import express from 'express'
import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import multer from 'multer'
import { execFile } from 'child_process'
import { CHART_IMPORTS_PATH } from '../../routes/paths'
import {
  cancelImportJob,
  createImportJob,
  deleteImportJob,
  getImportJob,
  listImportJobs
} from '../../imports/store'
import { enqueueImportJob } from '../../imports/processor'
import { getChartsStorageLayout } from '../../imports/storage'
import type {
  ImportConversionOptions,
  ImportFileType,
  ImportItemMetadata,
  ImportStreamType,
  ImportExtractOptions,
  ImportJob
} from '../../imports/types'
import type { MapSourceType } from '../../types'
import {
  getConvertersForType,
  isConversionSupported
} from '../../imports/converters'
import type { ConfigChange, ConfigService } from './config'
import { defaultConfigService } from './config'
import { registerImportEvents } from './sse'
import { getCuratedSources } from '../../imports/curated-sources'
import {
  addOnlineProvider,
  deleteOnlineProvider,
  listOnlineProviders
} from '../../online/providers-store'

type ImportRouteDeps = {
  app: Application
  configService?: ConfigService
  onOnlineProvidersChanged?: () => void
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
  extract?: ImportExtractOptions
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

const buildBundleId = (jobId: number, itemId: string) => `${jobId}-${itemId}`

const deleteImportArtifacts = async (job: ImportJob) => {
  const layout = getChartsStorageLayout()
  if (!layout) return
  const targets = [] as string[]
  for (const item of job.items) {
    const bundleId = buildBundleId(job.id, item.id)
    targets.push(
      path.join(layout.databaseDir, bundleId),
      path.join(layout.inputDir, bundleId),
      path.join(layout.inputDir, `${bundleId}.staging`),
      path.join(layout.conversionDir, bundleId),
      path.join(layout.conversionDir, `${bundleId}.staging`)
    )
  }
  await Promise.all(
    targets.map((target) =>
      fsp.rm(target, { recursive: true, force: true }).catch(() => {})
    )
  )
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

const isValidDetectedType = (value: string) => {
  return ['geotiff', 's57', 'mbtiles', 'pmtiles', 'unknown'].includes(value)
}

const sanitizeFilename = (name: string) => {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

const checkTool = (cmd: string, args: string[] = ['--version']) => {
  return new Promise<{ available: boolean; details?: string }>((resolve) => {
    execFile(cmd, args, { timeout: 5000 }, (err, stdout, stderr) => {
      if (err) {
        resolve({ available: false, details: stderr?.toString().trim() })
        return
      }
      resolve({ available: true, details: stdout?.toString().trim() })
    })
  })
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

const isValidBounds = (
  bounds: unknown
): bounds is [number, number, number, number] => {
  return (
    Array.isArray(bounds) &&
    bounds.length === 4 &&
    bounds.every((v) => typeof v === 'number' && Number.isFinite(v))
  )
}

const parseStringList = (value: unknown) => {
  if (!value) return undefined
  if (Array.isArray(value)) {
    const items = value
      .map((entry) => String(entry).trim())
      .filter((entry) => entry.length > 0)
    return items.length > 0 ? items : undefined
  }
  if (typeof value === 'string') {
    const items = value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
    return items.length > 0 ? items : undefined
  }
  return undefined
}

const parseNumber = (value: unknown) => {
  if (value === null || value === undefined || value === '') return undefined
  const num = Number(value)
  return Number.isFinite(num) ? num : undefined
}

const isValidServerType = (value: string) => {
  return [
    'tilelayer',
    'S-57',
    'WMS',
    'WMTS',
    'mapstyleJSON',
    'tileJSON'
  ].includes(value)
}

const parseOnlineProvider = (input: unknown) => {
  if (!input || typeof input !== 'object') {
    return { error: 'Invalid provider payload' }
  }
  const data = input as Record<string, unknown>
  const name = String(data.name ?? '').trim()
  const url = String(data.url ?? '').trim()
  const description = String(data.description ?? '').trim()
  const format = String(data.format ?? '').toLowerCase()
  const serverType = String(data.serverType ?? 'tilelayer')
  const minzoom = parseNumber(data.minzoom) ?? 1
  const maxzoom = parseNumber(data.maxzoom) ?? 15
  const proxy = data.proxy === undefined ? true : Boolean(data.proxy)
  const headers = parseStringList(data.headers)
  const layers = parseStringList(data.layers)
  const bounds = isValidBounds(data.bounds) ? data.bounds : undefined

  if (!name) return { error: 'name is required' }
  if (!url) return { error: 'url is required' }
  if (!['png', 'jpg'].includes(format)) {
    return { error: 'format must be png or jpg' }
  }
  if (!isValidServerType(serverType)) {
    return { error: 'serverType is invalid' }
  }
  if (!Number.isFinite(minzoom) || !Number.isFinite(maxzoom)) {
    return { error: 'minzoom/maxzoom must be numbers' }
  }
  if (minzoom < 1 || maxzoom > 24 || minzoom > maxzoom) {
    return { error: 'minzoom/maxzoom out of range' }
  }
  if ((serverType === 'WMS' || serverType === 'WMTS') && !layers?.length) {
    return { error: 'layers are required for WMS/WMTS sources' }
  }

  return {
    provider: {
      id: typeof data.id === 'string' ? data.id : undefined,
      name,
      description,
      minzoom,
      maxzoom,
      serverType: serverType as MapSourceType,
      format: format as 'png' | 'jpg',
      url,
      proxy,
      headers,
      layers,
      bounds
    }
  }
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
    extract?: ImportExtractOptions
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

    const detectedType = entry.detectedType ?? detectTypeFromFilename(filename)
    if (!isValidDetectedType(detectedType)) {
      return { items: [], error: 'Unsupported detectedType' }
    }

    if (entry.extract) {
      if (entry.extract.kind !== 'pmtiles') {
        return { items: [], error: 'Unsupported extract kind' }
      }
      if (!isValidBounds(entry.extract.bbox)) {
        return { items: [], error: 'extract bbox is required' }
      }
      if (!entry.sourceUrl) {
        return { items: [], error: 'extract requires sourceUrl' }
      }
      if (
        entry.extract.maxZoom != null &&
        !Number.isFinite(entry.extract.maxZoom)
      ) {
        return { items: [], error: 'extract maxZoom must be a number' }
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
      extract: entry.extract,
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

export const registerImportRoutes = ({
  app,
  configService = defaultConfigService,
  onOnlineProvidersChanged
}: ImportRouteDeps) => {
  app.use(CHART_IMPORTS_PATH, express.json({ limit: '10mb' }))
  registerImportEvents(app)

  app.get(
    `${CHART_IMPORTS_PATH}/capabilities`,
    async (_req: Request, res: Response) => {
      const ogr2ogr = await checkTool('ogr2ogr')
      const tippecanoe = await checkTool('tippecanoe', ['--version'])
      const supported: ImportFileType[] = [
        'geotiff',
        'mbtiles',
        'pmtiles',
        'unknown'
      ]
      const blocked: Array<{
        type: ImportFileType
        reason: string
        missing?: string[]
      }> = []

      if (ogr2ogr.available && tippecanoe.available) {
        supported.push('s57')
      } else {
        const missing = [
          ...(ogr2ogr.available ? [] : ['ogr2ogr']),
          ...(tippecanoe.available ? [] : ['tippecanoe'])
        ]
        blocked.push({
          type: 's57',
          reason: 'Missing required tools',
          missing
        })
      }

      return res.status(200).json({
        supported,
        blocked,
        tools: {
          ogr2ogr,
          tippecanoe
        }
      })
    }
  )

  app.get(
    `${CHART_IMPORTS_PATH}/providers`,
    async (_req: Request, res: Response) => {
      return res.status(200).json({ providers: listOnlineProviders() })
    }
  )

  app.post(
    `${CHART_IMPORTS_PATH}/providers`,
    (req: Request, res: Response) => {
      const parsed = parseOnlineProvider(req.body)
      if (!parsed.provider) {
        return sendError(res, 400, parsed.error || 'Invalid provider payload')
      }
      const record = addOnlineProvider(parsed.provider)
      onOnlineProvidersChanged?.()
      return res.status(201).json(record)
    }
  )

  app.delete(
    `${CHART_IMPORTS_PATH}/providers/:id`,
    (req: Request, res: Response) => {
      const id = normalizeParam(req.params.id)
      if (!id) {
        return sendError(res, 400, 'Provider id is required')
      }
      const deleted = deleteOnlineProvider(id)
      if (!deleted) {
        return sendError(res, 404, 'Provider not found')
      }
      onOnlineProvidersChanged?.()
      return res.status(200).json(deleted)
    }
  )

  app.get(
    `${CHART_IMPORTS_PATH}/sources`,
    async (req: Request, res: Response) => {
      try {
        const refresh = String(req.query?.refresh ?? '') === '1'
        const payload = await getCuratedSources({ refresh })
        return res.json(payload)
      } catch (err) {
        return sendError(res, 500, 'Failed to load curated sources', {
          error: String((err as Error).message || err)
        })
      }
    }
  )

  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        const layout = getChartsStorageLayout()
        if (!layout) {
          cb(new Error('Charts storage layout not initialized'), '')
          return
        }
        const dir = path.join(layout.inputDir, 'uploads')
        fs.mkdirSync(dir, { recursive: true })
        cb(null, dir)
      },
      filename: (_req, file, cb) => {
        const base = sanitizeFilename(
          path.basename(file.originalname || 'upload')
        )
        cb(null, `${Date.now()}-${base}`)
      }
    })
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

  app.post(
    `${CHART_IMPORTS_PATH}/upload`,
    upload.single('file'),
    (req: Request, res: Response) => {
      const file = req.file
      if (!file) {
        return sendError(res, 400, 'File is required')
      }

      const rawType =
        typeof req.body?.detectedType === 'string'
          ? (req.body.detectedType as ImportFileType)
          : undefined
      const detectedType =
        rawType ?? detectTypeFromFilename(file.originalname || file.filename)

      if (!isValidDetectedType(detectedType)) {
        return sendError(res, 400, 'Unsupported detectedType')
      }
      let metadata: ImportItemMetadata | undefined
      if (typeof req.body?.metadata === 'string' && req.body.metadata.trim()) {
        try {
          metadata = JSON.parse(req.body.metadata) as ImportItemMetadata
        } catch {
          return sendError(res, 400, 'Invalid metadata JSON')
        }
      }

      const job = createImportJob([
        {
          filename: file.originalname || file.filename,
          sourcePath: file.path,
          sizeBytes: file.size,
          detectedType,
          metadata
        }
      ])
      enqueueImportJob(job.id)
      return res.status(202).json(job)
    }
  )

  app.delete(
    `${CHART_IMPORTS_PATH}/:id`,
    async (req: Request, res: Response, next) => {
      const idRaw = normalizeParam(req.params.id)
      if (['config', 'events', 'converters'].includes(idRaw)) {
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
        await deleteImportArtifacts(existing)
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
    if (['config', 'events', 'converters'].includes(idRaw)) {
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
