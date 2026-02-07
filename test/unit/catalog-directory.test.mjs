import { openDirectoryChart } from '../../src/tiles/catalog/directory.ts';
import path from 'path';
import { expect } from 'chai';
import { fileURLToPath } from 'url';

describe('openDirectoryChart', () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const fixturesRoot = path.resolve(__dirname, '../fixtures/directory');
  const tmsFixturesRoot = path.resolve(__dirname, '../fixtures/tms');

  it('parses tilemapresource.xml correctly', async () => {
    const chart = await openDirectoryChart(
      path.join(tmsFixturesRoot, 'tms-tiles'),
      'tms-tiles'
    );
    expect(chart).to.be.an('object');
    expect(chart).to.have.property('format').that.is.a('string');
    expect(chart).to.have.property('bounds').that.is.an('array').with.lengthOf(4);
    expect(chart).to.have.property('minzoom');
    expect(chart).to.have.property('maxzoom');
    expect(chart).to.have.property('_flipY', true);
  });

  it('parses metadata.json correctly', async () => {
    const chart = await openDirectoryChart(
      path.join(fixturesRoot, 'unpacked-tiles'),
      'unpacked-tiles'
    );
    expect(chart).to.be.an('object');
    expect(chart).to.have.property('format').that.is.a('string');
    expect(chart).to.have.property('bounds').that.is.an('array').with.lengthOf(4);
    expect(chart).to.have.property('minzoom');
    expect(chart).to.have.property('maxzoom');
    expect(chart).to.have.property('_flipY', false);
  });

  it('loads chart even with unsupported format', async () => {
    const chart = await openDirectoryChart(
      path.join(fixturesRoot, 'invalid-format'),
      'invalid-format'
    );
    expect(chart).to.be.an('object');
    expect(chart).to.have.property('format', 'gif');
  });

  it('returns null for missing files', async () => {
    const chart = await openDirectoryChart(
      path.join(fixturesRoot, 'does-not-exist'),
      'does-not-exist'
    );
    expect(chart).to.be.null;
  });
});
