import { expect } from 'chai';
import { registerTileRoutes } from '../../src/tiles/router.ts';

describe('registerTileRoutes', () => {
  it('should export a function', () => {
    expect(registerTileRoutes).to.be.a('function');
  });
  // Weitere Tests für normalizeParam, isValidTileParam, Fehlerfälle und Routing folgen
});
