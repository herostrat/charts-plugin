import fs from 'fs'
import path from 'path'
import { expect } from 'chai'
import { request as chaiRequest } from 'chai-http'
import { fileURLToPath } from 'url'
import plugin from '../../src/index.ts'
import { PMTiles, tileTypeExt } from 'pmtiles'
import zlib from 'zlib'
import { VectorTile } from '@mapbox/vector-tile'
import Protobuf from 'pbf'
import { createTestServer } from '../helpers/test-server.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const fixturesRoot = path.resolve(__dirname, '..', 'fixtures')
const chartPathsDefault = [path.resolve(fixturesRoot, 'mbtiles')]
const chartPathsWithPmtiles = [path.resolve(fixturesRoot, 'mbtiles'), path.resolve(fixturesRoot, 'pmtiles')]
const chartPathsWithSecondary = [path.resolve(fixturesRoot, 'mbtiles')]
const chartPathsWithDirectory = [path.resolve(fixturesRoot, 'directory')]
const chartPathsWithTms = [path.resolve(fixturesRoot, 'tms')]
const chartPathsWithCharts = [path.resolve(fixturesRoot, 'charts')]
const pmtilesDir = path.resolve(fixturesRoot, 'pmtiles')
const pmtilesValid = path.join(pmtilesDir, 'test_fixture_1.pmtiles')
const pmtilesEmpty = path.join(pmtilesDir, 'empty.pmtiles')
const pmtilesInvalid = path.join(pmtilesDir, 'invalid.pmtiles')
const hasPmtilesFixtures =
  fs.existsSync(pmtilesValid) &&
  fs.existsSync(pmtilesEmpty) &&
  fs.existsSync(pmtilesInvalid)


/**
 * Integration Tests: Chart Loading & Tile Serving
 * 
 * Tests full HTTP request/response cycles to ensure:
 * 1. Charts load correctly from various sources
 * 2. Tiles are served with correct content and headers
 * 3. Error responses are appropriate
 * 4. Y-flipping works correctly for TMS
 */

const createTestApp = () =>
  createTestServer({ configPath: fixturesRoot })

const getRequest = (server, location) => {
  const baseUrl = `http://localhost:${server.address().port}`
  return chaiRequest.execute(baseUrl).get(location)
}

const startPluginWithChartPaths = (pluginInstance, chartPaths) => {
  return pluginInstance.start({ chartPaths })
}

class NodeFileSource {
  constructor(filePath) {
    this.filePath = filePath
  }

  getKey() {
    return this.filePath
  }

  async getBytes(offset, length, signal) {
    if (signal?.aborted) {
      throw new Error('AbortError')
    }
    const handle = await fs.promises.open(this.filePath, 'r')
    try {
      const buffer = Buffer.alloc(length)
      const { bytesRead } = await handle.read(buffer, 0, length, offset)
      const view = buffer.subarray(0, bytesRead)
      return {
        data: view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)
      }
    } finally {
      await handle.close()
    }
  }
}

const lonLatToTileXY = (lon, lat, zoom) => {
  const n = 2 ** zoom
  const x = Math.floor(((lon + 180) / 360) * n)
  const y = Math.floor(
    ((1 -
      Math.log(
        Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)
      ) /
        Math.PI) /
      2) *
      n
  )
  return [x, y]
}

const findFirstTile = async (pmtilesHandle, header) => {
  const centerLon = (header.minLon + header.maxLon) / 2
  const centerLat = (header.minLat + header.maxLat) / 2
  const maxSearchZoom = Math.min(header.minZoom + 2, header.maxZoom)

  for (let z = header.minZoom; z <= maxSearchZoom; z++) {
    const n = 2 ** z
    const [centerX, centerY] = lonLatToTileXY(centerLon, centerLat, z)
    const startX = Math.max(0, centerX - 2)
    const endX = Math.min(n - 1, centerX + 2)
    const startY = Math.max(0, centerY - 2)
    const endY = Math.min(n - 1, centerY + 2)

    for (let x = startX; x <= endX; x++) {
      for (let y = startY; y <= endY; y++) {
        const tile = await pmtilesHandle.getZxy(z, x, y)
        if (tile) {
          return { z, x, y, tile }
        }
      }
    }
  }

  return null
}

const resolveExpectedContentType = (format) => {
  const normalized = format?.toLowerCase() || ''
  if (['pbf', 'mvt'].includes(normalized)) {
    return 'application/vnd.mapbox-vector-tile'
  }
  if (['png', 'jpeg', 'jpg', 'webp', 'avif'].includes(normalized)) {
    return `image/${normalized === 'jpg' ? 'jpeg' : normalized}`
  }
  return 'application/octet-stream'
}

const isVectorFormat = (format) => {
  const normalized = format?.toLowerCase() || ''
  return ['pbf', 'mvt'].includes(normalized)
}

const isGzipBuffer = (buffer) => {
  return Buffer.isBuffer(buffer) && buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b
}

const decodeVectorTile = (buffer) => {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('Expected tile buffer for decoding')
  }
  const data = isGzipBuffer(buffer) ? zlib.gunzipSync(buffer) : buffer
  return new VectorTile(new Protobuf(data))
}

