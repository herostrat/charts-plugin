import fs from 'fs'
import path from 'path'
import * as chai from 'chai'

const { expect } = chai

const catalogPath = path.resolve('src/style/mapping/object-catalog.json')
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))

const coreIds = [
  'ACHARE',
  'BCNCAR',
  'BCNISD',
  'BCNLAT',
  'BCNSAW',
  'BOYCAR',
  'BOYINB',
  'BOYISD',
  'BOYLAT',
  'BOYSAW',
  'BOYSPP',
  'BUAARE',
  'COALNE',
  'DEPARE',
  'DEPCNT',
  'FAIRWY',
  'LIGHTS',
  'LNDARE',
  'NAVLNE',
  'OBSTRN',
  'SOUNDG',
  'WRECKS'
]

const findById = (id) => (catalog.objects || []).find((obj) => obj.id === id)

describe('Nautical catalog: core entries', () => {
  it('loads object catalog JSON', () => {
    expect(catalog).to.be.an('object')
    expect(catalog.objects).to.be.an('array')
  })

  it('contains all core object ids', () => {
    const missing = coreIds.filter((id) => !findById(id))
    expect(missing, `Missing entries: ${missing.join(', ')}`).to.deep.equal([])
  })

  it('core entries include rendering hints', () => {
    coreIds.forEach((id) => {
      const entry = findById(id)
      expect(entry, `${id} not found`).to.be.ok
      expect(entry.featureType, `${id} featureType missing`).to.be.a('string')
      expect(entry.s52ColorScheme, `${id} s52ColorScheme missing`).to.be.an('object')
      expect(entry.s52ColorScheme.default, `${id} s52ColorScheme.default missing`).to.be.a('string')
      expect(entry.mapboxRenderingHints, `${id} mapboxRenderingHints missing`).to.be.an('object')
      expect(entry.mapboxRenderingHints.layerType, `${id} layerType missing`).to.be.a('string')
    })
  })
})
