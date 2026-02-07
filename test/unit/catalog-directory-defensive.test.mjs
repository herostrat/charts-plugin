import { openDirectoryChart } from '../../src/tiles/catalog/directory.ts';
import path from 'path';
import { expect } from 'chai';
import { fileURLToPath } from 'url';

describe('openDirectoryChart defensive structure tests', () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const fixturesRoot = path.resolve(__dirname, '../fixtures/directory');

  it('returns null for missing metadata.json and tilemapresource.xml', async () => {
    const chart = await openDirectoryChart(
      path.join(fixturesRoot, 'bad-missing-metadata'),
      'bad-missing-metadata'
    );
    expect(chart).to.be.null;
  });

  it('returns null for invalid/corrupt metadata.json', async () => {
    const chart = await openDirectoryChart(
      path.join(fixturesRoot, 'bad-invalid-json'),
      'bad-invalid-json'
    );
    expect(chart).to.be.null;
  });

  it('returns null for missing tilemapresource.xml and missing metadata.json', async () => {
    const chart = await openDirectoryChart(
      path.join(fixturesRoot, 'bad-missing-tilemapresource'),
      'bad-missing-tilemapresource'
    );
    expect(chart).to.be.null;
  });

  it('returns null for corrupt tilemapresource.xml', async () => {
    const chart = await openDirectoryChart(
      path.join(fixturesRoot, 'bad-corrupt-tilemapresource'),
      'bad-corrupt-tilemapresource'
    );
    expect(chart).to.be.null;
  });
});
