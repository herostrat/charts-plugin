import fs from 'fs'
import path from 'path'
import http from 'http'
import os from 'os'
import { expect } from 'chai'
import { request as chaiRequest } from 'chai-http'
import { fileURLToPath } from 'url'
import plugin from '../../src/index.ts'
import {
  createImportJob,
  resetImportStore,
  updateImportItem
} from '../../src/imports/store.ts'
import { createTestServer } from '../helpers/test-server.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const fixturesRoot = path.resolve(__dirname, '..', 'fixtures')

const createApp = () => createTestServer({ configPath: fixturesRoot })

const getRequest = (server, location) => {
  const baseUrl = `http://localhost:${server.address().port}`
  return chaiRequest.execute(baseUrl).get(location)
}

const postRequest = (server, location, payload) => {
  const baseUrl = `http://localhost:${server.address().port}`
  return chaiRequest.execute(baseUrl).post(location).send(payload)
}

const putRequest = (server, location, payload) => {
  const baseUrl = `http://localhost:${server.address().port}`
  return chaiRequest.execute(baseUrl).put(location).send(payload)
}

const deleteRequest = (server, location) => {
  const baseUrl = `http://localhost:${server.address().port}`
  return chaiRequest.execute(baseUrl).delete(location)
}

const createTempDir = () => {
  const base = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'charts-imports-'))
  return base
}

const parseSseBlock = (block) => {
  const lines = block.split('\n')
  const eventLine = lines.find((line) => line.startsWith('event:'))
  const dataLine = lines.find((line) => line.startsWith('data:'))
  if (!eventLine || !dataLine) return null
  const event = eventLine.replace('event:', '').trim()
  const raw = dataLine.replace('data:', '').trim()
  let data = null
  try {
    data = JSON.parse(raw)
  } catch {
    data = null
  }
  return { event, data }
}

