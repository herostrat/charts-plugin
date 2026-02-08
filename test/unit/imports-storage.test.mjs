import fs from 'fs'
import path from 'path'
import os from 'os'
import { expect } from 'chai'
import {
  createImportJob,
  getImportJob,
  resetImportStore
} from '../../src/imports/store.ts'
import { enqueueImportJob } from '../../src/imports/processor.ts'
import {
  buildChartsStorageLayout,
  ensureChartsStorageLayout,
  setChartsStorageLayout,
  clearChartsStorageLayout
} from '../../src/imports/storage.ts'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const waitForJob = async (jobId, predicate, timeoutMs = 1000) => {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const job = getImportJob(jobId)
    if (job && predicate(job)) {
      return job
    }
    await delay(10)
  }
  throw new Error('Timed out waiting for job state')
}

const createTempDir = () =>
  fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'charts-storage-'))

describe('Imports storage pipeline', () => {
  beforeEach(() => {
    resetImportStore()
    clearChartsStorageLayout()
  })
  afterEach(() => {
    resetImportStore()
    clearChartsStorageLayout()
  })

  it('writes metadata.json per bundle and moves to database', async () => {
    const tempRoot = createTempDir()
    const layout = buildChartsStorageLayout(tempRoot)
    ensureChartsStorageLayout(layout)
    setChartsStorageLayout(layout)

    const sourceDir = createTempDir()
    const sourcePath = path.join(sourceDir, 'sample.mbtiles')
    fs.writeFileSync(sourcePath, 'data')

    const job = createImportJob([
      {
        filename: 'sample.mbtiles',
        detectedType: 'mbtiles',
        sourcePath,
        metadata: {
          bounds: [1, 2, 3, 4],
          minZoom: 0,
          maxZoom: 5,
          updatedAt: new Date().toISOString(),
          format: 'png',
          description: 'test bundle'
        }
      }
    ])

    enqueueImportJob(job.id)
    const updated = await waitForJob(job.id, (j) => j.state === 'COMPLETED' || j.state === 'AVAILABLE')

    const bundleId = `${job.id}-${updated.items[0].id}`
    const databaseDir = path.join(layout.databaseDir, bundleId)
    const metadataPath = path.join(databaseDir, 'metadata.json')
    const dataPath = path.join(databaseDir, 'sample.mbtiles')

    expect(fs.existsSync(metadataPath)).to.equal(true)
    expect(fs.existsSync(dataPath)).to.equal(true)
    expect(updated.items[0].output).to.equal(databaseDir)
  })

  it('marks items as METADATA_FAILED when metadata is missing', async () => {
    const sourceDir = createTempDir()
    const sourcePath = path.join(sourceDir, 'bad.tif')
    fs.writeFileSync(sourcePath, 'data')

    const job = createImportJob([
      {
        filename: 'bad.tif',
        detectedType: 'geotiff',
        sourcePath
      }
    ])

    enqueueImportJob(job.id)
    const updated = await waitForJob(job.id, (j) => j.items[0].state === 'METADATA_FAILED')
    expect(updated.items[0].state).to.equal('METADATA_FAILED')
  })
})