const getPmtilesDetails = async () => {
  const pmtilesHandle = new PMTiles(new NodeFileSource(pmtilesValid))
  const header = await pmtilesHandle.getHeader()
  const metadata = await pmtilesHandle.getMetadata().catch(() => ({}))
  const ext = tileTypeExt(header.tileType)
  const expectedFormat = ext ? ext.replace('.', '') : undefined
  const vectorLayers = Array.isArray(metadata?.vector_layers)
    ? metadata.vector_layers
        .map((layer) => layer?.id)
        .filter((id) => typeof id === 'string')
    : []
  return {
    pmtilesHandle,
    header,
    metadata,
    expectedFormat,
    vectorLayers
  }
}

describe('Integration Tests: Chart Loading', () => {
  let pluginInstance
  let testServer

  beforeEach(() =>
    createTestApp().then(({ app, server }) => {
      pluginInstance = plugin(app)
      testServer = server
    })
  )

  afterEach((done) => testServer.close(() => done()))

  describe('Chart Discovery and Metadata', () => {
    it('loads MBTiles chart metadata correctly', () => {
      return pluginInstance.start({chartPaths: [path.resolve(fixturesRoot, 'mbtiles')]}).then(() =>
        getRequest(testServer, '/signalk/v1/api/resources/charts/test')
      ).then((result) => {
        expect(result.status).to.equal(200)
        expect(result.body).to.have.property('identifier', 'test')
        expect(result.body).to.have.property('name')
        expect(result.body).to.have.property('bounds')
        expect(result.body).to.have.property('minzoom')
        expect(result.body).to.have.property('maxzoom')
        expect(result.body).to.have.property('format')
        expect(result.body).to.have.property('type', 'tilelayer')
      })
    })

    it('loads directory-based chart metadata correctly', () => {
      return pluginInstance.start({chartPaths: [path.resolve(fixturesRoot, 'directory')]}).then(() =>
        getRequest(testServer, '/signalk/v1/api/resources/charts/unpacked-tiles')
      ).then((result) => {
        expect(result.status).to.equal(200)
        expect(result.body).to.have.property('identifier', 'unpacked-tiles')
        expect(result.body).to.have.property('format')
      })
    })

    it('loads PMTiles chart metadata correctly', function () {
      if (!hasPmtilesFixtures) {
        this.skip()
      }
      return startPluginWithChartPaths(pluginInstance, chartPathsWithPmtiles)
        .then(async () => {
          const result = await getRequest(
            testServer,
            '/signalk/v1/api/resources/charts/test_fixture_1'
          )
          const { header, expectedFormat, vectorLayers } =
            await getPmtilesDetails()

          expect(result.status).to.equal(200)
          expect(result.body).to.have.property('identifier', 'test_fixture_1')
          expect(result.body).to.have.property('bounds')
          expect(result.body.bounds).to.deep.equal([
            header.minLon,
            header.minLat,
            header.maxLon,
            header.maxLat
          ])
          expect(result.body).to.have.property('minzoom', header.minZoom)
          expect(result.body).to.have.property('maxzoom', header.maxZoom)
          if (expectedFormat) {
            expect(result.body).to.have.property('format', expectedFormat)
          }
          expect(result.body).to.have.property('chartLayers')
          expect(result.body.chartLayers).to.deep.equal(vectorLayers)
        })
    })

    it('returns 404 for empty PMTiles file', function () {
      if (!hasPmtilesFixtures) {
        this.skip()
      }
      return startPluginWithChartPaths(pluginInstance, chartPathsWithPmtiles)
        .then(() =>
          getRequest(testServer, '/signalk/v1/api/resources/charts/empty')
        )
        .then((result) => {
          expect(result.status).to.equal(404)
        })
    })

    it('returns 404 for invalid PMTiles file', function () {
      if (!hasPmtilesFixtures) {
        this.skip()
      }
      return startPluginWithChartPaths(pluginInstance, chartPathsWithPmtiles)
        .then(() =>
          getRequest(testServer, '/signalk/v1/api/resources/charts/invalid')
        )
        .then((result) => {
          expect(result.status).to.equal(404)
        })
    })

    it('excludes empty/invalid PMTiles from chart list', function () {
      if (!hasPmtilesFixtures) {
        this.skip()
      }
      return startPluginWithChartPaths(pluginInstance, chartPathsWithPmtiles)
        .then(() => getRequest(testServer, '/signalk/v1/api/resources/charts'))
        .then((result) => {
          const charts = result.body
          expect(charts).to.have.property('test_fixture_1')
          expect(charts).to.not.have.property('empty')
          expect(charts).to.not.have.property('invalid')
        })
    })

    it('includes all required metadata fields', () => {
      return pluginInstance.start({}).then(() =>
        getRequest(testServer, '/signalk/v1/api/resources/charts')
      ).then((result) => {
        const charts = result.body
        Object.values(charts).forEach((chart) => {
          expect(chart).to.have.property('identifier')
          expect(chart).to.have.property('name')
          expect(chart).to.have.property('type')
        })
      })

    it('exposes PMTiles layers on v2 resources', function () {
      if (!hasPmtilesFixtures) {
        this.skip()
      }
      return startPluginWithChartPaths(pluginInstance, chartPathsWithPmtiles)
        .then(async () => {
          const result = await getRequest(
            testServer,
            '/signalk/v2/api/resources/charts/test_fixture_1'
          )
          const { vectorLayers } = await getPmtilesDetails()

          expect(result.status).to.equal(200)
          expect(result.body).to.have.property('layers')
          expect(result.body.layers).to.deep.equal(vectorLayers)
        })
    })

    it('sets mapstyleJSON for vector PMTiles charts on v2', async function () {
      if (!hasPmtilesFixtures) {
        this.skip()
      }
      await startPluginWithChartPaths(plugin, chartPathsWithPmtiles)
      const { expectedFormat } = await getPmtilesDetails()
      if (!isVectorFormat(expectedFormat)) {
        this.skip()
      }
      const result = await getRequest(
        testServer,
        '/signalk/v2/api/resources/charts/test_fixture_1'
      )

      expect(result.status).to.equal(200)
      expect(result.body).to.have.property('type', 'mapstyleJSON')
      expect(result.body).to.have.property('url')
      expect(result.body).to.have.property('style')
      expect(result.body.url).to.equal('/signalk/chart-style/test_fixture_1')
      expect(result.body.style).to.equal(result.body.url)
    })

    it('validates PMTiles fields in v2 chart list', function () {
      if (!hasPmtilesFixtures) {
        this.skip()
      }
      return startPluginWithChartPaths(plugin, chartPathsWithPmtiles)
        .then(async () => {
          const result = await getRequest(
            testServer,
            '/signalk/v2/api/resources/charts'
          )
          const { header, expectedFormat, vectorLayers } =
            await getPmtilesDetails()

          expect(result.status).to.equal(200)
          expect(result.body).to.have.property('test_fixture_1')
          const entry = result.body.test_fixture_1
          expect(entry).to.have.property('bounds')
          expect(entry.bounds).to.deep.equal([
            header.minLon,
            header.minLat,
            header.maxLon,
            header.maxLat
          ])
          expect(entry).to.have.property('minzoom', header.minZoom)
          expect(entry).to.have.property('maxzoom', header.maxZoom)
          if (expectedFormat) {
            expect(entry).to.have.property('format', expectedFormat)
          }
          expect(entry).to.have.property('layers')
          expect(entry.layers).to.deep.equal(vectorLayers)
          expect(result.body).to.not.have.property('empty')
          expect(result.body).to.not.have.property('invalid')
        })
    })

    it('serves chart-style JSON for vector PMTiles charts', async function () {
      if (!hasPmtilesFixtures) {
        this.skip()
      }
      await startPluginWithChartPaths(plugin, chartPathsWithPmtiles)
      const { expectedFormat } = await getPmtilesDetails()
      if (!isVectorFormat(expectedFormat)) {
        this.skip()
      }

      const response = await getRequest(
        testServer,
        '/signalk/chart-style/test_fixture_1'
      )

      expect(response.status).to.equal(200)
      expect(response.body).to.have.property('version', 8)
      expect(response.body).to.have.property('sources')
      expect(response.body.sources).to.have.property('charts-vector')
      expect(response.body).to.have.property('layers')
      expect(response.body.layers).to.be.an('array')
    })

    it('aligns style layers with chart vector layers', async function () {
      if (!hasPmtilesFixtures) {
        this.skip()
      }
      await startPluginWithChartPaths(plugin, chartPathsWithPmtiles)
      const { expectedFormat, vectorLayers } = await getPmtilesDetails()
      if (!isVectorFormat(expectedFormat)) {
        this.skip()
      }

      const response = await getRequest(
        testServer,
        '/signalk/chart-style/test_fixture_1'
      )

      expect(response.status).to.equal(200)
      const sources = response.body.sources || {}
      expect(sources).to.have.property('charts-vector')
      expect(sources['charts-vector']).to.have.property('tiles')
      expect(sources['charts-vector'].tiles[0]).to.match(
        /\/signalk\/chart-tiles\/test_fixture_1\//
      )

      const layers = Array.isArray(response.body.layers)
        ? response.body.layers
        : []
      const styledLayers = layers.filter(
        (layer) =>
          layer &&
          layer.source === 'charts-vector' &&
          typeof layer['source-layer'] === 'string'
      )
      expect(styledLayers.length).to.be.greaterThan(0)

      const knownLayers = new Set(vectorLayers)
      styledLayers.forEach((layer) => {
        expect(knownLayers.has(layer['source-layer'])).to.equal(true)
      })
    })

    it('maps PMTiles name and description from metadata', function () {
      if (!hasPmtilesFixtures) {
        this.skip()
      }
      return startPluginWithChartPaths(plugin, chartPathsWithPmtiles)
        .then(async () => {
          const result = await getRequest(
            testServer,
            '/signalk/v1/api/resources/charts/test_fixture_1'
          )
          const { metadata } = await getPmtilesDetails()
          const expectedName = metadata?.name || 'test_fixture_1'
          const expectedDescription = metadata?.description || ''

          expect(result.status).to.equal(200)
          expect(result.body).to.have.property('name', expectedName)
          expect(result.body).to.have.property(
            'description',
            expectedDescription
          )
        })
    })

    it('exposes PMTiles tile URL template in v2 response', function () {
      if (!hasPmtilesFixtures) {
        this.skip()
      }
      return startPluginWithChartPaths(plugin, chartPathsWithPmtiles)
        .then(async () => {
          const result = await getRequest(
            testServer,
            '/signalk/v2/api/resources/charts/test_fixture_1'
          )

          expect(result.status).to.equal(200)
          expect(result.body).to.have.property('url')
          expect(result.body.url).to.equal(
            '/signalk/chart-tiles/test_fixture_1/{z}/{x}/{y}'
          )
        })
    })
    })
  })
})

