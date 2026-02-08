export type ConfigEntry = {
  key: string
  name: string
  description?: string
  type?: 'string' | 'number' | 'boolean' | 'enum'
  options?: unknown
  value: unknown
}

export type ConfigChange = {
  key: string
  value: unknown
}

export type ImportsWebConfig = {
  chartPaths?: string[]
  cachePath?: string
}

export type ConfigService = {
  getEntries: () => ConfigEntry[]
  applyChanges: (changes: ConfigChange[]) => ConfigEntry[]
}

const normalizeChartPaths = (value: unknown) => {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter((v) => v.length > 0)
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0)
  }
  return []
}

export const createImportsConfigService = (deps: {
  getConfig: () => ImportsWebConfig
  setConfig: (next: ImportsWebConfig) => void
}): ConfigService => {
  const getEntries = (): ConfigEntry[] => {
    const config = deps.getConfig()
    return [
      {
        key: 'chartPaths',
        name: 'Chart paths',
        description: 'Comma-separated chart paths for local discovery.',
        type: 'string',
        value: (config.chartPaths ?? []).join(', ')
      },
      {
        key: 'cachePath',
        name: 'Cache path',
        description: 'Directory used for cached tiles.',
        type: 'string',
        value: config.cachePath ?? ''
      }
    ]
  }

  const applyChanges = (changes: ConfigChange[]): ConfigEntry[] => {
    const config = deps.getConfig()
    const next: ImportsWebConfig = { ...config }

    for (const change of changes) {
      if (change.key === 'chartPaths') {
        next.chartPaths = normalizeChartPaths(change.value)
      } else if (change.key === 'cachePath') {
        next.cachePath = String(change.value ?? '')
      }
    }

    deps.setConfig(next)
    return getEntries()
  }

  return { getEntries, applyChanges }
}

export const defaultConfigService: ConfigService = {
  getEntries: () => [],
  applyChanges: () => []
}
