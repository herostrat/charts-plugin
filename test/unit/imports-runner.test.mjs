import { expect } from 'chai'
import { runConversion } from '../../src/imports/runner.ts'

describe('Imports runner', () => {
  it('throws for unsupported conversion types', async () => {
    let error
    try {
      await runConversion('/tmp/sample.mbtiles', {
        detectedType: 'mbtiles',
        outputDir: '/tmp',
        target: { target: 'pmtiles', format: 'png', maxZoom: 1 }
      })
    } catch (err) {
      error = err
    }

    expect(error).to.be.instanceOf(Error)
    expect(error.message).to.match(/Conversion not supported/)
  })
})