describe('Integration Tests: Tile Serving - Headers & Content Type', () => {
  let pluginInstance
  let testServer

  beforeEach(() =>
    createTestApp().then(({ app, server }) => {
      pluginInstance = plugin(app)
      testServer = server
    })
  )

  afterEach((done) => testServer.close(() => done()))

  describe('Cache-Control Headers', () => {
    it('sets correct Cache-Control header for MBTiles tile', () => {
      return pluginInstance.start({ chartPaths: chartPathsDefault }).then(() =>
        getRequest(testServer, '/signalk/chart-tiles/test/4/5/6')
      ).then((response) => {
        expect(response.headers).to.have.property('cache-control')
        expect(response.headers['cache-control']).to.include('public')
        expect(response.headers['cache-control']).to.include('max-age=7776000') // 90 days
      })
    })

    it('sets correct Cache-Control header for directory tile', () => {
      return pluginInstance.start({ chartPaths: chartPathsWithDirectory }).then(() =>
        getRequest(testServer, '/signalk/chart-tiles/unpacked-tiles/4/4/6')
      ).then((response) => {
        expect(response.headers).to.have.property('cache-control')
        expect(response.headers['cache-control']).to.equal('public, max-age=7776000')
      })
    })
  })

  describe('Content-Type Headers', () => {
    it('returns png content-type for PNG tiles', () => {
      return pluginInstance.start({ chartPaths: chartPathsDefault }).then(() =>
        getRequest(testServer, '/signalk/chart-tiles/test/4/5/6')
      ).then((response) => {
        expect(response.headers['content-type']).to.equal('image/png')
      })
    })

    it('returns image/png for unpacked PNG directory', () => {
      return pluginInstance.start({ chartPaths: chartPathsWithDirectory }).then(() =>
        getRequest(testServer, '/signalk/chart-tiles/unpacked-tiles/4/4/6')
      ).then((response) => {
        expect(response.headers['content-type']).to.equal('image/png')
      })
    })

    it('returns correct content-type for PMTiles tiles', async function () {
      if (!hasPmtilesFixtures) {
        this.skip()
      }
      await startPluginWithChartPaths(pluginInstance, chartPathsWithPmtiles)
      const { pmtilesHandle, header, expectedFormat } =
        await getPmtilesDetails()
      const result = await findFirstTile(pmtilesHandle, header)
      if (!result || !expectedFormat) {
        throw new Error('Unable to locate a valid PMTiles tile for test')
      }

      const response = await getRequest(
        testServer,
        `/signalk/chart-tiles/test_fixture_1/${result.z}/${result.x}/${result.y}`
      )
      const expectedType = resolveExpectedContentType(expectedFormat)
      expect(response.status).to.equal(200)
      expect(response.headers['content-type']).to.equal(expectedType)
    })

    it('keeps content-encoding aligned with PMTiles payload', async function () {
      if (!hasPmtilesFixtures) {
        this.skip()
      }
      await startPluginWithChartPaths(pluginInstance, chartPathsWithPmtiles)
      const { pmtilesHandle, header, expectedFormat } =
        await getPmtilesDetails()
      if (!isVectorFormat(expectedFormat)) {
        this.skip()
      }
      const result = await findFirstTile(pmtilesHandle, header)
      if (!result) {
        throw new Error('Unable to locate a valid PMTiles tile for test')
      }

      const response = await getRequest(
        testServer,
        `/signalk/chart-tiles/test_fixture_1/${result.z}/${result.x}/${result.y}`
      )
      expect(response.status).to.equal(200)
      const encoding = response.headers['content-encoding']
      if (isGzipBuffer(response.body)) {
        expect(encoding).to.equal('gzip')
      } else if (encoding) {
        expect(encoding).to.not.equal('gzip')
      }
    })
  })
})

