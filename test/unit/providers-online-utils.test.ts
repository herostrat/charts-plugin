import { expect } from 'chai'
import type { OnlineChartProvider } from '../../src/types'
import { convertOnlineProviderConfig } from '../../src/tiles/catalog/online.ts'

describe('providers/online convertOnlineProviderConfig', () => {
  const baseProvider: OnlineChartProvider = {
    name: 'Test Provider',
    description: 'Test',
    minzoom: 2,
    maxzoom: 10,
    serverType: 'tilelayer',
    format: 'png',
    url: 'http://example.com',
    proxy: false,
    style: '',
    layers: [] as string[]
  }

  it('converts provider name to kebab-case identifier', () => {
    const provider = { ...baseProvider }
    const result = convertOnlineProviderConfig(provider)
    expect(result.identifier).to.equal('test-provider')
    expect(result.name).to.equal('Test Provider')
  })

  it('sets default bounds and clamps zoom', () => {
    const provider = { ...baseProvider, name: 'Test', minzoom: 0, maxzoom: 30 }
    const result = convertOnlineProviderConfig(provider)
    expect(result.bounds).to.deep.equal([-180, -90, 180, 90])
    expect(result.minzoom).to.equal(1)
    expect(result.maxzoom).to.equal(24)
  })

  it('parses headers from array', () => {
    const provider = {
      ...baseProvider,
      name: 'Test',
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
      ...baseProvider,
      name: 'Test',
      headers: ['NoColon', ': no key', 'Key:']
    }
    const result = convertOnlineProviderConfig(provider)
    expect(result.headers).to.deep.equal({})
  })

  it('handles optional style and layers', () => {
    const provider = {
      ...baseProvider,
      name: 'Test',
      style: 'http://style.json',
      layers: ['foo']
    }
    const result = convertOnlineProviderConfig(provider)
    expect(result.style).to.equal('http://style.json')
    expect(result.layers).to.deep.equal(['foo'])
  })

  it('defaults to tilelayer when serverType is missing', () => {
    const provider = { ...baseProvider, serverType: undefined }
    const result = convertOnlineProviderConfig(provider)
    expect(result.type).to.equal('tilelayer')
  })

  it('wraps single layer value into array', () => {
    const provider = {
      ...baseProvider,
      layers: 'layer-1' as unknown as string[]
    }
    const result = convertOnlineProviderConfig(provider)
    expect(result.layers).to.deep.equal(['layer-1'])
  })

  it('defaults headers when missing', () => {
    const provider = { ...baseProvider, headers: undefined }
    const result = convertOnlineProviderConfig(provider)
    expect(result.headers).to.deep.equal({})
  })

  it('uses tile proxy url when proxy is enabled', () => {
    const provider = {
      ...baseProvider,
      name: 'Proxy Provider',
      url: 'http://tiles.example.com/{z}/{x}/{y}',
      proxy: true
    }
    const result = convertOnlineProviderConfig(provider)
    expect(result.v1.tilemapUrl).to.equal(
      '~tilePath~/proxy-provider/{z}/{x}/{y}'
    )
    expect(result.v2.url).to.equal('~tilePath~/proxy-provider/{z}/{x}/{y}')
    expect(result.remoteUrl).to.equal('http://tiles.example.com/{z}/{x}/{y}')
    expect(result.proxy).to.equal(true)
  })

  it('sets chart layers to null when layers are missing', () => {
    const provider = {
      ...baseProvider,
      layers: undefined as unknown as string[]
    }
    const result = convertOnlineProviderConfig(provider)
    expect(result.layers).to.equal(undefined)
    expect(result.v1.chartLayers).to.equal(null)
    expect(result.v2.layers).to.equal(null)
  })
})
