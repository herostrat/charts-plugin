import { expect } from 'chai'
import { serveTileStreaming } from '../../src/tiles/sources/streaming.ts'

const createRes = () => {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    set(key, value) {
      this.headers[key.toLowerCase()] = value
      return this
    },
    status(code) {
      this.statusCode = code
      return this
    },
    send(data) {
      this.body = data
      return this
    },
    sendStatus(code) {
      this.statusCode = code
      return this
    }
  }
  return res
}

const provider = (format = 'png') => ({
  identifier: 'streaming',
  name: 'streaming',
  format,
  minzoom: 0,
  maxzoom: 10
})

describe('Streaming tiles', () => {
  it('returns 501 for mock sources', async () => {
    const res = createRes()
    await serveTileStreaming(res, '/tmp', provider(), 1, 2, 3, {
      isMock: true,
      getTile: async () => null
    })
    expect(res.statusCode).to.equal(501)
    expect(String(res.body)).to.match(/not implemented/i)
  })

  it('returns 404 for unsupported formats', async () => {
    const res = createRes()
    await serveTileStreaming(res, '/tmp', provider('tiff'), 1, 2, 3, {
      getTile: async () => null
    })
    expect(res.statusCode).to.equal(404)
  })

  it('returns 404 when source has no tile', async () => {
    const res = createRes()
    await serveTileStreaming(res, '/tmp', provider('png'), 1, 2, 3, {
      getTile: async () => null
    })
    expect(res.statusCode).to.equal(404)
  })

  it('serves tiles with gzip detection and headers', async () => {
    const res = createRes()
    const data = Buffer.from([0x1f, 0x8b, 0x08, 0x00])
    await serveTileStreaming(res, '/tmp', provider('png'), 1, 2, 3, {
      getTile: async () => ({
        data,
        format: 'png',
        cacheControl: 'public, max-age=60',
        expires: 'Wed, 21 Oct 2015 07:28:00 GMT'
      })
    })

    expect(res.statusCode).to.equal(200)
    expect(res.headers['content-type']).to.equal('image/png')
    expect(res.headers['content-encoding']).to.equal('gzip')
    expect(res.headers['cache-control']).to.equal('public, max-age=60')
    expect(res.headers['expires']).to.equal('Wed, 21 Oct 2015 07:28:00 GMT')
    expect(res.body).to.equal(data)
  })

  it('returns 500 on source errors', async () => {
    const res = createRes()
    await serveTileStreaming(res, '/tmp', provider('png'), 1, 2, 3, {
      getTile: async () => {
        throw new Error('boom')
      }
    })
    expect(res.statusCode).to.equal(500)
  })
})