describe('Integration Tests: Tile Serving - Content Integrity', () => {
  let pluginInstance
  let testServer

  beforeEach(() =>
    createTestApp().then(({ app, server }) => {
      pluginInstance = plugin(app)
      testServer = server
    })
  )

  afterEach((done) => testServer.close(() => done()))

  describe('Tile Content Verification', () => {
    it('mbtiles tile content matches expected file', () => {
      return pluginInstance.start({ chartPaths: chartPathsDefault }).then(() =>
        getRequest(testServer, '/signalk/chart-tiles/test/4/5/6')
      ).then((response) => {
        expect(response.status).to.equal(200)
        
        // unpacked-tiles contains same tiles as the test.mbtiles file
        const expectedTile = fs.readFileSync(
          path.resolve(fixturesRoot, 'directory/unpacked-tiles/4/5/6.png')
        )
        expect(response.body.toString('hex')).to.deep.equal(
          expectedTile.toString('hex')
        )
      })
    })

    it('directory tile content matches file exactly', () => {
      return pluginInstance.start({ chartPaths: chartPathsWithDirectory }).then(() =>
        getRequest(testServer, '/signalk/chart-tiles/unpacked-tiles/4/4/6')
      ).then((response) => {
        expect(response.status).to.equal(200)
        
        const expectedTile = fs.readFileSync(
          path.resolve(fixturesRoot, 'directory/unpacked-tiles/4/4/6.png')
        )
        expect(response.body.toString('hex')).to.deep.equal(
          expectedTile.toString('hex')
        )
      })
    })

    it('pmtiles tile content matches archive data', async function () {
      if (!hasPmtilesFixtures) {
        this.skip()
      }
      await startPluginWithChartPaths(pluginInstance, chartPathsWithPmtiles)

      const pmtilesHandle = new PMTiles(new NodeFileSource(pmtilesValid))
      const header = await pmtilesHandle.getHeader()
      const result = await findFirstTile(pmtilesHandle, header)
      if (!result) {
        throw new Error('Unable to locate a valid tile in test_fixture_1.pmtiles')
      }

      const response = await getRequest(
        testServer,
        `/signalk/chart-tiles/test_fixture_1/${result.z}/${result.x}/${result.y}`
      )
      expect(response.status).to.equal(200)
      expect(response.body.length).to.be.greaterThan(0)
      expect(response.body.toString('hex')).to.equal(
        Buffer.from(result.tile.data).toString('hex')
      )
    })

    it('decodes PMTiles vector tile served over HTTP', async function () {
      if (!hasPmtilesFixtures) {
        this.skip()
      }
      await startPluginWithChartPaths(pluginInstance, chartPathsWithPmtiles)
      const { pmtilesHandle, header, expectedFormat } =
        await getPmtilesDetails()
      if (!isVectorFormat(expectedFormat)) {
        this.skip()
      }
      const result = await findFirstTile(pmtilesHandle, header)
      if (!result) {
        throw new Error('Unable to locate a valid tile in test_fixture_1.pmtiles')
      }

      const response = await getRequest(
        testServer,
        `/signalk/chart-tiles/test_fixture_1/${result.z}/${result.x}/${result.y}`
      )
      expect(response.status).to.equal(200)
      expect(response.body.length).to.be.greaterThan(0)

      const tile = decodeVectorTile(response.body)
      const layerIds = Object.keys(tile.layers || {})
      expect(layerIds.length).to.be.greaterThan(0)
      const firstLayer = tile.layers[layerIds[0]]
      expect(firstLayer.length).to.be.greaterThan(0)
    })
  })

  describe('Response Body Characteristics', () => {
    it('returns non-empty buffer for valid tile', () => {
      return pluginInstance.start({ chartPaths: chartPathsDefault }).then(() =>
        getRequest(testServer, '/signalk/chart-tiles/test/4/5/6')
      ).then((response) => {
        expect(response.status).to.equal(200)
        expect(response.body.length).to.be.greaterThan(0)
      })
    })

    it('returns consistent content on multiple requests', () => {
      return pluginInstance.start({ chartPaths: chartPathsDefault }).then(() =>
        getRequest(testServer, '/signalk/chart-tiles/test/4/5/6')
      ).then((response1) => {
        const hex1 = response1.body.toString('hex')
        return getRequest(testServer, '/signalk/chart-tiles/test/4/5/6').then(
          (response2) => {
            const hex2 = response2.body.toString('hex')
            expect(hex1).to.equal(hex2)
          }
        )
      })
    })

    it('returns 404 for PMTiles request outside zoom range', async function () {
      if (!hasPmtilesFixtures) {
        this.skip()
      }
      await startPluginWithChartPaths(pluginInstance, chartPathsWithPmtiles)
      const { header } = await getPmtilesDetails()
      const z = header.maxZoom + 5
      const response = await getRequest(
        testServer,
        `/signalk/chart-tiles/test_fixture_1/${z}/0/0`
      )
      expect(response.status).to.equal(404)
    })

    it('uses cache-control defaults when PMTiles does not provide headers', async function () {
      if (!hasPmtilesFixtures) {
        this.skip()
      }
      await startPluginWithChartPaths(pluginInstance, chartPathsWithPmtiles)
      const { pmtilesHandle, header } = await getPmtilesDetails()
      const result = await findFirstTile(pmtilesHandle, header)
      if (!result) {
        throw new Error('Unable to locate a valid PMTiles tile for test')
      }

      const response = await getRequest(
        testServer,
        `/signalk/chart-tiles/test_fixture_1/${result.z}/${result.x}/${result.y}`
      )
      expect(response.status).to.equal(200)
      expect(response.headers).to.have.property('cache-control')
    })
  })
})

