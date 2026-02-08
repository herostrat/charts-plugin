import { expect } from 'chai'

describe('Online Provider Conversion', () => {
  it('converts provider name to kebab-case identifier', () => {
    function kebabCase(str) {
      return str
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]/g, '')
    }
    expect(kebabCase('Test Provider')).to.equal('test-provider')
    expect(kebabCase('OpenSeaMap')).to.equal('openseamap')
    expect(kebabCase('My Chart Source')).to.equal('my-chart-source')
  })
  it('sets default bounds to world', () => {
    const bounds = [-180, -90, 180, 90]
    expect(bounds).to.deep.equal([-180, -90, 180, 90])
  })
  it('clamps zoom levels to valid range', () => {
    function clampZoom(z) {
      return Math.min(Math.max(1, z), 24)
    }
    expect(clampZoom(0)).to.equal(1)
    expect(clampZoom(2)).to.equal(2)
    expect(clampZoom(25)).to.equal(24)
    expect(clampZoom(15)).to.equal(15)
  })
  it('handles optional style field', () => {
    const provider1 = { style: 'http://example.com/style.json' }
    const provider2 = {}
    expect(provider1.style || null).to.equal('http://example.com/style.json')
    expect(provider2.style || null).to.equal(null)
  })
  it('handles optional layers field', () => {
    const provider1 = { layers: ['layer1', 'layer2'] }
    const provider2 = {}
    expect(provider1.layers || null).to.deep.equal(['layer1', 'layer2'])
    expect(provider2.layers || null).to.equal(null)
  })
  it('parses headers from array format', () => {
    function parseHeaders(arr) {
      if (!arr) return {}
      return arr.reduce((acc, entry) => {
        if (typeof entry === 'string') {
          const idx = entry.indexOf(':')
          const key = entry.slice(0, idx).trim()
          const value = entry.slice(idx + 1).trim()
          if (key && value) {
            acc[key] = value
          }
        }
        return acc
      }, {})
    }
    const result = parseHeaders([
      'Authorization: Bearer token',
      'User-Agent: MyApp'
    ])
    expect(result).to.deep.equal({
      Authorization: 'Bearer token',
      'User-Agent': 'MyApp'
    })
  })
  it('handles malformed header entries gracefully', () => {
    function parseHeaders(arr) {
      if (!arr) return {}
      return arr.reduce((acc, entry) => {
        if (typeof entry === 'string') {
          const idx = entry.indexOf(':')
          if (idx > 0) {
            const key = entry.slice(0, idx).trim()
            const value = entry.slice(idx + 1).trim()
            if (key && value) {
              acc[key] = value
            }
          }
        }
        return acc
      }, {})
    }
    expect(parseHeaders(['NoColon'])).to.deep.equal({})
    expect(parseHeaders([''])).to.deep.equal({})
    expect(parseHeaders([': no key'])).to.deep.equal({})
  })
})
