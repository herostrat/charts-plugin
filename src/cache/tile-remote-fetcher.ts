import type { ChartProvider } from '../types'
import type { Tile } from './tile-types'

export const fetchTileFromRemote = async (
  provider: ChartProvider,
  tile: Tile,
  timeoutMs = 5000
): Promise<Buffer | null> => {
  if (!provider.remoteUrl) {
    console.error(`No remote URL defined for provider ${provider.name}`)
    return null
  }
  const url = provider.remoteUrl
    .replace('{z}', tile.z.toString())
    .replace('{z-2}', (tile.z - 2).toString())
    .replace('{x}', tile.x.toString())
    .replace('{y}', tile.y.toString())
    .replace('{-y}', (Math.pow(2, tile.z) - 1 - tile.y).toString())
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      headers: provider.headers,
      signal: controller.signal
    })
    if (!response.ok) {
      return null
    }
    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  } catch {
    return null
  } finally {
    clearTimeout(id)
  }
}
