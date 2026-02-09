import { expect } from 'chai'
import { apiRoutePrefix } from '../../src/constants.ts'
import { CHART_TILES_PATH, CHART_STYLE_PATH } from '../../src/routes/paths.ts'
import { DEFAULT_CACHE_HEADERS } from '../../src/tiles/headers.ts'

describe('core constants (ts)', () => {
  it('exposes api route prefixes', () => {
    expect(apiRoutePrefix[1]).to.equal('/signalk/v1/api/resources')
    expect(apiRoutePrefix[2]).to.equal('/signalk/v2/api/resources')
  })

  it('exposes chart route paths', () => {
    expect(CHART_TILES_PATH).to.equal('/signalk/chart-tiles')
    expect(CHART_STYLE_PATH).to.equal('/signalk/chart-style')
  })

  it('defines default cache headers', () => {
    expect(DEFAULT_CACHE_HEADERS).to.deep.equal({
      'Cache-Control': 'public, max-age=7776000'
    })
  })
})
