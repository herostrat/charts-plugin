import { expect } from 'chai'
import { buildNauticalVectorStyle } from '../../src/style/nautical-style-generator.ts'

const createProvider = (layers) => ({
  identifier: 'test-vector',
  name: 'Test Vector',
  description: 'Vector chart',
  type: 'tilelayer',
  scale: 250000,
  format: 'pbf',
  minzoom: 2,
  maxzoom: 8,
  v2: {
    url: '/signalk/chart-tiles/test-vector/{z}/{x}/{y}',
    layers
  }
})

describe('buildNauticalVectorStyle', () => {
  it('builds a style with vector source and layers', () => {
    const provider = createProvider([
      'DEPARE',
      'LNDARE',
      'BUAARE',
      'NAVLNE',
      'BOYSPP',
      'WRECKS'
    ])

    const style = buildNauticalVectorStyle(provider, [])
    expect(style).to.be.an('object')
    expect(style).to.have.property('sources')
    expect(style.sources).to.have.property('charts-vector')
    expect(style.sources['charts-vector']).to.have.property('tiles')
    expect(style.layers).to.be.an('array')
    expect(style.layers.length).to.be.greaterThan(0)
  })

  it('respects theme selection', () => {
    const provider = createProvider(['DEPARE'])
    const dayStyle = buildNauticalVectorStyle(provider, [], 'day')
    const nightStyle = buildNauticalVectorStyle(provider, [], 'night')

    expect(dayStyle.background).to.not.deep.equal(nightStyle.background)
  })

  it('uses catalog hints for areas and hazards', () => {
    const provider = createProvider(['ACHARE', 'WRECKS', 'NAVLNE'])
    const catalog = [
      {
        id: 'ACHARE',
        aliases: [],
        prettyName: 'Anchorage',
        symbolId: 'ACHARE',
        featureType: 'area',
        s52ColorScheme: { default: '#ff00ff' },
        mapboxRenderingHints: {
          iconId: 'anchor',
          minZoom: 8,
          iconSizeByZoom: { z8: 0.7, z12: 1.0, z16: 1.3 }
        }
      },
      {
        id: 'WRECKS',
        aliases: [],
        prettyName: 'Wreck',
        symbolId: 'WRECKS',
        featureType: 'hazard',
        s52ColorScheme: { default: '#ff00ff' },
        mapboxRenderingHints: { iconId: 'wreck', minZoom: 6 }
      }
    ]

    const style = buildNauticalVectorStyle(provider, catalog)
    expect(style.layers.some((layer) => layer.id.includes('area-pattern'))).to.equal(true)
    expect(style.layers.some((layer) => layer.id.includes('hazard-symbol'))).to.equal(true)
  })

  it('falls back to default POI and hazard icons', () => {
    const provider = createProvider(['BOYLAT', 'LIGHTS', 'WRECKS', 'OBSTRN'])
    const style = buildNauticalVectorStyle(provider, [])
    const symbolLayers = style.layers.filter((layer) => layer.id.includes('symbol'))
    expect(symbolLayers.length).to.be.greaterThan(0)
  })

  it('uses freeboard icon mapping for virtual ATON variants', () => {
    const provider = createProvider(['beacon_virtual_north'])
    const style = buildNauticalVectorStyle(provider, [])
    const layer = style.layers.find((entry) => entry.id === 'poi-symbol-beacon_virtual_north')
    expect(layer).to.be.an('object')
    const iconImage = layer.layout['icon-image']
    expect(iconImage[3]).to.equal('virtual-north')
  })

  it('uses default hazard icon mapping for rock hazards', () => {
    const provider = createProvider(['rock_hazard'])
    const style = buildNauticalVectorStyle(provider, [])
    const layer = style.layers.find((entry) => entry.id === 'hazard-symbol-rock_hazard')
    expect(layer).to.be.an('object')
    const iconImage = layer.layout['icon-image']
    expect(iconImage[3]).to.equal('obstruction')
  })

  it('uses default light icon for light layers', () => {
    const provider = createProvider(['LIGHT'])
    const style = buildNauticalVectorStyle(provider, [])
    const layer = style.layers.find((entry) => entry.id === 'poi-symbol-light')
    expect(layer).to.be.an('object')
    const iconImage = layer.layout['icon-image']
    expect(iconImage[3]).to.equal('light_major')
  })
})
