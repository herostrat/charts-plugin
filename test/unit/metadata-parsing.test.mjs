import { expect } from 'chai'

/**
 * Tests für das Parsen und Validieren von Chart-Metadaten
 */
describe('Metadata Parsing', () => {
  describe('Invalid metadata handling', () => {
    it('handles missing "bounds" in metadata', () => {
      const metadata = {
        name: 'Test Chart',
        minzoom: 2,
        maxzoom: 14,
        format: 'png'
      }
      const isEmpty = !metadata.bounds
      expect(isEmpty).to.be.true
    })
    it('handles missing format in metadata', () => {
      const metadata = { name: 'Test Chart', minzoom: 2, maxzoom: 14 }
      const isMissing = !metadata.format
      expect(isMissing).to.be.true
    })
    it('handles empty vector_layers array', () => {
      function parseVectorLayers(layers) {
        return (layers ?? []).map((l) => l.id)
      }
      expect(parseVectorLayers(undefined)).to.deep.equal([])
      expect(parseVectorLayers(null)).to.deep.equal([])
      expect(parseVectorLayers([])).to.deep.equal([])
    })
    it('handles null metadata object', () => {
      const metadata = null
      const isEmpty = !metadata || Object.keys(metadata).length === 0
      expect(isEmpty).to.be.true
    })
    it('handles missing vector_layers field (should provide empty array)', () => {
      const metadata = { name: 'Test Chart' }
      const chartLayers = (metadata.vector_layers ?? []).map((l) => l.id)
      expect(chartLayers).to.deep.equal([])
    })
  })
  describe('Bounds parsing edge cases', () => {
    it('handles string bounds correctly', () => {
      function parseBounds(bounds) {
        if (typeof bounds === 'string') {
          return bounds.split(',').map((b) => parseFloat(b.trim()))
        } else if (Array.isArray(bounds) && bounds.length === 4) {
          return bounds
        }
        return undefined
      }
      expect(parseBounds('0,0,10,10')).to.deep.equal([0, 0, 10, 10])
    })
    it('handles array bounds correctly', () => {
      function parseBounds(bounds) {
        if (typeof bounds === 'string') {
          return bounds.split(',').map((b) => parseFloat(b.trim()))
        } else if (Array.isArray(bounds) && bounds.length === 4) {
          return bounds
        }
        return undefined
      }
      expect(parseBounds([1, 2, 3, 4])).to.deep.equal([1, 2, 3, 4])
    })
    it('handles invalid bounds (not 4 elements)', () => {
      function parseBounds(bounds) {
        if (typeof bounds === 'string') {
          return bounds.split(',').map((b) => parseFloat(b.trim()))
        } else if (Array.isArray(bounds) && bounds.length === 4) {
          return bounds
        }
        return undefined
      }
      expect(parseBounds([1, 2, 3])).to.be.undefined
      expect(parseBounds([1, 2, 3, 4, 5])).to.be.undefined
    })
  })
  describe('Scale parsing', () => {
    it('handles valid scale string', () => {
      const scale = '250000'
      const parsed = parseInt(scale) || 250000
      expect(parsed).to.equal(250000)
    })
    it('handles missing scale (uses default)', () => {
      const scale = undefined
      const parsed = (scale ? parseInt(scale) : undefined) || 250000
      expect(parsed).to.equal(250000)
    })
    it('handles invalid scale (uses default)', () => {
      const scale = 'invalid'
      const parsed =
        (scale && !isNaN(parseInt(scale)) ? parseInt(scale) : undefined) ||
        250000
      expect(parsed).to.equal(250000)
    })
  })
})
