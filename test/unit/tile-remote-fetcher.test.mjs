import { expect } from 'chai'
import { fetchTileFromRemote } from '../../src/cache/tile-remote-fetcher.ts'

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

describe('fetchTileFromRemote', () => {
  it('returns null without remoteUrl', async () => {
    const result = await fetchTileFromRemote(makeProvider(), {
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
    const result = await fetchTileFromRemote(provider, {
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
    const result = await fetchTileFromRemote(provider, {
      x: 4,
      y: 5,
      z: 6
    })

    expect(capturedUrl).to.equal('https://example.com/6/4/4/5/58')
    expect(Buffer.isBuffer(result)).to.equal(true)

    global.fetch = originalFetch
  })
})
