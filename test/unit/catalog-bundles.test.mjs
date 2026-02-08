import fs from 'fs'
import path from 'path'
import os from 'os'
import { expect } from 'chai'
import { fileURLToPath } from 'url'
import { findCharts } from '../../src/tiles/catalog/scanner.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const fixturesRoot = path.resolve(__dirname, '..', 'fixtures')
const pmtilesFixture = path.join(fixturesRoot, 'pmtiles', 'test_fixture_1.pmtiles')

const createTempDir = () =>
  fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'charts-bundles-'))

const writeMetadata = (dir, name, bounds) => {
  const metadata = {
    schemaVersion: 1,
    id: name,
    name,
    description: `bundle ${name}`,
    bounds,
    minzoom: 0,
    maxzoom: 5,
    format: 'mvt',
    type: 'tilelayer'
  }
  fs.writeFileSync(path.join(dir, 'metadata.json'), JSON.stringify(metadata, null, 2))
}

describe('Chart bundle scanning', () => {
  it('maps metadata.json to bundled pmtiles files', async () => {
    const root = createTempDir()
    const bundleA = path.join(root, 'bundle-a')
    const bundleB = path.join(root, 'bundle-b')
    fs.mkdirSync(bundleA)
    fs.mkdirSync(bundleB)

    fs.copyFileSync(pmtilesFixture, path.join(bundleA, 'chart.pmtiles'))
    fs.copyFileSync(pmtilesFixture, path.join(bundleB, 'chart.pmtiles'))

    writeMetadata(bundleA, 'Bundle A', [10, 20, 30, 40])
    writeMetadata(bundleB, 'Bundle B', [1, 2, 3, 4])

    const charts = await findCharts(root)
    expect(Object.keys(charts)).to.include('bundle-a')
    expect(Object.keys(charts)).to.include('bundle-b')

    expect(charts['bundle-a'].name).to.equal('Bundle A')
    expect(charts['bundle-a'].bounds).to.deep.equal([10, 20, 30, 40])
    expect(charts['bundle-b'].name).to.equal('Bundle B')
    expect(charts['bundle-b'].bounds).to.deep.equal([1, 2, 3, 4])
  })
})
