import { expect } from 'chai';
import { describe, it } from 'mocha';
import { registerTileRoutes } from '../../src/tiles/routes.ts';

// Hilfsfunktionen aus router extrahieren für Unit-Tests
const normalizeParam = (value) => {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }
  return value ?? '';
};
const isValidTileParam = (value) => /^\d+$/.test(value);

describe('router helpers', () => {
  it('normalizeParam returns first element for array', () => {
    expect(normalizeParam(['foo', 'bar'])).to.equal('foo');
  });
  it('normalizeParam returns value for string', () => {
    expect(normalizeParam('foo')).to.equal('foo');
  });
  it('normalizeParam returns empty string for undefined', () => {
    expect(normalizeParam(undefined)).to.equal('');
  });
  it('isValidTileParam returns true for digits', () => {
    expect(isValidTileParam('123')).to.be.true;
  });
  it('isValidTileParam returns false for non-digits', () => {
    expect(isValidTileParam('12a')).to.be.false;
    expect(isValidTileParam('')).to.be.false;
    expect(isValidTileParam('-1')).to.be.false;
  });
});
