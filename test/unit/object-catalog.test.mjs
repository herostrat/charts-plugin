import { expect } from 'chai'
import { loadObjectCatalog } from '../../src/catalog/loader.ts'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

describe('loadObjectCatalog', () => {
  it('loads mapping with objects', () => {
    const catalog = loadObjectCatalog()
    expect(catalog).to.be.an('object')
    expect(catalog.objects).to.be.an('array')
  })

  it('returns cached mapping on subsequent calls', () => {
    const first = loadObjectCatalog()
    const second = loadObjectCatalog()
    expect(second).to.equal(first)
  })

  it('returns empty mapping when catalog JSON is invalid', async () => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url))
    const catalogPath = path.resolve(
      __dirname,
      '../../src/catalog/data/object-catalog.json'
    )
    const original = fs.readFileSync(catalogPath, 'utf8')
    try {
      fs.writeFileSync(catalogPath, '{ invalid-json')
      const freshModule = await import(
        `../../src/catalog/loader.ts?cachebust=${Date.now()}`
      )
      const catalog = freshModule.loadObjectCatalog()
      expect(catalog).to.deep.equal({ objects: [] })
    } finally {
      fs.writeFileSync(catalogPath, original)
    }
  })
})
