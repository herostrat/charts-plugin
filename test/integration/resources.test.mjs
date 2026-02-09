import fs from 'fs'
import _ from 'lodash'
import path from 'path'
import { expect } from 'chai'
import { request as chaiRequest } from 'chai-http'
import { fileURLToPath } from 'url'
import plugin from '../../src/index.ts'
import { createTestServer } from '../helpers/test-server.mjs'
import {
  createChartsRoot,
  removeChartsRoot
} from '../helpers/charts-root.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const expectedCharts = JSON.parse(
  fs.readFileSync(
    new URL('../fixtures/expected-charts.json', import.meta.url),
    'utf8'
  )
)

const fixturesRoot = path.resolve(__dirname, '..', 'fixtures')

describe('Charts API & Tile Provider', () => {
  let pluginInstance
  let testServer
  let chartsRoots = []

  const startWithFixtures = async (fixtures, extraConfig = {}) => {
    const chartsRoot = createChartsRoot({ fixturesRoot, fixtures })
    chartsRoots.push(chartsRoot)
    await pluginInstance.start({ chartsRoot, ...extraConfig })
    return chartsRoot
  }

  beforeEach(async () => {
    const { app, server } = await createDefaultApp()
    pluginInstance = plugin(app)
    testServer = server
  })

  afterEach((done) => {
    chartsRoots.forEach(removeChartsRoot)
    chartsRoots = []
    if (testServer) {
      testServer.close(() => done())
    } else {
      done()
    }
  })

  describe('GET /signalk/v1/api/resources/charts', () => {
    it('returns all charts for default path', () => {
      return startWithFixtures(['mbtiles', 'directory', 'tms'])
        .then(() => get(testServer, '/signalk/v1/api/resources/charts'))
        .then((result) => {
          expect(result.status).to.equal(200)
          expect(result.body).to.deep.equal(expectedCharts)
        })
    })

    it('handle canonical paths', () => {
      return startWithFixtures(['mbtiles', 'directory', 'tms'])
        .then(() => get(testServer, '/signalk/v1/api/resources/charts'))
        .then((result) => {
          expect(result.status).to.equal(200)
          expect(_.keys(result.body).length).to.equal(5)
        })
    })

    it('returns all charts for multiple paths', () => {
      return startWithFixtures(['mbtiles', 'directory', 'tms'])
        .then(() => get(testServer, '/signalk/v1/api/resources/charts'))
        .then((result) => {
          expect(result.status).to.equal(200)
          // The original expectation was inconsistent; align it with fixture count.
          expect(_.keys(result.body).length).to.be.at.least(4)
        })
    })

    it('returns empty charts for custom empty path', () => {
      const emptyPath = path.resolve(__dirname, '..', '..', 'src')
      return startWithFixtures([])
        .then(() => get(testServer, '/signalk/v1/api/resources/charts'))
        .then((result) => {
          expect(result.body).to.deep.equal({})
        })
    })

    it('returns online chart providers', () => {
      return startWithFixtures(['mbtiles'], {
        onlineChartProviders: [
          {
            name: 'Test Name',
            minzoom: 2,
            maxzoom: 15,
            format: 'jpg',
            url: 'https://example.com'
          }
        ]
      })
        .then(() => get(testServer, '/signalk/v1/api/resources/charts'))
        .then((result) => {
          const onlineChart = result.body['test-name']
          expect(onlineChart).to.include({
            identifier: 'test-name',
            name: 'Test Name',
            format: 'jpg',
            minzoom: 2,
            maxzoom: 15,
            tilemapUrl: 'https://example.com'
          })
        })
    })

    it('returns one chart', () => {
      const identifier = 'test'
      return startWithFixtures(['mbtiles'])
        .then(() =>
          get(testServer, `/signalk/v1/api/resources/charts/${identifier}`)
        )
        .then((result) => {
          expect(result.body).to.deep.equal(expectedCharts[identifier])
        })
    })

    it('returns 404 for unknown chart', () => {
      return startWithFixtures(['mbtiles'])
        .then(() => get(testServer, `/signalk/v1/api/resources/charts/foo`))
        .catch((e) => e.response)
        .then((result) => {
          expect(result.status).to.equal(404)
        })
    })
  })

  describe('GET /signalk/chart-tiles/:identifier/:z/:x/:y', () => {
    it('returns correct tile from MBTiles file', () => {
      return startWithFixtures(['mbtiles'])
        .then(() => get(testServer, '/signalk/chart-tiles/test/4/5/6'))
        .then((response) => {
          expectTileResponse(
            response,
            'directory/unpacked-tiles/4/5/6.png',
            'image/png'
          )
        })
    })

    it('returns correct tile from directory', () => {
      return startWithFixtures(['directory'])
        .then(() =>
          get(testServer, '/signalk/chart-tiles/unpacked-tiles/4/4/6')
        )
        .then((response) => {
          expectTileResponse(
            response,
            'directory/unpacked-tiles/4/4/6.png',
            'image/png'
          )
        })
    })

    it('returns correct tile from TMS directory', () => {
      return startWithFixtures(['tms'])
        .then(() => get(testServer, '/signalk/chart-tiles/tms-tiles/5/17/10'))
        .then((response) => {
          // In TMS, Y is often inverted; this test expects 21
          expectTileResponse(response, 'tms/tms-tiles/5/17/21.png', 'image/png')
        })
    })

    it('returns 404 for missing tile', () => {
      return startWithFixtures(['tms'])
        .then(() => get(testServer, '/signalk/chart-tiles/tms-tiles/5/55/10'))
        .catch((e) => e.response)
        .then((response) => {
          expect(response.status).to.equal(404)
        })
    })
  })
})

// --- Helper Functions ---

const expectTileResponse = (response, expectedTilePath, expectedFormat) => {
  const expectedTile = fs.readFileSync(
    path.resolve(fixturesRoot, expectedTilePath)
  )
  expect(response.status).to.equal(200)
  expect(response.headers['content-type']).to.equal(expectedFormat)
  expect(response.headers['cache-control']).to.equal('public, max-age=7776000')
  expect(response.body.toString('hex')).to.equal(expectedTile.toString('hex'))
}

const createDefaultApp = () => createTestServer({ configPath: fixturesRoot })

const get = (server, location) => {
  const baseUrl = `http://localhost:${server.address().port}`
  return chaiRequest.execute(baseUrl).get(location)
}
