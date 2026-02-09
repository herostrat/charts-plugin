export const isAllowedTileFormat = (format?: string) => {
  const allowedFormats = new Set([
    'png',
    'jpg',
    'jpeg',
    'pbf',
    'mvt',
    'webp',
    'avif'
  ])
  const normalized = format ? format.toLowerCase() : ''
  return normalized !== '' && allowedFormats.has(normalized)
}

export const resolveTileContentType = (format?: string) => {
  const normalized = format ? format.toLowerCase() : ''
  switch (normalized) {
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'webp':
    case 'avif':
      return `image/${normalized === 'jpg' ? 'jpeg' : normalized}`
    case 'pbf':
    case 'mvt':
      return 'application/vnd.mapbox-vector-tile'
    default:
      return 'application/octet-stream'
  }
}

export const isGzipBuffer = (buffer: Buffer) => {
  return buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b
}

export const isVectorFormat = (format?: string) => {
  if (!format) {
    return false
  }
  const normalized = format.toLowerCase()
  return normalized === 'pbf' || normalized === 'mvt'
}
