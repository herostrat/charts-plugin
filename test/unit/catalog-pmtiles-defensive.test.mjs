import { openPmtilesFile } from '../../src/tiles/catalog/pmtiles.ts';
import path from 'path';
import { expect } from 'chai';
import { fileURLToPath } from 'url';

describe('openPmtilesFile defensive structure tests', () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const fixturesRoot = path.resolve(__dirname, '../fixtures/pmtiles');

  it('returns null for invalid or empty PMTiles files', async () => {
    const empty = await openPmtilesFile(
      path.resolve(fixturesRoot, 'empty.pmtiles'),
      'empty.pmtiles'
    )
    expect(empty).to.be.null

    const invalid = await openPmtilesFile(
      path.resolve(fixturesRoot, 'invalid.pmtiles'),
      'invalid.pmtiles'
    )
    expect(invalid).to.be.null
  })

  it('loads metadata for a valid PMTiles file', async () => {
    const chart = await openPmtilesFile(
      path.resolve(fixturesRoot, 'test_fixture_1.pmtiles'),
      'test_fixture_1.pmtiles'
    )
    expect(chart).to.be.an('object')
    expect(chart.bounds).to.be.an('array').with.lengthOf(4)
    expect(chart.minzoom).to.be.a('number')
    expect(chart.maxzoom).to.be.a('number')
  })
});
