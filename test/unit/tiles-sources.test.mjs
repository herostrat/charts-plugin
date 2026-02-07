import fs from 'fs'
import os from 'os'
import path from 'path'
import { expect } from 'chai'
import { serveTileFromCacheOrRemote } from '../../src/tiles/sources/proxy.ts'
import { serveTileFromDirectory } from '../../src/tiles/sources/directory.ts'
import { serveTileFromMbtiles } from '../../src/tiles/sources/mbtiles.ts'
import { serveTileFromPmtiles } from '../../src/tiles/sources/pmtiles.ts'
import { serveTileFromGeotiff } from '../../src/tiles/sources/geotiff.ts'
import { ChartDownloader } from '../../src/cache/chart-downloader.ts'

class MockResponse {
  constructor() {
    this.statusCode = 200
    this.headers = {}
    this.body = undefined
  }

  set(key, value) {
    this.headers[key] = value
    return this
  }

  type(value) {
    this.headers['Content-Type'] = value
    return this
  }

  status(code) {
    this.statusCode = code
    return this
  }

  send(payload) {
    this.body = payload
    return this
  }

  sendStatus(code) {
    this.statusCode = code
    return this
  }

  writeHead(code, headers) {
    this.statusCode = code
    this.headers = { ...this.headers, ...headers }
  }

  end(payload) {
    this.body = payload
  }

  sendFile(filePath, options) {
    if (options?.headers) {
      this.headers = { ...this.headers, ...options.headers }
    }
    this.body = fs.readFileSync(filePath)
    return this
  }
}

const makeProvider = (overrides = {}) => ({
  identifier: 'test',
  name: 'Test Provider',
  description: 'Test',
  type: 'tilelayer',
  scale: 1,
  format: 'png',
  _filePath: '',
  _fileFormat: 'directory',
  ...overrides
})

describe('tile source handlers', () => {
  it('serves tiles from cache or remote (cache hit)', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'charts-cache-'))
    const provider = makeProvider({ name: 'cache-provider' })
    const tilePath = path.join(tmpDir, provider.name, '1', '2', '3.png')
    fs.mkdirSync(path.dirname(tilePath), { recursive: true })
    fs.writeFileSync(tilePath, Buffer.from('tile-data'))

    const res = new MockResponse()
    await serveTileFromCacheOrRemote(res, tmpDir, provider, 1, 2, 3)

    expect(res.statusCode).to.equal(200)
    expect(Buffer.isBuffer(res.body)).to.equal(true)

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns 502 when proxy tile fetch fails', async () => {
    const original = ChartDownloader.getTileFromCacheOrRemote
    ChartDownloader.getTileFromCacheOrRemote = async () => null

    const res = new MockResponse()
    await serveTileFromCacheOrRemote(res, '/tmp', makeProvider(), 1, 1, 1)

    expect(res.statusCode).to.equal(502)

    ChartDownloader.getTileFromCacheOrRemote = original
  })

  it('serves tiles from directory with flipY', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'charts-dir-'))
    const provider = makeProvider({ _filePath: tmpDir, _flipY: true })
    const z = 2
    const x = 0
    const y = 1
    const flipped = Math.pow(2, z) - 1 - y
    const tilePath = path.join(tmpDir, `${z}`, `${x}`, `${flipped}.png`)
    fs.mkdirSync(path.dirname(tilePath), { recursive: true })
    fs.writeFileSync(tilePath, Buffer.from('dir-tile'))

    const res = new MockResponse()
    serveTileFromDirectory(res, provider, z, x, y)

    expect(res.statusCode).to.equal(200)
    expect(Buffer.isBuffer(res.body)).to.equal(true)

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns 404 for unsupported directory format', () => {
    const res = new MockResponse()
    const provider = makeProvider({ format: 'gif' })
    serveTileFromDirectory(res, provider, 1, 1, 1)
    expect(res.statusCode).to.equal(404)
  })

  it('serves mbtiles tiles with headers', () => {
    const provider = makeProvider({
      _fileFormat: 'mbtiles',
      _mbtilesHandle: {
        getTile: (z, x, y, cb) => cb(null, Buffer.from('tile'), {})
      }
    })
    const res = new MockResponse()
    serveTileFromMbtiles(res, provider, 1, 2, 3)
    expect(res.statusCode).to.equal(200)
    expect(Buffer.isBuffer(res.body)).to.equal(true)
  })

  it('returns 404 when mbtiles tile is missing', () => {
    const provider = makeProvider({
      _fileFormat: 'mbtiles',
      _mbtilesHandle: {
        getTile: (z, x, y, cb) => cb(new Error('Tile does not exist'))
      }
    })
    const res = new MockResponse()
    serveTileFromMbtiles(res, provider, 1, 2, 3)
    expect(res.statusCode).to.equal(404)
  })

  it('returns 500 for mbtiles errors', () => {
    const provider = makeProvider({
      _fileFormat: 'mbtiles',
      _mbtilesHandle: {
        getTile: (z, x, y, cb) => cb(new Error('Boom'))
      }
    })
    const res = new MockResponse()
    serveTileFromMbtiles(res, provider, 1, 2, 3)
    expect(res.statusCode).to.equal(500)
  })

  it('serves pmtiles tile with gzip and cache headers', async () => {
    const provider = makeProvider({
      _fileFormat: 'pmtiles',
      _pmtilesHandle: {
        getZxy: async () => ({
          data: new Uint8Array([0x1f, 0x8b, 0x08, 0x00]),
          cacheControl: 'public, max-age=60',
          expires: 'Wed, 21 Oct 2026 07:28:00 GMT'
        })
      }
    })
    const res = new MockResponse()
    await serveTileFromPmtiles(res, provider, 1, 2, 3)
    expect(res.statusCode).to.equal(200)
    expect(res.headers['Content-Encoding']).to.equal('gzip')
    expect(res.headers['Cache-Control']).to.equal('public, max-age=60')
    expect(res.headers['Expires']).to.equal('Wed, 21 Oct 2026 07:28:00 GMT')
  })

  it('returns 404 for missing pmtiles tile', async () => {
    const provider = makeProvider({
      _fileFormat: 'pmtiles',
      _pmtilesHandle: {
        getZxy: async () => null
      }
    })
    const res = new MockResponse()
    await serveTileFromPmtiles(res, provider, 1, 2, 3)
    expect(res.statusCode).to.equal(404)
  })

  it('returns 404 for invalid pmtiles format', async () => {
    const provider = makeProvider({
      format: 'gif',
      _fileFormat: 'pmtiles',
      _pmtilesHandle: { getZxy: async () => ({ data: new Uint8Array() }) }
    })
    const res = new MockResponse()
    await serveTileFromPmtiles(res, provider, 1, 2, 3)
    expect(res.statusCode).to.equal(404)
  })

  it('returns 500 for missing pmtiles handle', async () => {
    const provider = makeProvider({ _fileFormat: 'pmtiles', _pmtilesHandle: undefined })
    const res = new MockResponse()
    await serveTileFromPmtiles(res, provider, 1, 2, 3)
    expect(res.statusCode).to.equal(500)
  })

  it('returns 501 for geotiff tiles', () => {
    const res = new MockResponse()
    const provider = makeProvider({ _fileFormat: 'geotiff' })
    serveTileFromGeotiff(res, provider, 1, 2, 3)
    expect(res.statusCode).to.equal(501)
  })
})
