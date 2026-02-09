import { expect } from 'chai'
import { request as chaiRequest } from 'chai-http'
import { registerCacheRoutes } from '../../src/web/cache/routes.ts'
import { TileSeedingManager } from '../../src/cache/tile-seeder.ts'
import { createTestServer } from '../helpers/test-server.mjs'

const makeProvider = (overrides = {}) => ({
  identifier: 'test',
  name: 'Test',
  description: 'Test',
  type: 'tilelayer',
  scale: 1,
  format: 'png',
  _filePath: '/tmp',
  _fileFormat: 'directory',
  ...overrides
})

describe('registerCacheRoutes handlers', () => {
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
    TileSeedingManager.ActiveJobs = {}
  })

  it('validates seeding requests', async () => {
    registerCacheRoutes({
      app,
      getProviders: () => ({ test: makeProvider() }),
      getCachePath: () => '/tmp'
    })

    const missingMaxZoom = await chaiRequest
      .execute(baseUrl)
      .post('/@signalk/charts-plugin/cache/seed/test')
      .send({})
      .catch((e) => e.response)
    expect(missingMaxZoom.status).to.equal(400)

    const originalCreateJob = TileSeedingManager.createJob
    let called = false
    TileSeedingManager.createJob = async () => {
      called = true
    }

    const okResponse = await chaiRequest
      .execute(baseUrl)
      .post('/@signalk/charts-plugin/cache/seed/test')
      .send({ maxZoom: '5' })
    expect(okResponse.status).to.equal(200)
    expect(called).to.equal(true)

    TileSeedingManager.createJob = originalCreateJob
  })

  it('handles cache job actions', async () => {
    registerCacheRoutes({
      app,
      getProviders: () => ({ test: makeProvider() }),
      getCachePath: () => '/tmp'
    })

    TileSeedingManager.ActiveJobs = {
      1: {
        info: () => ({ id: 1 }),
        seedCache: () => undefined,
        cancelJob: () => undefined,
        deleteCache: () => undefined
      }
    }

    const listResponse = await chaiRequest
      .execute(baseUrl)
      .get('/@signalk/charts-plugin/cache/jobs')
    expect(listResponse.status).to.equal(200)
    expect(listResponse.body).to.be.an('array')

    const startResponse = await chaiRequest
      .execute(baseUrl)
      .post('/@signalk/charts-plugin/cache/jobs/1')
      .send({ action: 'start' })
    expect(startResponse.status).to.equal(200)

    const stopResponse = await chaiRequest
      .execute(baseUrl)
      .post('/@signalk/charts-plugin/cache/jobs/1')
      .send({ action: 'stop' })
    expect(stopResponse.status).to.equal(200)

    const deleteResponse = await chaiRequest
      .execute(baseUrl)
      .post('/@signalk/charts-plugin/cache/jobs/1')
      .send({ action: 'delete' })
    expect(deleteResponse.status).to.equal(200)

    const removeResponse = await chaiRequest
      .execute(baseUrl)
      .post('/@signalk/charts-plugin/cache/jobs/1')
      .send({ action: 'remove' })
    expect(removeResponse.status).to.equal(200)

    const invalidResponse = await chaiRequest
      .execute(baseUrl)
      .post('/@signalk/charts-plugin/cache/jobs/1')
      .send({ action: 'invalid' })
      .catch((e) => e.response)
    expect(invalidResponse.status).to.equal(404)
  })
})