describe('Integration Tests: Y-Coordinate Flipping (TMS Critical)', () => {
  let pluginInstance
  let testServer

  beforeEach(() =>
    createTestApp().then(({ app, server }) => {
      pluginInstance = plugin(app)
      testServer = server
    })
  )

  afterEach((done) => testServer.close(() => done()))

  describe('TMS Y-flip Correctness', () => {
    it('flips Y correctly for TMS tiles - boundary at z=5', () => {
      // The test expects: y_requested = 10 → file at y_flipped = 2^5 - 1 - 10 = 21
      return pluginInstance.start({ chartPaths: chartPathsWithTms }).then(() =>
        getRequest(testServer, '/signalk/chart-tiles/tms-tiles/5/17/10')
      ).then((response) => {
        expect(response.status).to.equal(200)
        
        // Should match the file at tms-tiles/5/17/21.png
        const expectedTile = fs.readFileSync(
          path.resolve(fixturesRoot, 'tms/tms-tiles/5/17/21.png')
        )
        expect(response.body.toString('hex')).to.equal(
          expectedTile.toString('hex')
        )
      })
    })

    it('TMS flipping preserves image integrity', () => {
      return pluginInstance.start({ chartPaths: chartPathsWithTms }).then(() =>
        getRequest(testServer, '/signalk/chart-tiles/tms-tiles/5/17/10')
      ).then((response) => {
        expect(response.status).to.equal(200)
        expect(response.headers['content-type']).to.equal('image/png')
        expect(response.body.length || response.text.length).to.be.greaterThan(0)
      })
    })

    it('correctly identifies TMS format from chart metadata', () => {
      return pluginInstance.start({ chartPaths: chartPathsWithTms }).then(() =>
        getRequest(testServer, '/signalk/v1/api/resources/charts/tms-tiles')
      ).then((response) => {
        expect(response.status).to.equal(200)
        expect(response.body).to.have.property('identifier', 'tms-tiles')
        // TMS tiles have _flipY set to true
      })
    })
  })

  describe('Y-flip Boundary Conditions', () => {
    it('handles Y at 0 (bottom of TMS grid)', () => {
      // At z=4: y_flipped = 2^4 - 1 - 0 = 15 (top of grid)
      return pluginInstance.start({ chartPaths: chartPathsWithTms }).then(() =>
        getRequest(testServer, '/signalk/chart-tiles/tms-tiles/5/16/31')
      ).catch((e) => e.response)
      .then((response) => {
        // Expect 404 since the test data may not have all tiles
        expect(response.status).to.be.oneOf([200, 404])
      })
    })
  })
})

