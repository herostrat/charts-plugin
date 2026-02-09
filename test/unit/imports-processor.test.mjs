import { expect } from 'chai'
import {
  createImportJob,
  getImportJob,
  resetImportStore
} from '../../src/imports/store.ts'
import { enqueueImportJob } from '../../src/imports/processor.ts'
import { clearChartsStorageLayout } from '../../src/imports/storage.ts'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const waitForJob = async (jobId, predicate, timeoutMs = 500) => {
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

describe('Imports processor', () => {
  beforeEach(() => {
    resetImportStore()
    clearChartsStorageLayout()
  })
  afterEach(() => {
    resetImportStore()
    clearChartsStorageLayout()
  })

  it('fails when no source is provided', async () => {
    const job = createImportJob([
      {
        filename: 'missing-source.tif',
        detectedType: 'geotiff'
      }
    ])

    enqueueImportJob(job.id)
    const updated = await waitForJob(job.id, (j) => j.state === 'FAILED')

    expect(updated.items[0].state).to.equal('FAILED')
    expect(updated.items[0].errors[0]).to.match(/Missing source/)
  })

  it('completes stream items without conversion', async () => {
    const job = createImportJob([
      {
        filename: 'stream',
        detectedType: 'unknown',
        streamUrl: 'https://example.com/service',
        streamType: 'wms'
      }
    ])

    enqueueImportJob(job.id)
    const updated = await waitForJob(job.id, (j) => j.state === 'COMPLETED')

    expect(updated.items[0].state).to.equal('AVAILABLE')
    expect(updated.items[0].output).to.equal('https://example.com/service')
  })

  it('fails conversion when unsupported', async () => {
    const job = createImportJob([
      {
        filename: 'charts.mbtiles',
        detectedType: 'mbtiles',
        sourcePath: '/tmp/charts.mbtiles',
        convert: { target: 'pmtiles', format: 'png', maxZoom: 5 }
      }
    ])

    enqueueImportJob(job.id)
    const updated = await waitForJob(job.id, (j) => j.state === 'FAILED')

    expect(updated.items[0].state).to.equal('FAILED')
    expect(updated.items[0].errors[0]).to.match(/Conversion not supported/)
  })
})
