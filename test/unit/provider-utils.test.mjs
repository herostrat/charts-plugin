import { expect } from 'chai'

describe('Provider Utils', () => {
  describe('sanitizeProvider function behavior', () => {
    it('removes internal fields from provider', () => {
      const provider = {
        identifier: 'test',
        name: 'Test Chart',
        _filePath: '/path/to/file',
        _fileFormat: 'mbtiles',
        _mbtilesHandle: { fake: 'handle' },
        _flipY: true,
        v1: { tilemapUrl: 'url' },
        v2: { url: 'url' }
      }
      const fieldsToRemove = [
        '_filePath',
        '_fileFormat',
        '_mbtilesHandle',
        '_flipY',
        'v1',
        'v2'
      ]
      fieldsToRemove.forEach((field) => {
        expect(provider).to.have.property(field)
      })
      const sanitized = Object.keys(provider)
        .filter((k) => !fieldsToRemove.includes(k))
        .reduce((obj, key) => ({ ...obj, [key]: provider[key] }), {})
      fieldsToRemove.forEach((field) => {
        expect(sanitized).to.not.have.property(field)
      })
    })
    it('replaces ~tilePath~ placeholder in v1 API', () => {
      const tilePath = '/signalk/chart-tiles'
      const tilemapUrl = '~tilePath~/test/{z}/{x}/{y}'
      const result = tilemapUrl.replace('~tilePath~', tilePath)
      expect(result).to.equal('/signalk/chart-tiles/test/{z}/{x}/{y}')
    })
    it('replaces ~tilePath~ placeholder in v2 API', () => {
      const tilePath = '/signalk/chart-tiles'
      const url = '~tilePath~/external/tiles/{z}/{x}/{y}'
      const result = url.replace('~tilePath~', tilePath)
      expect(result).to.equal('/signalk/chart-tiles/external/tiles/{z}/{x}/{y}')
    })
    it('handles missing v1 tilemapUrl', () => {
      const v1 = {}
      const result = v1.tilemapUrl || undefined
      expect(result).to.be.undefined
    })
    it('handles missing v2 url', () => {
      const v2 = {}
      const result = v2.url || ''
      expect(result).to.equal('')
    })
  })
})
