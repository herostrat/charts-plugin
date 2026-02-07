import { expect } from 'chai'
import { isAllowedTileFormat, resolveTileContentType, isGzipBuffer, isVectorFormat } from '../../src/tiles/format.ts'

// Buffer helper for gzip
const gzipBuffer = Buffer.from([0x1f, 0x8b, 0x08, 0x00])
const notGzipBuffer = Buffer.from([0x00, 0x00, 0x00, 0x00])

describe('tiles/format utility functions', () => {
  describe('isAllowedTileFormat', () => {
    it('returns true for allowed formats', () => {
      ['png', 'jpg', 'jpeg', 'pbf', 'mvt', 'webp', 'avif'].forEach(fmt => {
        expect(isAllowedTileFormat(fmt)).to.be.true
        expect(isAllowedTileFormat(fmt.toUpperCase())).to.be.true
      })
    })
    it('returns false for disallowed or missing formats', () => {
      expect(isAllowedTileFormat('svg')).to.be.false
      expect(isAllowedTileFormat('')).to.be.false
      expect(isAllowedTileFormat(undefined)).to.be.false
    })
  })

  describe('resolveTileContentType', () => {
    it('returns correct content-type for raster formats', () => {
      expect(resolveTileContentType('png')).to.equal('image/png')
      expect(resolveTileContentType('jpg')).to.equal('image/jpeg')
      expect(resolveTileContentType('jpeg')).to.equal('image/jpeg')
      expect(resolveTileContentType('webp')).to.equal('image/webp')
      expect(resolveTileContentType('avif')).to.equal('image/avif')
    })
    it('returns correct content-type for vector formats', () => {
      expect(resolveTileContentType('pbf')).to.equal('application/vnd.mapbox-vector-tile')
      expect(resolveTileContentType('mvt')).to.equal('application/vnd.mapbox-vector-tile')
    })
    it('returns octet-stream for unknown', () => {
      expect(resolveTileContentType('svg')).to.equal('application/octet-stream')
      expect(resolveTileContentType(undefined)).to.equal('application/octet-stream')
    })
  })

  describe('isGzipBuffer', () => {
    it('detects gzip buffer', () => {
      expect(isGzipBuffer(gzipBuffer)).to.be.true
    })
    it('returns false for non-gzip buffer', () => {
      expect(isGzipBuffer(notGzipBuffer)).to.be.false
      expect(isGzipBuffer(Buffer.alloc(0))).to.be.false
    })
  })

  describe('isVectorFormat', () => {
    it('returns true for pbf and mvt', () => {
      expect(isVectorFormat('pbf')).to.be.true
      expect(isVectorFormat('mvt')).to.be.true
      expect(isVectorFormat('PBF')).to.be.true
    })
    it('returns false for raster or unknown', () => {
      expect(isVectorFormat('png')).to.be.false
      expect(isVectorFormat('jpg')).to.be.false
      expect(isVectorFormat(undefined)).to.be.false
      expect(isVectorFormat('')).to.be.false
    })
  })
})
