import { defineConfig } from 'tsup'

const outDir = process.env.PLUGIN_OUT_DIR || 'plugin'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  outDir,
  dts: true,
  clean: true,
  platform: 'node',
  external: [
    'express',
    'lodash',
    '@signalk/mbtiles',
    '@signalk/server-api',
    'pmtiles',
    'xml2js',
    '@turf/bbox',
    '@turf/boolean-intersects',
    '@turf/helpers',
    'check-disk-space',
    'geojson-antimeridian-cut',
    'p-limit'
  ]
})