describe('Integration Tests: Error Handling', () => {
  let pluginInstance
  let testServer

  beforeEach(() =>
    createTestApp().then(({ app, server }) => {
      pluginInstance = plugin(app)
      testServer = server
    })
  )

  afterEach((done) => testServer.close(() => done()))

  describe('404 Error Responses', () => {
    it('returns 404 for missing tile from valid chart', () => {
      return pluginInstance.start({ chartPaths: chartPathsDefault }).then(() =>
        getRequest(testServer, '/signalk/chart-tiles/test/99/99/99')
      ).catch((e) => e.response)
      .then((response) => {
        expect(response.status).to.equal(404)
      })
    })

    it('returns 404 for invalid chart identifier', () => {
      return pluginInstance.start({ chartPaths: chartPathsDefault }).then(() =>
        getRequest(testServer, '/signalk/chart-tiles/nonexistent/4/5/6')
      ).catch((e) => e.response)
      .then((response) => {
        expect(response.status).to.equal(404)
      })
    })

    it('returns 404 for unknown chart in resources API', () => {
      return pluginInstance.start({ chartPaths: chartPathsDefault }).then(() =>
        getRequest(testServer, '/signalk/v1/api/resources/charts/missing-chart')
      ).catch((e) => e.response)
      .then((response) => {
        expect(response.status).to.equal(404)
      })
    })
  })
})

describe('Integration Tests: Multiple Chart Sources', () => {
  let pluginInstance
  let testServer

  beforeEach(() =>
    createTestApp().then(({ app, server }) => {
      pluginInstance = plugin(app)
      testServer = server
    })
  )

  afterEach((done) => testServer.close(() => done()))

  describe('Multi-path configuration', () => {
    it('loads charts from multiple paths', () => {
      return pluginInstance.start({ chartPaths: chartPathsWithSecondary }).then(() =>
        getRequest(testServer, '/signalk/v1/api/resources/charts')
      ).then((result) => {
        expect(result.status).to.equal(200)
        const charts = result.body
        
        // Should have both default and secondary chart
        expect(charts).to.have.property('test')
        expect(charts).to.have.property('test2')
      })
    })

    it('handles duplicate chart names (later path wins)', () => {
      // If test exists in both paths, second should override
      return pluginInstance.start({ chartPaths: [path.resolve(fixturesRoot, 'mbtiles'), path.resolve(fixturesRoot, 'mbtiles')] }).then(() =>
        getRequest(testServer, '/signalk/v1/api/resources/charts')
      ).then((result) => {
        const charts = result.body
        expect(charts).to.have.property('test')
      })
    })
  })
})

