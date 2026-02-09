import fs from 'fs/promises'
import path from 'path'
import type { OnlineChartProvider } from '../types'

export type OnlineProviderRecord = OnlineChartProvider & {
  id: string
  createdAt: string
  updatedAt: string
}

type PersistedPayload = {
  providers: OnlineProviderRecord[]
}

let providers = new Map<string, OnlineProviderRecord>()
let persistencePath: string | null = null
let persistTimer: NodeJS.Timeout | null = null
let isHydrating = false

const nowIso = () => new Date().toISOString()

const schedulePersist = () => {
  if (!persistencePath || isHydrating) {
    return
  }
  if (persistTimer) {
    return
  }
  persistTimer = setTimeout(() => {
    persistTimer = null
    persistStore().catch((err) => {
      console.error('Failed to persist online providers:', err)
    })
  }, 250)
}

const persistStore = async () => {
  if (!persistencePath) {
    return
  }
  await fs.mkdir(path.dirname(persistencePath), { recursive: true })
  const payload: PersistedPayload = {
    providers: Array.from(providers.values())
  }
  await fs.writeFile(persistencePath, JSON.stringify(payload, null, 2))
}

export const setOnlineProvidersPersistence = (filePath: string) => {
  persistencePath = filePath
}

export const loadOnlineProvidersFromFile = async (filePath: string) => {
  persistencePath = filePath
  let raw: string
  try {
    raw = await fs.readFile(filePath, { encoding: 'utf8' })
  } catch {
    return
  }

  try {
    const parsed = JSON.parse(raw) as PersistedPayload
    if (!Array.isArray(parsed.providers)) {
      return
    }
    isHydrating = true
    providers = new Map(
      parsed.providers
        .filter((entry) => entry && typeof entry.id === 'string')
        .map((entry) => [entry.id, entry])
    )
  } catch (err) {
    console.error('Failed to load online providers:', err)
  } finally {
    isHydrating = false
  }
}

export const listOnlineProviders = (): OnlineProviderRecord[] => {
  return Array.from(providers.values())
}

export const addOnlineProvider = (
  input: OnlineChartProvider & { id?: string }
): OnlineProviderRecord => {
  const id =
    input.id && String(input.id).trim().length > 0
      ? String(input.id).trim()
      : `op-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
  const now = nowIso()
  const record: OnlineProviderRecord = {
    ...input,
    id,
    createdAt: now,
    updatedAt: now
  }
  providers.set(id, record)
  schedulePersist()
  return record
}

export const deleteOnlineProvider = (id: string) => {
  const record = providers.get(id)
  if (!record) {
    return null
  }
  providers.delete(id)
  schedulePersist()
  return record
}
