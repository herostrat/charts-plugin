import { openMbtilesFile, ensureMbtilesLoaded } from '../../src/tiles/catalog/mbtiles.ts';
import path from 'path';
import { expect } from 'chai';
import { fileURLToPath } from 'url';

describe('openMbtilesFile defensive structure tests', () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const fixturesRoot = path.resolve(__dirname, '../fixtures/mbtiles');

  before(async () => {
    await ensureMbtilesLoaded();
  });

  it('parses bounds and zoom values from MBTiles metadata', async () => {
    const chart = await openMbtilesFile(
      path.resolve(fixturesRoot, 'test.mbtiles'),
      'test.mbtiles'
    )
    expect(chart).to.be.an('object')
    expect(chart.bounds).to.be.an('array').with.lengthOf(4)
    expect(chart.minzoom).to.be.a('number')
    expect(chart.maxzoom).to.be.a('number')
  })

  it('returns null for a missing MBTiles file', async () => {
    const chart = await openMbtilesFile(
      path.resolve(fixturesRoot, 'does-not-exist.mbtiles'),
      'does-not-exist.mbtiles'
    )
    expect(chart).to.be.null
  })
});