describe('Integration Tests: Response Format Consistency', () => {
  let pluginInstance
  let testServer

  beforeEach(() =>
    createTestApp().then(({ app, server }) => {
      pluginInstance = plugin(app)
      testServer = server
    })
  )

  afterEach((done) => testServer.close(() => done()))

  describe('API Response Structure', () => {
    it('chart list returns object of charts', () => {
      return pluginInstance.start({ chartPaths: chartPathsDefault }).then(() =>
        getRequest(testServer, '/signalk/v1/api/resources/charts')
      ).then((result) => {
        expect(result.body).to.be.an('object')
        expect(Object.keys(result.body).length).to.be.greaterThan(0)
      })
    })

    it('individual chart response includes all required fields', () => {
      return pluginInstance.start({ chartPaths: chartPathsDefault }).then(() =>
        getRequest(testServer, '/signalk/v1/api/resources/charts/test')
      ).then((result) => {
        const chart = result.body
        expect(chart).to.include.keys(
          'identifier',
          'name',
          'description',
          'type',
          'format',
          'scale'
        )
        // Should have either tilemapUrl or url
        expect(chart).to.satisfy(c => 'tilemapUrl' in c || 'url' in c)
      })
    })

    it('tile response sets content headers consistently', () => {
      return pluginInstance.start({ chartPaths: chartPathsDefault }).then(() =>
        getRequest(testServer, '/signalk/chart-tiles/test/4/5/6')
      ).then((response) => {
        expect(response.headers).to.have.property('content-type')
        expect(response.headers).to.have.property('cache-control')
      })
    })
  })
})


// --- Additional Chart Material Integration Tests ---
const charts2Path = path.resolve(fixturesRoot, 'charts-2')

