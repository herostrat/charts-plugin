import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import type { S52ObjectDefinition } from '../style/nautical-catalog'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

type S52Mapping = {
  version?: string
  objects?: S52ObjectDefinition[]
}

let cachedS52Mapping: S52Mapping | null = null

export const loadS52Mapping = (): S52Mapping => {
  if (cachedS52Mapping) {
    return cachedS52Mapping
  }
  const candidates = [
    path.resolve(__dirname, '../src/style/mapping/object-catalog.json'),
    path.resolve(__dirname, '../style/mapping/object-catalog.json')
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        const raw = fs.readFileSync(candidate, 'utf8')
        cachedS52Mapping = JSON.parse(raw) as S52Mapping
        return cachedS52Mapping
      } catch {
        break
      }
    }
  }
  cachedS52Mapping = { objects: [] }
  return cachedS52Mapping
}
