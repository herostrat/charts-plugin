import type { ChartProvider } from '../../types'

type MbtilesInstance = {
  getInfo: (
    callback: (err: Error | null, metadata: Record<string, unknown>) => void
  ) => void
}

type MbtilesConstructor = new (
  file: string,
  callback: (err: Error | null, mbtiles: MbtilesInstance) => void
) => void

type MbtilesResult = {
  mbtiles: MbtilesInstance
  metadata: Record<string, unknown>
}

const parseZoom = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

// Dynamically load MBTiles to prevent module load failure
let MBTiles: MbtilesConstructor | null = null
let mbtilesLoadError: Error | null = null

export const ensureMbtilesLoaded = async () => {
  if (MBTiles === null && mbtilesLoadError === null) {
    try {
      const module = await import('@signalk/mbtiles')
      MBTiles = (module.default || module) as MbtilesConstructor
    } catch (err) {
      mbtilesLoadError = err as Error
      console.error(
        'Failed to load @signalk/mbtiles module:',
        (err as Error).message
      )
    }
  }
}

export const getMbtilesLoadError = () => mbtilesLoadError

export const openMbtilesFile = (file: string, filename: string) => {
  if (!MBTiles) {
    return Promise.reject(new Error('MBTiles module not loaded'))
  }
  const MbtilesCtor = MBTiles
  return new Promise<MbtilesResult>((resolve, reject) => {
    new MbtilesCtor(file, (err: Error | null, mbtiles: MbtilesInstance) => {
      if (err) {
        return reject(err)
      }
      mbtiles.getInfo(
        (err: Error | null, metadata: Record<string, unknown>) => {
          if (err) {
            return reject(err)
          }
          return resolve({ mbtiles, metadata })
        }
      )
    })
  })
    .then((res: MbtilesResult) => {
      const metadata = res.metadata
      if (
        !metadata ||
        metadata.bounds === undefined ||
        metadata.format === undefined
      ) {
        return null
      }
      // Robust: accept bounds as array or string
      let bounds: number[] | undefined
      if (Array.isArray(metadata.bounds)) {
        bounds = metadata.bounds.map((v) =>
          typeof v === 'string' ? parseFloat(v) : (v as number)
        )
      } else if (typeof metadata.bounds === 'string') {
        bounds = metadata.bounds.split(',').map((b) => parseFloat(b.trim()))
      }
      if (
        !bounds ||
        bounds.length !== 4 ||
        bounds.some((v) => typeof v !== 'number' || isNaN(v))
      ) {
        return null
      }
      // Defensive check for format validity
      if (typeof metadata.format !== 'string' || !metadata.format.length) {
        return null
      }
      const vectorLayers = Array.isArray(metadata.vector_layers)
        ? metadata.vector_layers
        : []
      const identifier = filename.replace(/\.mbtiles$/i, '')
      const name =
        typeof metadata.name === 'string'
          ? metadata.name
          : typeof metadata.id === 'string'
            ? metadata.id
            : ''
      const description =
        typeof metadata.description === 'string' ? metadata.description : ''
      const scale =
        typeof metadata.scale === 'string' || typeof metadata.scale === 'number'
          ? parseInt(String(metadata.scale), 10) || 250000
          : 250000
      const data: ChartProvider = {
        _fileFormat: 'mbtiles',
        _filePath: file,
        _mbtilesHandle: res.mbtiles,
        _flipY: false,
        identifier,
        name,
        description,
        bounds,
        minzoom: parseZoom(metadata.minzoom),
        maxzoom: parseZoom(metadata.maxzoom),
        format: metadata.format,
        type: 'tilelayer',
        scale,
        v1: {
          tilemapUrl: `~tilePath~/${identifier}/{z}/{x}/{y}`,
          chartLayers: vectorLayers.length
            ? parseVectorLayers(vectorLayers)
            : []
        },
        v2: {
          url: `~tilePath~/${identifier}/{z}/{x}/{y}`,
          layers: vectorLayers.length ? parseVectorLayers(vectorLayers) : []
        }
      }
      return data
    })
    .catch((e: Error) => {
      console.error(`Error loading chart ${file}`, e.message)
      return null
    })
}

const parseVectorLayers = (layers: Array<{ id: string }>) => {
  return layers.map((l) => l.id)
}
