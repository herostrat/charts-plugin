import { expect } from 'chai'
import {
  registerResourcesProvider,
  validateVectorProviders
} from '../../src/resources/registry.ts'

const makeProvider = (overrides = {}) => ({
  identifier: 'vec',
  name: 'Vector Chart',
  description: 'Vector',
  type: 'tilelayer',
  scale: 250000,
  format: 'pbf',
  v1: { tilemapUrl: '~tilePath~/vec/{z}/{x}/{y}', chartLayers: [] },
  v2: { url: '~tilePath~/vec/{z}/{x}/{y}', layers: [] },
  _filePath: '/tmp/vec',
  _fileFormat: 'mbtiles',
  _mbtilesHandle: {},
  _flipY: false,
  ...overrides
})

describe('registerResourcesProvider', () => {
  it('registers list/get handlers and sanitizes providers', async () => {
    let registered = null
    const app = {
      debug: () => undefined,
      registerResourceProvider: (provider) => {
        registered = provider
      }
    }

    registerResourcesProvider(app, () => ({ vec: makeProvider() }))

    const list = await registered.methods.listResources({})
    expect(list).to.have.lengthOf(1)
    expect(list[0]).to.have.property('identifier', 'vec')
    expect(list[0]).to.have.property('type', 'mapstyleJSON')
    expect(list[0].url).to.include('/signalk/chart-style/vec')

    const item = await registered.methods.getResource('vec')
    expect(item).to.have.property('identifier', 'vec')
  })

  it('throws on missing resource and set/delete operations', async () => {
    let registered = null
    const app = {
      debug: () => undefined,
      registerResourceProvider: (provider) => {
        registered = provider
      }
    }

    registerResourcesProvider(app, () => ({}))

    try {
      await registered.methods.getResource('missing')
      throw new Error('Expected getResource to throw')
    } catch (err) {
      expect(err.message).to.equal('Chart not found!')
    }

    try {
      registered.methods.setResource('vec', { ok: true })
      throw new Error('Expected setResource to throw')
    } catch (err) {
      expect(err.message).to.include('Not implemented!')
    }

    try {
      registered.methods.deleteResource('vec')
      throw new Error('Expected deleteResource to throw')
    } catch (err) {
      expect(err.message).to.include('Not implemented!')
    }
  })

  it('handles registerResourceProvider failures', () => {
    let logged = false
    const app = {
      debug: () => {
        logged = true
      },
      registerResourceProvider: () => {
        throw new Error('boom')
      }
    }

    expect(() => registerResourcesProvider(app, () => ({}))).to.not.throw()
    expect(logged).to.equal(true)
  })
})

describe('validateVectorProviders', () => {
  it('warns when vector providers have no layers', () => {
    let message = ''
    const app = { debug: (msg) => { message = msg } }
    validateVectorProviders({ vec: makeProvider({ v1: { chartLayers: [] }, v2: undefined }) }, app)
    expect(message).to.include('no vector_layers')
  })

  it('skips non-vector providers', () => {
    let called = false
    const app = { debug: () => { called = true } }
    validateVectorProviders({ raster: makeProvider({ format: 'png' }) }, app)
    expect(called).to.equal(false)
  })
})
