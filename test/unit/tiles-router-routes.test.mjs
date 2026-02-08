import { expect } from 'chai'
import { request as chaiRequest } from 'chai-http'
import { registerTileRoutes } from '../../src/tiles/routes.ts'
import { ChartSeedingManager } from '../../src/cache/chart-downloader.ts'
import { ChartDownloader } from '../../src/cache/chart-downloader.ts'
import { createTestServer } from '../helpers/test-server.mjs'

const makeProvider = (overrides = {}) => ({
  identifier: 'test',
  name: 'Test',
  description: 'Test',
  type: 'tilelayer',
  scale: 1,
  format: 'png',
  _filePath: '/tmp',
  _fileFormat: 'unknown',
  ...overrides
})

describe('registerTileRoutes handlers', () => {
  let app
  let server
  let baseUrl

  beforeEach(async () => {
    const setup = await createTestServer()
    app = setup.app
    app.resourcesApi = { getResource: async () => ({}) }
    server = setup.server
    baseUrl = `http://localhost:${server.address().port}`
  })

  afterEach(() => {
    server.close()
    ChartSeedingManager.ActiveJobs = {}
  })

  it('returns 404 for invalid tile params', async () => {
    registerTileRoutes({
      app,
      getProviders: () => ({ test: makeProvider() }),
      getCachePath: () => '/tmp'
    })

    const response = await chaiRequest.execute(baseUrl)
      .get('/signalk/chart-tiles/test/a/b/c')
      .catch((e) => e.response)

    expect(response.status).to.equal(404)
  })

  it('returns 500 for unknown file formats', async () => {
    registerTileRoutes({
      app,
      getProviders: () => ({ test: makeProvider() }),
      getCachePath: () => '/tmp'
    })

    const response = await chaiRequest.execute(baseUrl)
      .get('/signalk/chart-tiles/test/4/5/6')
      .catch((e) => e.response)

    expect(response.status).to.equal(500)
  })

  it('returns 404 for missing providers', async () => {
    registerTileRoutes({
      app,
      getProviders: () => ({}),
      getCachePath: () => '/tmp'
    })

    const response = await chaiRequest.execute(baseUrl)
      .get('/signalk/chart-tiles/missing/4/5/6')
      .catch((e) => e.response)

    expect(response.status).to.equal(404)
  })

  it('uses proxy tile fetch for proxy providers', async () => {
    const original = ChartDownloader.getTileFromCacheOrRemote
    ChartDownloader.getTileFromCacheOrRemote = async () => Buffer.from('proxy')

    registerTileRoutes({
      app,
      getProviders: () => ({
        test: makeProvider({ proxy: true, _fileFormat: 'directory' })
      }),
      getCachePath: () => '/tmp'
    })

    const response = await chaiRequest.execute(baseUrl)
      .get('/signalk/chart-tiles/test/1/2/3')

    expect(response.status).to.equal(200)

    ChartDownloader.getTileFromCacheOrRemote = original
  })

  it('handles cache job creation validation', async () => {
    registerTileRoutes({
      app,
      getProviders: () => ({ test: makeProvider({ _fileFormat: 'directory' }) }),
      getCachePath: () => '/tmp'
    })

    const missingMaxZoom = await chaiRequest.execute(baseUrl)
      .post('/signalk/chart-tiles/cache/test')
      .send({})
      .catch((e) => e.response)
    expect(missingMaxZoom.status).to.equal(400)

    const originalCreateJob = ChartSeedingManager.createJob
    let called = false
    ChartSeedingManager.createJob = async () => {
      called = true
    }

    const okResponse = await chaiRequest.execute(baseUrl)
      .post('/signalk/chart-tiles/cache/test')
      .send({ maxZoom: '5' })
    expect(okResponse.status).to.equal(200)
    expect(called).to.equal(true)

    ChartSeedingManager.createJob = originalCreateJob
  })

  it('handles cache job actions', async () => {
    registerTileRoutes({
      app,
      getProviders: () => ({ test: makeProvider({ _fileFormat: 'directory' }) }),
      getCachePath: () => '/tmp'
    })

    ChartSeedingManager.ActiveJobs = {
      1: {
        info: () => ({ id: 1 }),
        seedCache: () => undefined,
        cancelJob: () => undefined,
        deleteCache: () => undefined
      }
    }

    const listResponse = await chaiRequest.execute(baseUrl)
      .get('/signalk/chart-tiles/cache/jobs')
    expect(listResponse.status).to.equal(200)
    expect(listResponse.body).to.be.an('array')

    const startResponse = await chaiRequest.execute(baseUrl)
      .post('/signalk/chart-tiles/cache/jobs/1')
      .send({ action: 'start' })
    expect(startResponse.status).to.equal(200)

    const stopResponse = await chaiRequest.execute(baseUrl)
      .post('/signalk/chart-tiles/cache/jobs/1')
      .send({ action: 'stop' })
    expect(stopResponse.status).to.equal(200)

    const deleteResponse = await chaiRequest.execute(baseUrl)
      .post('/signalk/chart-tiles/cache/jobs/1')
      .send({ action: 'delete' })
    expect(deleteResponse.status).to.equal(200)

    const removeResponse = await chaiRequest.execute(baseUrl)
      .post('/signalk/chart-tiles/cache/jobs/1')
      .send({ action: 'remove' })
    expect(removeResponse.status).to.equal(200)

    const invalidResponse = await chaiRequest.execute(baseUrl)
      .post('/signalk/chart-tiles/cache/jobs/1')
      .send({ action: 'invalid' })
      .catch((e) => e.response)
    expect(invalidResponse.status).to.equal(404)
  })
})
