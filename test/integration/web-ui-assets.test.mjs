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
const fixturesRoot = path.resolve(__dirname, '..', 'fixtures')

const createApp = () => createTestServer({ configPath: fixturesRoot })

const getRequest = (server, location) => {
  const baseUrl = `http://localhost:${server.address().port}`
  return chaiRequest.execute(baseUrl).get(location)
}

describe('Web UI assets', () => {
  let pluginInstance
  let testServer
  let chartsRoots = []

  beforeEach(async () => {
    const { app, server } = await createApp()
    pluginInstance = plugin(app)
    testServer = server
    const chartsRoot = createChartsRoot({ fixturesRoot })
    chartsRoots.push(chartsRoot)
    await pluginInstance.start({ chartsRoot })
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

  it('serves index.html', () => {
    return getRequest(testServer, '/@signalk/charts-plugin/index.html').then(
      (res) => {
        expect(res.status).to.equal(200)
        expect(res.headers['content-type']).to.match(/text\/html/)
        expect(res.text).to.include('<title>Chart Database</title>')
      }
    )
  })

  it('serves style.css', () => {
    return getRequest(testServer, '/@signalk/charts-plugin/style.css').then(
      (res) => {
        expect(res.status).to.equal(200)
        expect(res.headers['content-type']).to.match(/text\/css/)
        expect(res.text.length).to.be.greaterThan(0)
      }
    )
  })

  it('serves index.js', () => {
    return getRequest(testServer, '/@signalk/charts-plugin/index.js').then(
      (res) => {
        expect(res.status).to.equal(200)
        expect(res.headers['content-type']).to.match(/javascript/)
        expect(res.text.length).to.be.greaterThan(0)
      }
    )
  })
})
