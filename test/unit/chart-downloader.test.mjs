import { expect } from 'chai'
import { ChartDownloader } from '../../src/cache/chart-downloader.ts'

const createDownloader = () => {
  const resourcesApi = { getResource: async () => ({}) }
  const provider = {
    identifier: 'test',
    name: 'Test',
    description: 'Test',
    type: 'tilelayer',
    scale: 1,
    _filePath: '',
    format: 'png'
  }
  return new ChartDownloader(resourcesApi, '/tmp', provider)
}

describe('ChartDownloader getTilesForGeoJSON', () => {
  it('defaults zoomMin when undefined', () => {
    const downloader = createDownloader()
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

    const tiles = downloader.getTilesForGeoJSON(geojson, undefined, 2)
    expect(tiles.length).to.be.greaterThan(0)
  })

  it('returns empty array for invalid geojson', () => {
    const downloader = createDownloader()
    const tiles = downloader.getTilesForGeoJSON(null, 1, 2)
    expect(tiles).to.deep.equal([])
  })
})
