import path from 'path'
import os from 'os'
import { createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'
import { spawn } from 'child_process'
import {
  addImportJobError,
  getImportJob,
  updateImportItem,
  updateImportJobState
} from './store'
import fs from 'fs/promises'
import { runConversion } from './runner'
import type {
  ImportConversionOptions,
  ImportItem,
  ImportItemMetadata,
  ImportExtractOptions
} from './types'
import {
  buildStagingDir,
  commitStagingDir,
  getChartsStorageLayout,
  safeMove
} from './storage'
import { writeChartsMetadataFile } from '../metadata/charts-metadata'
import {
  ensureMbtilesLoaded,
  getMbtilesLoadError,
  openMbtilesFile
} from '../tiles/catalog/mbtiles'
import { openPmtilesFile } from '../tiles/catalog/pmtiles'
import { openGeotiffFile } from '../tiles/catalog/geotiff'

const activeJobs = new Set<number>()

const resolveOutputDir = (sourcePath?: string) => {
  if (!sourcePath) {
    return path.resolve('.')
  }
  return path.dirname(sourcePath)
}

const safeFilename = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_')

const downloadToTempFile = async (sourceUrl: string, filename: string) => {
  const res = await fetch(sourceUrl)
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status} ${res.statusText}`)
  }
  const baseName = safeFilename(path.basename(filename || 'download'))
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'charts-download-'))
  const outPath = path.join(tempDir, baseName)

  if (res.body) {
    const stream = createWriteStream(outPath)
    await pipeline(res.body as unknown as NodeJS.ReadableStream, stream)
  } else {
    const buffer = Buffer.from(await res.arrayBuffer())
    await fs.writeFile(outPath, buffer)
  }

  const stats = await fs.stat(outPath)
  return { outPath, sizeBytes: stats.size, tempDir }
}

const runPmtilesExtract = (
  sourceUrl: string,
  outPath: string,
  bbox: [number, number, number, number],
  maxZoom?: number
) => {
  return new Promise<void>((resolve, reject) => {
    const args = [
      'extract',
      sourceUrl,
      outPath,
      `--bbox=${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]}`
    ]
    if (Number.isFinite(maxZoom)) {
      args.push(`--maxzoom=${maxZoom}`)
    }

    const proc = spawn('pmtiles', args)
    let stderr = ''
    proc.stderr.on('data', (data) => {
      stderr += data.toString()
    })
    proc.on('error', (err) => reject(err))
    proc.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      const hint = stderr.trim()
      reject(
        new Error(
          `pmtiles extract failed (${code ?? 'unknown'}): ${hint || 'unknown error'}`
        )
      )
    })
  })
}

const extractPmtilesToTempFile = async (
  sourceUrl: string,
  filename: string,
  extract: ImportExtractOptions
) => {
  const baseName = safeFilename(path.basename(filename || 'extract.pmtiles'))
  const outputName = baseName.endsWith('.pmtiles')
    ? baseName
    : `${baseName}.pmtiles`
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'charts-extract-'))
  const outPath = path.join(tempDir, outputName)

  await runPmtilesExtract(sourceUrl, outPath, extract.bbox, extract.maxZoom)
  const stats = await fs.stat(outPath)
  return { outPath, sizeBytes: stats.size, tempDir }
}

const buildBundleId = (jobId: number, itemId: string) => {
  return `${jobId}-${itemId}`
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

const isValidMetadata = (
  meta?: ImportItemMetadata | null
): meta is ImportItemMetadata & {
  bounds: [number, number, number, number]
  format: string
} => {
  if (!meta) {
    return false
  }
  if (!isValidBounds(meta.bounds)) {
    return false
  }
  if (!meta.format || typeof meta.format !== 'string') {
    return false
  }
  return true
}

const isConversionSupported = (
  detectedType: string,
  target: ImportConversionOptions
) => {
  return detectedType === 'geotiff' && target.target === 'pmtiles'
}

const extractMetadata = async (
  item: ImportItem
): Promise<ImportItemMetadata | null> => {
  if (!item.sourcePath) {
    return null
  }

  if (item.detectedType === 'pmtiles') {
    const provider = await openPmtilesFile(
      item.sourcePath,
      path.basename(item.sourcePath)
    )
    if (!provider || !isValidBounds(provider.bounds) || !provider.format) {
      return null
    }
    return {
      bounds: provider.bounds as [number, number, number, number],
      minZoom: provider.minzoom,
      maxZoom: provider.maxzoom,
      updatedAt: new Date().toISOString(),
      format: provider.format,
      description: provider.description || provider.name || '',
      type: item.detectedType
    }
  }

  if (item.detectedType === 'mbtiles') {
    await ensureMbtilesLoaded()
    if (getMbtilesLoadError()) {
      return null
    }
    const provider = await openMbtilesFile(
      item.sourcePath,
      path.basename(item.sourcePath)
    )
    if (!provider || !isValidBounds(provider.bounds) || !provider.format) {
      return null
    }
    return {
      bounds: provider.bounds as [number, number, number, number],
      minZoom: provider.minzoom,
      maxZoom: provider.maxzoom,
      updatedAt: new Date().toISOString(),
      format: provider.format,
      description: provider.description || provider.name || '',
      type: item.detectedType
    }
  }

  if (item.detectedType === 'geotiff') {
    const provider = await openGeotiffFile(
      item.sourcePath,
      path.basename(item.sourcePath)
    )
    if (!provider || !isValidBounds(provider.bounds) || !provider.format) {
      return null
    }
    return {
      bounds: provider.bounds as [number, number, number, number],
      minZoom: provider.minzoom,
      maxZoom: provider.maxzoom,
      updatedAt: new Date().toISOString(),
      format: provider.format,
      description: provider.description || provider.name || '',
      type: item.detectedType
    }
  }

  return null
}

const buildMetadataPayload = (item: ImportItem, meta: ImportItemMetadata) => {
  if (!isValidMetadata(meta)) {
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
  let sourcePath = item.sourcePath
  const sourceUrl = item.sourceUrl
  const streamUrl = item.streamUrl
  const convert = item.convert
  const extract = item.extract
  let tempDownloadDir: string | null = null

  if (!sourcePath && !sourceUrl && !streamUrl) {
    updateImportItem(jobId, item.id, {
      state: 'FAILED',
      errors: ['Missing source path or URL']
    })
    return
  }

  if (extract?.kind === 'pmtiles') {
    if (!sourceUrl) {
      updateImportItem(jobId, item.id, {
        state: 'FAILED',
        errors: ['Extract requires sourceUrl']
      })
      return
    }
    updateImportItem(jobId, item.id, { state: 'DOWNLOADING' })
    try {
      const result = await extractPmtilesToTempFile(
        sourceUrl,
        item.filename,
        extract
      )
      updateImportItem(jobId, item.id, {
        sourcePath: result.outPath,
        sizeBytes: result.sizeBytes,
        state: 'DOWNLOADED'
      })
      item.sourcePath = result.outPath
      sourcePath = result.outPath
      tempDownloadDir = result.tempDir
    } catch (err) {
      updateImportItem(jobId, item.id, {
        state: 'FAILED',
        errors: [String((err as Error).message || err)]
      })
      return
    }
  } else if (sourceUrl) {
    const layout = getChartsStorageLayout()
    if (!layout) {
      updateImportItem(jobId, item.id, {
        state: 'FAILED',
        errors: ['Download requires charts storage layout']
      })
      return
    }

    updateImportItem(jobId, item.id, { state: 'DOWNLOADING' })
    try {
      const result = await downloadToTempFile(sourceUrl, item.filename)
      updateImportItem(jobId, item.id, {
        sourcePath: result.outPath,
        sizeBytes: result.sizeBytes,
        state: 'DOWNLOADED'
      })
      item.sourcePath = result.outPath
      sourcePath = result.outPath
      tempDownloadDir = result.tempDir
    } catch (err) {
      updateImportItem(jobId, item.id, {
        state: 'FAILED',
        errors: [String((err as Error).message || err)]
      })
      return
    }
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

  const detectedType = item.detectedType ?? detectTypeFromPath(sourcePath)

  if (convert && !isConversionSupported(detectedType, convert)) {
    updateImportItem(jobId, item.id, {
      state: 'FAILED',
      errors: ['Conversion not supported for this file type']
    })
    return
  }

  let resolvedMeta: ImportItemMetadata | null | undefined =
    item.metadata ?? null
  if (!isValidMetadata(resolvedMeta)) {
    try {
      resolvedMeta = await extractMetadata(item)
    } catch {
      resolvedMeta = null
    }
  }

  if (!isValidMetadata(resolvedMeta)) {
    updateImportItem(jobId, item.id, {
      state: 'METADATA_FAILED',
      errors: ['Missing or invalid metadata (bounds/format)']
    })
    return
  }

  const validMeta = resolvedMeta as ImportItemMetadata
  if (!item.metadata) {
    updateImportItem(jobId, item.id, {
      metadata: validMeta
    })
  }

  const layout = getChartsStorageLayout()
  let workingSourcePath = sourcePath
  if (layout) {
    const bundleId = buildBundleId(jobId, item.id)
    const stagingDir = buildStagingDir(layout.inputDir, bundleId)
    const finalDir = path.join(layout.inputDir, bundleId)
    const targetPath = path.join(finalDir, path.basename(sourcePath))

    await fs.mkdir(stagingDir, { recursive: true })
    await fs.copyFile(
      sourcePath,
      path.join(stagingDir, path.basename(sourcePath))
    )

    const metadataPayload = buildMetadataPayload(item, validMeta)
    if (metadataPayload) {
      await writeChartsMetadataFile(stagingDir, metadataPayload)
    }

    await commitStagingDir(stagingDir, finalDir)
    workingSourcePath = targetPath
    updateImportItem(jobId, item.id, {
      sourcePath: workingSourcePath,
      state: 'DOWNLOADED'
    })
    if (tempDownloadDir) {
      await fs.rm(tempDownloadDir, { recursive: true, force: true })
      tempDownloadDir = null
    }
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
      detectedType: detectedType,
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
