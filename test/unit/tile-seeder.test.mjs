import { expect } from 'chai'
import { TileSeeder, Status } from '../../src/cache/tile-seeder.ts'

const makeProvider = (overrides = {}) => ({
  identifier: 'test',
  name: 'Test',
  description: 'Test',
  type: 'tilelayer',
  scale: 1,
  format: 'png',
  minzoom: 0,
  maxzoom: 1,
  ...overrides
})

const makeSeeder = (cacheOverrides = {}) => {
  const resourcesApi = { getResource: async () => ({}) }
  const provider = makeProvider()
  const removed = []
  const cache = {
    get: async () => ({ hit: false }),
    has: async () => false,
    remove: async (key) => {
      removed.push(key)
    },
    ...cacheOverrides
  }
  const fetcher = { getTile: async () => Buffer.from('tile') }
  const seeder = new TileSeeder(resourcesApi, provider, cache, fetcher, '/tmp')
  return { seeder, removed }
}

describe('TileSeeder', () => {
  it('defaults zoomMin when undefined', () => {
    const { seeder } = makeSeeder()
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

    const tiles = seeder.getTilesForGeoJSON(geojson, undefined, 2)
    expect(tiles.length).to.be.greaterThan(0)
  })

  it('returns empty array for invalid geojson', () => {
    const { seeder } = makeSeeder()
    const tiles = seeder.getTilesForGeoJSON(null, 1, 2)
    expect(tiles).to.deep.equal([])
  })

  it('initializes from tile and tracks job info', async () => {
    const { seeder } = makeSeeder()
    await seeder.initializeJobFromTile({ x: 0, y: 0, z: 0 }, 0)

    const info = seeder.info()
    expect(info.totalTiles).to.equal(1)
    expect(info.cachedTiles).to.equal(0)
    expect(info.status).to.equal(Status.Stopped)
  })

  it('deletes cached tiles via cache adapter', async () => {
    const { seeder, removed } = makeSeeder()
    await seeder.initializeJobFromTile({ x: 0, y: 0, z: 0 }, 0)

    const info = seeder.info()
    await seeder.deleteCache()

    expect(removed.length).to.equal(info.totalTiles)
    expect(seeder.info().status).to.equal(Status.Stopped)
  })
})
