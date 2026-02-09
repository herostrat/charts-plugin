import { expect } from 'chai'
import { request as chaiRequest } from 'chai-http'
import { registerTileRoutes } from '../../src/tiles/routes.ts'
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
  })

  it('returns 404 for invalid tile params', async () => {
    registerTileRoutes({
      app,
      getProviders: () => ({ test: makeProvider() }),
      getCachePath: () => '/tmp'
    })

    const response = await chaiRequest
      .execute(baseUrl)
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

    const response = await chaiRequest
      .execute(baseUrl)
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

    const response = await chaiRequest
      .execute(baseUrl)
      .get('/signalk/chart-tiles/missing/4/5/6')
      .catch((e) => e.response)

    expect(response.status).to.equal(404)
  })

  it('uses proxy tile fetch for proxy providers', async () => {
    const originalFetch = global.fetch
    global.fetch = async () => ({
      ok: true,
      arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer
    })

    registerTileRoutes({
      app,
      getProviders: () => ({
        test: makeProvider({
          proxy: true,
          remoteUrl: 'https://example.com/{z}/{x}/{y}'
        })
      }),
      getCachePath: () => '/tmp'
    })

    const response = await chaiRequest
      .execute(baseUrl)
      .get('/signalk/chart-tiles/test/1/2/3')

    expect(response.status).to.equal(200)

    global.fetch = originalFetch
  })
})
