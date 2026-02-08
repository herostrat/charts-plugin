import fs from 'fs'
import os from 'os'
import path from 'path'
import { expect } from 'chai'
import { ChartDownloader } from '../../src/cache/chart-downloader.ts'

const makeProvider = (overrides = {}) => ({
  identifier: 'test',
  name: 'Test Provider',
  description: 'Test',
  type: 'tilelayer',
  scale: 1,
  format: 'png',
  remoteUrl: undefined,
  headers: { Authorization: 'Bearer token' },
  ...overrides
})

describe('ChartDownloader remote fetching', () => {
  it('returns null without remoteUrl', async () => {
    const result = await ChartDownloader.fetchTileFromRemote(makeProvider(), {
      x: 1,
      y: 2,
      z: 3
    })
    expect(result).to.equal(null)
  })

  it('returns null on non-ok response', async () => {
    const originalFetch = global.fetch
    global.fetch = async () => ({ ok: false })

    const provider = makeProvider({
      remoteUrl: 'https://example.com/{z}/{x}/{y}'
    })
    const result = await ChartDownloader.fetchTileFromRemote(provider, {
      x: 1,
      y: 2,
      z: 3
    })
    expect(result).to.equal(null)

    global.fetch = originalFetch
  })

  it('builds url tokens and returns buffer', async () => {
    const originalFetch = global.fetch
    let capturedUrl = ''
    global.fetch = async (url) => {
      capturedUrl = url
      return {
        ok: true,
        arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer
      }
    }

    const provider = makeProvider({
      remoteUrl: 'https://example.com/{z}/{z-2}/{x}/{y}/{-y}'
    })
    const result = await ChartDownloader.fetchTileFromRemote(provider, {
      x: 4,
      y: 5,
      z: 6
    })

    expect(capturedUrl).to.equal('https://example.com/6/4/4/5/58')
    expect(Buffer.isBuffer(result)).to.equal(true)

    global.fetch = originalFetch
  })

  it('uses cached tile when present', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'charts-cache-'))
    const provider = makeProvider({ name: 'CacheProvider', format: 'png' })
    const tilePath = path.join(tmpDir, provider.name, '1', '2', '3.png')
    fs.mkdirSync(path.dirname(tilePath), { recursive: true })
    fs.writeFileSync(tilePath, Buffer.from('cached'))

    const buffer = await ChartDownloader.getTileFromCacheOrRemote(
      tmpDir,
      provider,
      { x: 2, y: 3, z: 1 }
    )
    expect(buffer?.toString()).to.equal('cached')

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })
})
