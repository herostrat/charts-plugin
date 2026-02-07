import { expect } from 'chai'
import { convertOnlineProviderConfig } from '../../src/tiles/catalog/online.ts'

describe('providers/online convertOnlineProviderConfig', () => {
  it('converts provider name to kebab-case identifier', () => {
    const provider = { name: 'Test Provider', minzoom: 2, maxzoom: 10, format: 'png', url: 'http://example.com' }
    const result = convertOnlineProviderConfig(provider)
    expect(result.identifier).to.equal('test-provider')
    expect(result.name).to.equal('Test Provider')
  })

  it('sets default bounds and clamps zoom', () => {
    const provider = { name: 'Test', minzoom: 0, maxzoom: 30, format: 'png', url: 'http://example.com' }
    const result = convertOnlineProviderConfig(provider)
    expect(result.bounds).to.deep.equal([-180, -90, 180, 90])
    expect(result.minzoom).to.equal(1)
    expect(result.maxzoom).to.equal(24)
  })

  it('parses headers from array', () => {
    const provider = { name: 'Test', minzoom: 2, maxzoom: 10, format: 'png', url: 'http://example.com', headers: ['Authorization: Bearer token', 'User-Agent: MyApp'] }
    const result = convertOnlineProviderConfig(provider)
    expect(result.headers).to.deep.equal({ Authorization: 'Bearer token', 'User-Agent': 'MyApp' })
  })

  it('handles malformed header entries gracefully', () => {
    const provider = { name: 'Test', minzoom: 2, maxzoom: 10, format: 'png', url: 'http://example.com', headers: ['NoColon', ': no key', 'Key:'] }
    const result = convertOnlineProviderConfig(provider)
    expect(result.headers).to.deep.equal({})
  })

  it('handles optional style and layers', () => {
    const provider = { name: 'Test', minzoom: 2, maxzoom: 10, format: 'png', url: 'http://example.com', style: 'http://style.json', layers: ['foo'] }
    const result = convertOnlineProviderConfig(provider)
    expect(result.style).to.equal('http://style.json')
    expect(result.layers).to.deep.equal(['foo'])
  })
})