const readSseEvents = (res, count = 1, timeoutMs = 2000) => {
  return new Promise((resolve, reject) => {
    const events = []
    let buffer = ''
    const timer = setTimeout(() => {
      reject(new Error('Timed out waiting for SSE events'))
    }, timeoutMs)

    res.on('data', (chunk) => {
      buffer += chunk.toString()
      const blocks = buffer.split('\n\n')
      buffer = blocks.pop() || ''
      for (const block of blocks) {
        const parsed = parseSseBlock(block)
        if (parsed) {
          events.push(parsed)
          if (events.length >= count) {
            clearTimeout(timer)
            resolve(events)
            return
          }
        }
      }
    })

    res.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

const openSse = (server, location) => {
  const baseUrl = `http://localhost:${server.address().port}`
  return new Promise((resolve, reject) => {
    const req = http.get(`${baseUrl}${location}`, (res) => {
      resolve({ req, res })
    })
    req.on('error', reject)
  })
}

describe('Imports Web API', () => {
  let pluginInstance
  let testServer

  beforeEach(async () => {
    resetImportStore()
    const { app, server } = await createApp()
    pluginInstance = plugin(app)
    testServer = server
    await pluginInstance.start({
      chartPaths: [path.resolve(fixturesRoot, 'mbtiles')]
    })
  })

  afterEach((done) => {
    resetImportStore()
    if (testServer) {
      testServer.close(() => done())
    } else {
      done()
    }
  })

  describe('GET /@signalk/charts-plugin/imports', () => {
    it('returns empty array by default', () => {
      return getRequest(testServer, '/@signalk/charts-plugin/imports')
        .then((res) => {
          expect(res.status).to.equal(200)
          expect(res.body).to.deep.equal([])
        })
    })
  })

  describe('POST /@signalk/charts-plugin/imports', () => {
    it('rejects missing items', () => {
      return postRequest(testServer, '/@signalk/charts-plugin/imports', {})
        .catch((err) => err.response)
        .then((res) => {
          expect(res.status).to.equal(400)
          expect(res.body).to.include({ error: 'BadRequest' })
        })
    })

    it('rejects multiple sources', () => {
      return postRequest(testServer, '/@signalk/charts-plugin/imports', {
        items: [{
          filename: 'test.tif',
          sourcePath: '/tmp/a.tif',
          sourceUrl: 'https://example.com/a.tif'
        }]
      })
        .catch((err) => err.response)
        .then((res) => {
          expect(res.status).to.equal(400)
          expect(res.body.message).to.match(/Exactly one source/)
        })
    })

    it('rejects folder without metadata', () => {
      return postRequest(testServer, '/@signalk/charts-plugin/imports', {
        items: [{
          filename: 'folder',
          sourcePath: '/charts/folder',
          detectedType: 'folder'
        }]
      })
        .catch((err) => err.response)
        .then((res) => {
          expect(res.status).to.equal(400)
          expect(res.body.message).to.match(/metadataOverrides/)
        })
    })

    it('accepts a valid item', () => {
      return postRequest(testServer, '/@signalk/charts-plugin/imports', {
        items: [{
          filename: 'test.tif',
          sourcePath: '/tmp/test.tif',
          detectedType: 'geotiff'
        }]
      })
        .then((res) => {
          expect(res.status).to.equal(202)
          expect(res.body).to.have.property('id')
          expect(res.body.items).to.have.length(1)
        })
    })
  })

  describe('GET /@signalk/charts-plugin/imports/:id', () => {
    it('returns 400 for invalid id', () => {
      return getRequest(testServer, '/@signalk/charts-plugin/imports/not-a-number')
        .catch((err) => err.response)
        .then((res) => {
          expect(res.status).to.equal(400)
        })
    })

    it('returns 404 for missing job', () => {
      return getRequest(testServer, '/@signalk/charts-plugin/imports/999')
        .catch((err) => err.response)
        .then((res) => {
          expect(res.status).to.equal(404)
        })
    })
  })

  describe('DELETE /@signalk/charts-plugin/imports/:id', () => {
    it('returns 404 for missing job', () => {
      return deleteRequest(testServer, '/@signalk/charts-plugin/imports/999')
        .catch((err) => err.response)
        .then((res) => {
          expect(res.status).to.equal(404)
        })
    })
  })

  describe('GET /@signalk/charts-plugin/imports/fs', () => {
    it('lists directories', async () => {
      const tempDir = createTempDir()
      const filePath = path.join(tempDir, 'sample.txt')
      const subDir = path.join(tempDir, 'nested')
      fs.writeFileSync(filePath, 'hello')
      fs.mkdirSync(subDir)

      const res = await getRequest(testServer, `/@signalk/charts-plugin/imports/fs?path=${encodeURIComponent(tempDir)}`)
      expect(res.status).to.equal(200)
      expect(res.body.path).to.equal(tempDir)
      expect(res.body.entries.some((entry) => entry.name === 'sample.txt')).to.equal(true)
    })

    it('returns 400 when path is not a directory', () => {
      const tempDir = createTempDir()
      const filePath = path.join(tempDir, 'sample.txt')
      fs.writeFileSync(filePath, 'hello')

      return getRequest(testServer, `/@signalk/charts-plugin/imports/fs?path=${encodeURIComponent(filePath)}`)
        .catch((err) => err.response)
        .then((res) => {
          expect(res.status).to.equal(400)
        })
    })
  })

  describe('GET /@signalk/charts-plugin/imports/converters/:type', () => {
    it('returns converters for geotiff', () => {
      return getRequest(testServer, '/@signalk/charts-plugin/imports/converters/geotiff')
        .then((res) => {
          expect(res.status).to.equal(200)
          expect(res.body).to.be.an('array')
        })
    })
  })

  describe('Config endpoints', () => {
    it('returns config entries', () => {
      return getRequest(testServer, '/@signalk/charts-plugin/imports/config')
        .then((res) => {
          expect(res.status).to.equal(200)
          expect(res.body).to.be.an('array')
          const keys = res.body.map((entry) => entry.key)
          expect(keys).to.include('chartPaths')
          expect(keys).to.include('cachePath')
        })
    })

    it('applies config changes', () => {
      return putRequest(testServer, '/@signalk/charts-plugin/imports/config', {
        changes: [
          { key: 'chartPaths', value: '/charts/one, /charts/two' },
          { key: 'cachePath', value: '/tmp/cache' }
        ]
      })
        .then((res) => {
          expect(res.status).to.equal(200)
          const entry = res.body.find((item) => item.key === 'cachePath')
          expect(entry.value).to.equal('/tmp/cache')
        })
    })
  })

  describe('SSE events', () => {
    it('emits snapshot and item updates', async () => {
      const job = createImportJob([
        {
          filename: 'sample.tif',
          sourcePath: '/tmp/sample.tif',
          detectedType: 'geotiff'
        }
      ])
      const itemId = job.items[0].id

      const { req, res } = await openSse(testServer, '/@signalk/charts-plugin/imports/events')
      const events = await readSseEvents(res, 1)
      expect(events[0].event).to.equal('snapshot')
      expect(events[0].data.type).to.equal('snapshot')
      expect(events[0].data.data).to.be.an('array')

      updateImportItem(job.id, itemId, { state: 'COMPLETED' })
      const updates = await readSseEvents(res, 1)
      expect(updates[0].event).to.equal('item')

      req.destroy()
    })
  })
})
