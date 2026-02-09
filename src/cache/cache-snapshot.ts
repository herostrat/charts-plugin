import fs from 'fs'
import path from 'path'
import { safeMove } from '../imports/storage'
import { runPmtilesConvert } from '../utils/pmtiles-cli'

export const createCacheSnapshot = async (opts: {
  cachePath: string
  identifier: string
  outputPath: string
}) => {
  const cacheFile = path.join(
    opts.cachePath,
    'mbtiles',
    `${opts.identifier}.mbtiles`
  )
  if (!fs.existsSync(cacheFile)) {
    throw new Error(`Cache MBTiles not found at ${cacheFile}`)
  }
  const stagingPath = `${opts.outputPath}.staging`
  await runPmtilesConvert(cacheFile, stagingPath)
  await safeMove(stagingPath, opts.outputPath)
  return opts.outputPath
}
