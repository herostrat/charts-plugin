import { sanitizeProvider } from '../../src/resources/registry.ts'
import { expect } from 'chai'
describe('sanitizeProvider', () => {
  it('removes internal fields and replaces tilemapUrl', () => {
    const provider = {
      identifier: 'test',
      format: 'png',
      v1: { tilemapUrl: '~tilePath~/test/{z}/{x}/{y}', chartLayers: [] },
      v2: { url: '~tilePath~/test/{z}/{x}/{y}', layers: [] },
      _filePath: '/tmp/test',
      _fileFormat: 'mbtiles',
      _mbtilesHandle: {},
      _flipY: false,
      name: 'Test',
      description: 'desc',
      bounds: [0, 0, 1, 1],
      minzoom: 0,
      maxzoom: 5,
      type: 'tilelayer',
      scale: 250000
    }
    const sanitized = sanitizeProvider(provider, 1)
    expect(sanitized).to.not.have.property('_filePath')
    expect(sanitized).to.not.have.property('_fileFormat')
    expect(sanitized).to.not.have.property('_mbtilesHandle')
    expect(sanitized).to.not.have.property('_flipY')
    expect(sanitized).to.not.have.property('v1')
    expect(sanitized).to.not.have.property('v2')
    expect(sanitized)
      .to.have.property('tilemapUrl')
      .that.includes('/signalk/chart-tiles')
  })

  it('handles version 2 and vector format', () => {
    const provider = {
      identifier: 'vec',
      format: 'pbf',
      v1: { tilemapUrl: '~tilePath~/vec/{z}/{x}/{y}', chartLayers: [] },
      v2: { url: '~tilePath~/vec/{z}/{x}/{y}', layers: ['foo'] },
      name: 'Vec',
      description: '',
      bounds: [0, 0, 1, 1],
      minzoom: 0,
      maxzoom: 5,
      type: 'tilelayer',
      scale: 250000
    }
    const sanitized = sanitizeProvider(provider, 2)
    expect(sanitized).to.have.property('type', 'mapstyleJSON')
    expect(sanitized)
      .to.have.property('url')
      .that.includes('/signalk/chart-style/vec')
    expect(sanitized)
      .to.have.property('style')
      .that.includes('/signalk/chart-style/vec')
  })
})
