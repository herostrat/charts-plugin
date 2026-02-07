import { expect } from 'chai'
import { request as chaiRequest } from 'chai-http'
import { registerStyleRoutes } from '../../src/resources/style-routes.ts'
import { createTestServer } from '../helpers/test-server.mjs'

const createProvider = (overrides = {}) => ({
  identifier: 'test-vector',
  name: 'Test Vector',
  description: 'Vector chart',
  type: 'tilelayer',
  scale: 250000,
  format: 'pbf',
  minzoom: 2,
  maxzoom: 8,
  v2: {
    url: '/signalk/chart-tiles/test-vector/{z}/{x}/{y}',
    layers: ['DEPARE', 'LNDARE']
  },
  ...overrides
})

describe('registerStyleRoutes', () => {
  it('returns 404 for missing or non-vector providers', async () => {
    const { app, server } = await createTestServer()
    const providers = {
      raster: createProvider({ identifier: 'raster', format: 'png' })
    }

    registerStyleRoutes({
      app,
      getProviders: () => providers,
      getCatalogChoice: () => 's52',
      defaultCatalogId: 's52'
    })

    const baseUrl = `http://localhost:${server.address().port}`
    const response = await chaiRequest.execute(baseUrl).get('/signalk/chart-style/missing')
      .catch((e) => e.response)

    expect(response.status).to.equal(404)

    const rasterResponse = await chaiRequest.execute(baseUrl).get('/signalk/chart-style/raster')
      .catch((e) => e.response)
    expect(rasterResponse.status).to.equal(404)

    server.close()
  })

  it('returns a style for vector providers', async () => {
    const { app, server } = await createTestServer()
    const providers = {
      'test-vector': createProvider()
    }

    registerStyleRoutes({
      app,
      getProviders: () => providers,
      getCatalogChoice: () => 'none',
      defaultCatalogId: 's52'
    })

    const baseUrl = `http://localhost:${server.address().port}`
    const response = await chaiRequest.execute(baseUrl).get('/signalk/chart-style/test-vector')

    expect(response.status).to.equal(200)
    expect(response.body).to.have.property('sources')
    expect(response.body.sources).to.have.property('charts-vector')
    expect(response.body).to.have.property('layers')

    server.close()
  })
})
