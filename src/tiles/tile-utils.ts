// Tile and BBox utilities extracted from chart-downloader for better testability
export function lonLatToTileXY(
  lon: number,
  lat: number,
  zoom: number
): [number, number] {
  const n = 2 ** zoom
  // Clamp latitude to Web Mercator limits
  lat = Math.max(Math.min(lat, 85.0511), -85.0511)
  let x = ((lon + 180) / 360) * n
  let y =
    ((1 -
      Math.log(
        Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)
      ) /
        Math.PI) /
      2) *
    n
  // Clamp x and y to [0, n-1]
  x = Math.floor(Math.min(Math.max(x, 0), n - 1))
  y = Math.floor(Math.min(Math.max(y, 0), n - 1))
  return [x, y]
}

export function tileToBBox(
  x: number,
  y: number,
  z: number
): [number, number, number, number] {
  const n = 2 ** z
  const lon1 = (x / n) * 360 - 180
  const lat1 =
    (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI
  const lon2 = ((x + 1) / n) * 360 - 180
  const lat2 =
    (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n))) * 180) / Math.PI
  return [lon1, lat2, lon2, lat1]
}

export interface Tile {
  x: number
  y: number
  z: number
}

export function getSubTiles(tile: Tile, maxZoom: number): Tile[] {
  const tiles: Tile[] = [tile]
  for (let z = tile.z + 1; z <= maxZoom; z++) {
    const zoomDiff = z - tile.z
    const factor = Math.pow(2, zoomDiff)
    const startX = tile.x * factor
    const startY = tile.y * factor
    for (let x = startX; x < startX + factor; x++) {
      for (let y = startY; y < startY + factor; y++) {
        tiles.push({ x, y, z })
      }
    }
  }
  return tiles
}