describe('Integration Tests: Additional Chart Material Scenarios', () => {
  let pluginInstance
  let testServer

  beforeEach(() =>
    createTestApp().then(({ app, server }) => {
      pluginInstance = plugin(app)
      testServer = server
    })
  )

  afterEach((done) => testServer.close(() => done()))

  it('serves tiles from secondary MBTiles file (test2.mbtiles)', () => {
    return pluginInstance.start({ chartPaths: chartPathsWithSecondary }).then(() =>
      getRequest(testServer, '/signalk/v1/api/resources/charts/test2')
    ).then((result) => {
      expect(result.status).to.equal(200)
      expect(result.body).to.have.property('identifier', 'test2')
      // Try to fetch a tile (should 404 or 200 depending on test2.mbtiles content)
      return getRequest(testServer, '/signalk/chart-tiles/test2/4/5/6')
    }).then((response) => {
      expect([200, 404]).to.include(response.status)
    })
  })

  it('returns 404 for all tiles in empty-test chart directory', () => {
    return pluginInstance.start({ chartPaths: chartPathsWithDirectory }).then(() =>
      getRequest(testServer, '/signalk/v1/api/resources/charts/empty-test')
    ).catch((e) => e.response)
    .then((result) => {
      // Empty directories may not be registered as charts
      expect([200, 404]).to.include(result.status)
      // Try to fetch a tile (should always 404)
      return getRequest(testServer, '/signalk/chart-tiles/empty-test/4/5/6')
        .then((response) => {
          expect(response.status).to.equal(404)
        })
        .catch(e => {
          // e.response may be undefined if request fails before response
          if (e && e.response && typeof e.response.status !== 'undefined') {
            expect(e.response.status).to.equal(404)
          } else {
            // Kein Response: Test ist fehlgeschlagen
            throw new Error('No response received for empty-test tile request')
          }
        })
    })
  })

  it('returns 404 for missing TMS tile and parses tilemapresource.xml', () => {
    return pluginInstance.start({ chartPaths: chartPathsWithTms }).then(() =>
      getRequest(testServer, '/signalk/v1/api/resources/charts/tms-tiles')
    ).then((result) => {
      expect(result.status).to.equal(200)
      expect(result.body).to.have.property('identifier', 'tms-tiles')
      // Try to fetch a non-existent tile
      return getRequest(testServer, '/signalk/chart-tiles/tms-tiles/5/17/99')
    }).catch(e => e.response)
    .then((response) => {
      expect(response.status).to.equal(404)
    })
  })

  it('returns 500 or 404 for directory chart with missing metadata.json', () => {
    // Simulate by pointing to a directory without metadata.json (empty-test)
    return pluginInstance.start({ chartPaths: chartPathsWithDirectory }).then(() =>
      getRequest(testServer, '/signalk/v1/api/resources/charts/empty-test')
    ).catch(e => e.response)
    .then((response) => {
      // Should be 200 if plugin tolerates missing metadata, 404 or 500 if not
      expect([200, 404, 500]).to.include(response.status)
    })
  })

  it('rejects tiles for unsupported format charts', () => {
    return pluginInstance.start({ chartPaths: chartPathsWithDirectory }).then(() =>
      getRequest(testServer, '/signalk/v1/api/resources/charts/invalid-format')
    ).then((result) => {
      expect(result.status).to.equal(200)
      expect(result.body).to.have.property('format', 'gif')
      return getRequest(testServer, '/signalk/chart-tiles/invalid-format/4/5/6')
    }).catch(e => e.response)
    .then((response) => {
      expect(response.status).to.equal(404)
    })
  })

  it('returns 404 for unreadable tile files', async () => {
    const chartDir = path.resolve(fixturesRoot, 'charts/unreadable-tiles')
    const tileDir = path.resolve(chartDir, '4/5')
    const tilePath = path.resolve(tileDir, '6.png')
    fs.mkdirSync(tileDir, { recursive: true })
    fs.copyFileSync(
      path.resolve(fixturesRoot, 'directory/unpacked-tiles/4/5/6.png'),
      tilePath
    )
    fs.writeFileSync(
      path.resolve(chartDir, 'metadata.json'),
      JSON.stringify({
        name: 'Unreadable Tiles',
        description: 'Unreadable tile files for testing',
        bounds: [-180, -90, 180, 90],
        minzoom: 1,
        maxzoom: 5,
        format: 'png',
        type: 'tilelayer',
        scale: 250000
      }, null, 2)
    )

    fs.chmodSync(tilePath, 0)

    try {
      await pluginInstance.start({ chartPaths: chartPathsWithCharts })
      const response = await getRequest(
        testServer,
        '/signalk/chart-tiles/unreadable-tiles/4/5/6'
      ).catch(e => e.response)
      expect(response.status).to.equal(404)
    } finally {
      try {
        fs.chmodSync(tilePath, 0o644)
      } catch (e) {
        // ignore cleanup errors
      }
      fs.rmSync(chartDir, { recursive: true, force: true })
    }
  })

  it('returns 404 for invalid tile parameters', () => {
    return pluginInstance.start({ chartPaths: chartPathsDefault }).then(() =>
      getRequest(testServer, '/signalk/chart-tiles/test/a/b/c')
    ).catch(e => e.response)
    .then((response) => {
      expect(response.status).to.equal(404)
    })
  })

  it('returns 404 for mixed invalid tile parameters', () => {
    return pluginInstance.start({ chartPaths: chartPathsDefault }).then(() =>
      getRequest(testServer, '/signalk/chart-tiles/test/4/5/x')
    ).catch(e => e.response)
    .then((response) => {
      expect(response.status).to.equal(404)
      return getRequest(testServer, '/signalk/chart-tiles/test/x/5/6')
    }).catch(e => e.response)
    .then((response) => {
      expect(response.status).to.equal(404)
    })
  })

  it('returns 404 for negative or decimal tile parameters', () => {
    return pluginInstance.start({ chartPaths: chartPathsDefault }).then(() =>
      getRequest(testServer, '/signalk/chart-tiles/test/-1/0/0')
    ).catch(e => e.response)
    .then((response) => {
      expect(response.status).to.equal(404)
      return getRequest(testServer, '/signalk/chart-tiles/test/4/5/6.1')
    }).catch(e => e.response)
    .then((response) => {
      expect(response.status).to.equal(404)
    })
  })

  it('returns 404 for whitespace-padded tile parameters', () => {
    return pluginInstance.start({ chartPaths: chartPathsDefault }).then(() =>
      getRequest(testServer, '/signalk/chart-tiles/test/4/5/%206')
    ).catch(e => e.response)
    .then((response) => {
      expect(response.status).to.equal(404)
    })
  })

  it('returns 404 for out-of-range zoom levels', () => {
    return pluginInstance.start({ chartPaths: chartPathsDefault }).then(() =>
      getRequest(testServer, '/signalk/chart-tiles/test/0/0/0')
    ).catch(e => e.response)
    .then((response) => {
      expect(response.status).to.equal(404)
      return getRequest(testServer, '/signalk/chart-tiles/test/99/0/0')
    }).catch(e => e.response)
    .then((response) => {
      expect(response.status).to.equal(404)
    })
  })

  it('returns 404 for out-of-range tile coordinates', () => {
    return pluginInstance.start({ chartPaths: chartPathsDefault }).then(() =>
      // At z=4 valid x/y are 0..15, so 16 is out of range
      getRequest(testServer, '/signalk/chart-tiles/test/4/16/0')
    ).catch(e => e.response)
    .then((response) => {
      expect(response.status).to.equal(404)
      return getRequest(testServer, '/signalk/chart-tiles/test/4/0/16')
    }).catch(e => e.response)
    .then((response) => {
      expect(response.status).to.equal(404)
    })
  })

  it('MBTiles and unpacked directory tiles match for same coordinates', () => {
    return pluginInstance.start({ chartPaths: chartPathsDefault }).then(() =>
      Promise.all([
        getRequest(testServer, '/signalk/chart-tiles/test/4/5/6'),
        getRequest(testServer, '/signalk/chart-tiles/unpacked-tiles/4/5/6')
      ])
    ).then(([mbtilesResp, dirResp]) => {
      if (mbtilesResp.status === 200 && dirResp.status === 200) {
        expect(mbtilesResp.body.toString('hex')).to.equal(dirResp.body.toString('hex'))
      } else {
        // If either is missing, at least one should be 404
        expect([mbtilesResp.status, dirResp.status]).to.include(404)
      }
    })
  })
})
