import fs from 'fs'
import os from 'os'
import path from 'path'
import { expect } from 'chai'
import { ChartDownloader, Status } from '../../src/cache/chart-downloader.ts'

const makeProvider = (overrides = {}) => ({
  identifier: 'test',
  name: 'CacheProvider',
  description: 'Test',
  type: 'tilelayer',
  scale: 1,
  format: 'png',
  minzoom: 0,
  maxzoom: 0,
  ...overrides
})

describe('ChartDownloader job lifecycle', () => {
  it('initializes from tile and computes cached tiles', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'charts-cache-'))
    const provider = makeProvider()
    const downloader = new ChartDownloader(
      { getResource: async () => ({}) },
      tmpDir,
      provider
    )

    await downloader.initializeJobFromTile({ x: 0, y: 0, z: 0 }, 0)

    const info = downloader.info()
    expect(info.totalTiles).to.be.greaterThan(0)
    expect(info.cachedTiles).to.equal(0)
    expect(info.status).to.equal(Status.Stopped)

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('deletes cached tiles on deleteCache', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'charts-cache-'))
    const provider = makeProvider()
    const downloader = new ChartDownloader(
      { getResource: async () => ({}) },
      tmpDir,
      provider
    )

    await downloader.initializeJobFromTile({ x: 0, y: 0, z: 0 }, 0)

    const tilePath = path.join(tmpDir, provider.name, '0', '0', '0.png')
    fs.mkdirSync(path.dirname(tilePath), { recursive: true })
    fs.writeFileSync(tilePath, Buffer.from('tile'))

    await downloader.deleteCache()
    expect(fs.existsSync(tilePath)).to.equal(false)

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('respects cancelJob flag', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'charts-cache-'))
    const provider = makeProvider()
    const downloader = new ChartDownloader(
      { getResource: async () => ({}) },
      tmpDir,
      provider
    )

    downloader.cancelJob()
    expect(downloader.cancelRequested).to.equal(true)

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('downloads tiles during seedCache', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'charts-cache-'))
    const provider = makeProvider({
      remoteUrl: 'https://example.com/{z}/{x}/{y}'
    })
    const downloader = new ChartDownloader(
      { getResource: async () => ({}) },
      tmpDir,
      provider
    )

    await downloader.initializeJobFromTile({ x: 0, y: 0, z: 0 }, 0)

    const originalFetch = ChartDownloader.getTileFromCacheOrRemote
    ChartDownloader.getTileFromCacheOrRemote = async () => Buffer.from('tile')

    await downloader.seedCache()

    expect(downloader.status).to.equal(Status.Stopped)
    expect(downloader.downloadedTiles).to.equal(1)

    ChartDownloader.getTileFromCacheOrRemote = originalFetch
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('initializes from region with multipolygon', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'charts-cache-'))
    const provider = makeProvider()
    const region = {
      name: 'Test Region',
      feature: {
        type: 'Feature',
        geometry: {
          type: 'MultiPolygon',
          coordinates: [
            [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 1],
                [0, 0]
              ]
            ]
          ]
        },
        properties: {}
      }
    }
    const downloader = new ChartDownloader(
      { getResource: async () => region },
      tmpDir,
      provider
    )

    await downloader.initalizeJobFromRegion('region-1', 1)
    const info = downloader.info()
    expect(info.totalTiles).to.be.greaterThan(0)
    expect(info.regionName).to.include('Region')

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('rejects invalid regions', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'charts-cache-'))
    const provider = makeProvider()
    const downloader = new ChartDownloader(
      { getResource: async () => ({}) },
      tmpDir,
      provider
    )

    try {
      await downloader.initalizeJobFromRegion('bad', 1)
      throw new Error('Expected error')
    } catch (err) {
      expect(err).to.be.instanceOf(Error)
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('initializes from bbox and tile helpers', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'charts-cache-'))
    const provider = makeProvider()
    const downloader = new ChartDownloader(
      { getResource: async () => ({}) },
      tmpDir,
      provider
    )

    await downloader.initializeJobFromBBox([-1, -1, 1, 1], 1)
    expect(downloader.info().totalTiles).to.be.greaterThan(0)

    const tiles = downloader.getTilesForBBox([-1, -1, 1, 1], 1)
    expect(tiles.length).to.be.greaterThan(0)

    const subtiles = downloader.getSubTiles({ x: 0, y: 0, z: 0 }, 1)
    expect(subtiles.length).to.be.greaterThan(0)

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns tiles for valid GeoJSON polygons', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'charts-cache-'))
    const provider = makeProvider()
    const downloader = new ChartDownloader(
      { getResource: async () => ({}) },
      tmpDir,
      provider
    )

    const geojson = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 1],
                [0, 0]
              ]
            ]
          },
          properties: {}
        }
      ]
    }

    const tiles = downloader.getTilesForGeoJSON(geojson, 1, 1)
    expect(tiles.length).to.be.greaterThan(0)

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })
})
