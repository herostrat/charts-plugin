export type ConfigEntry = {
  key?: unknown
  id?: unknown
  name?: unknown
  value?: unknown
  type?: unknown
  options?: unknown
  description?: unknown
  placeholder?: unknown
}

export type ImportItem = {
  id?: unknown
  filename?: unknown
  sizeBytes?: unknown
  detectedType?: unknown
  metadata?: { bounds?: unknown } | undefined
  meta?: { bounds?: unknown } | undefined
  sourcePath?: unknown
  sourceUrl?: unknown
  streamUrl?: unknown
  streamType?: unknown
  output?: unknown
  stagingDir?: unknown
  state?: unknown
  errors?: unknown
  warnings?: unknown
  minZoom?: unknown
  minzoom?: unknown
  maxZoom?: unknown
  maxzoom?: unknown
  updatedAt?: unknown
  updated?: unknown
  date?: unknown
  timestamp?: unknown
}

export type ImportJob = {
  id?: unknown
  state?: unknown
  createdAt?: unknown
  updatedAt?: unknown
  items?: ImportItem[] | unknown
  errors?: unknown
}

export type ImportCapabilities = {
  supported?: string[]
  blocked?: Array<{ type: string; reason?: string; missing?: string[] }>
  tools?: Record<string, { available?: boolean; details?: string }>
}

export type OnlineProviderRecord = {
  id: string
  name: string
  description?: string
  minzoom: number
  maxzoom: number
  serverType?: string
  format?: string
  url: string
  proxy?: boolean
  headers?: string[]
  layers?: string[]
  bounds?: number[]
  createdAt?: string
  updatedAt?: string
}

export const cfg = {
  loaded: false,
  entries: [] as ConfigEntry[],
  original: new Map<string, unknown>(),
  current: new Map<string, unknown>()
}

export const state = {
  jobs: [] as ImportJob[],
  providers: [] as OnlineProviderRecord[],
  capabilities: null as ImportCapabilities | null,
  focusedKey: null as string | null,
  mapHidden: false,
  filter: 'active',
  sse: {
    es: null as EventSource | null,
    status: 'off',
    lastEventAt: 0,
    watchdog: null as number | null
  },
  download: { typeOverridden: false },
  upload: { typeOverridden: false }
}
