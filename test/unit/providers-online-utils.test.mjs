import { expect } from 'chai'
import { convertOnlineProviderConfig } from '../../src/tiles/catalog/online.ts'

describe('providers/online convertOnlineProviderConfig', () => {
  it('converts provider name to kebab-case identifier', () => {
    const provider = {
      name: 'Test Provider',
      minzoom: 2,
      maxzoom: 10,
      format: 'png',
      url: 'http://example.com'
    }
    const result = convertOnlineProviderConfig(provider)
    expect(result.identifier).to.equal('test-provider')
    expect(result.name).to.equal('Test Provider')
  })

  it('sets default bounds and clamps zoom', () => {
    const provider = {
      name: 'Test',
      minzoom: 0,
      maxzoom: 30,
      format: 'png',
      url: 'http://example.com'
    }
    const result = convertOnlineProviderConfig(provider)
    expect(result.bounds).to.deep.equal([-180, -90, 180, 90])
    expect(result.minzoom).to.equal(1)
    expect(result.maxzoom).to.equal(24)
  })

  it('parses headers from array', () => {
    const provider = {
      name: 'Test',
      minzoom: 2,
      maxzoom: 10,
      format: 'png',
      url: 'http://example.com',
      headers: ['Authorization: Bearer token', 'User-Agent: MyApp']
    }
    const result = convertOnlineProviderConfig(provider)
    expect(result.headers).to.deep.equal({
      Authorization: 'Bearer token',
      'User-Agent': 'MyApp'
    })
  })

  it('handles malformed header entries gracefully', () => {
    const provider = {
      name: 'Test',
      minzoom: 2,
      maxzoom: 10,
      format: 'png',
      url: 'http://example.com',
      headers: ['NoColon', ': no key', 'Key:']
    }
    const result = convertOnlineProviderConfig(provider)
    expect(result.headers).to.deep.equal({})
  })

  it('handles optional style and layers', () => {
    const provider = {
      name: 'Test',
      minzoom: 2,
      maxzoom: 10,
      format: 'png',
      url: 'http://example.com',
      style: 'http://style.json',
      layers: ['foo']
    }
    const result = convertOnlineProviderConfig(provider)
    expect(result.style).to.equal('http://style.json')
    expect(result.layers).to.deep.equal(['foo'])
  })

  it('defaults missing headers and layers', () => {
    const provider = {
      name: 'Test',
      minzoom: 2,
      maxzoom: 10,
      format: 'png',
      url: 'http://example.com'
    }
    const result = convertOnlineProviderConfig(provider)
    expect(result.headers).to.deep.equal({})
    expect(result.layers).to.equal(undefined)
  })

  it('wraps single layer string into array', () => {
    const provider = {
      name: 'Test',
      minzoom: 2,
      maxzoom: 10,
      format: 'png',
      url: 'http://example.com',
      layers: 'layer-1'
    }
    const result = convertOnlineProviderConfig(provider)
    expect(result.layers).to.deep.equal(['layer-1'])
  })

  it('uses proxy tile path when proxy is enabled', () => {
    const provider = {
      name: 'Proxy Chart',
      minzoom: 2,
      maxzoom: 10,
      format: 'png',
      url: 'http://tiles.example.com/{z}/{x}/{y}',
      proxy: true
    }
    const result = convertOnlineProviderConfig(provider)
    expect(result.v1.tilemapUrl).to.equal('~tilePath~/proxy-chart/{z}/{x}/{y}')
    expect(result.v2.url).to.equal('~tilePath~/proxy-chart/{z}/{x}/{y}')
    expect(result.remoteUrl).to.equal('http://tiles.example.com/{z}/{x}/{y}')
    expect(result.proxy).to.equal(true)
  })

  it('keeps serverType when provided', () => {
    const provider = {
      name: 'Custom Type',
      minzoom: 2,
      maxzoom: 10,
      format: 'png',
      url: 'http://example.com',
      serverType: 'mapstyleJSON'
    }
    const result = convertOnlineProviderConfig(provider)
    expect(result.type).to.equal('mapstyleJSON')
  })
})
