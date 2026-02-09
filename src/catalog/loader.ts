import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import type { ChartObjectDefinition } from './schema'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

type ObjectCatalog = {
  version?: string
  objects?: ChartObjectDefinition[]
}

let cachedCatalog: ObjectCatalog | null = null

export const loadObjectCatalog = (): ObjectCatalog => {
  if (cachedCatalog) {
    return cachedCatalog
  }
  const candidates = [
    path.resolve(__dirname, './data/object-catalog.json'),
    path.resolve(__dirname, './catalog/data/object-catalog.json'),
    path.resolve(__dirname, './style/mapping/object-catalog.json'),
    path.resolve(__dirname, '../style/mapping/object-catalog.json')
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        const raw = fs.readFileSync(candidate, 'utf8')
        cachedCatalog = JSON.parse(raw) as ObjectCatalog
        return cachedCatalog
      } catch {
        break
      }
    }
  }
  cachedCatalog = { objects: [] }
  return cachedCatalog
}
