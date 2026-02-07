import { expect } from 'chai'
import { loadS52Mapping } from '../../src/resources/s52-mapping.ts'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

describe('loadS52Mapping', () => {
  it('loads mapping with objects', () => {
    const mapping = loadS52Mapping()
    expect(mapping).to.be.an('object')
    expect(mapping.objects).to.be.an('array')
  })

  it('returns cached mapping on subsequent calls', () => {
    const first = loadS52Mapping()
    const second = loadS52Mapping()
    expect(second).to.equal(first)
  })

  it('returns empty mapping when catalog JSON is invalid', async () => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url))
    const catalogPath = path.resolve(
      __dirname,
      '../../src/assets/s52/object-catalog.json'
    )
    const original = fs.readFileSync(catalogPath, 'utf8')
    try {
      fs.writeFileSync(catalogPath, '{ invalid-json')
      const freshModule = await import(
        `../../src/resources/s52-mapping.ts?cachebust=${Date.now()}`
      )
      const mapping = freshModule.loadS52Mapping()
      expect(mapping).to.deep.equal({ objects: [] })
    } finally {
      fs.writeFileSync(catalogPath, original)
    }
  })
})
