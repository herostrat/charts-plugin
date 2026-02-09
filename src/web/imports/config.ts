import {
  getDefaultThemeKey,
  getThemeOptions
} from '../../style/nautical-style-generator'

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
  chartsRoot?: string
  vectorTheme?: string
}

export type ConfigService = {
  getEntries: () => ConfigEntry[]
  applyChanges: (changes: ConfigChange[]) => ConfigEntry[]
}

export const createImportsConfigService = (deps: {
  getConfig: () => ImportsWebConfig
  setConfig: (next: ImportsWebConfig) => void
}): ConfigService => {
  const getEntries = (): ConfigEntry[] => {
    const config = deps.getConfig()
    return [
      {
        key: 'chartsRoot',
        name: 'Charts root',
        description: 'Root directory used for imports storage layout.',
        type: 'string',
        value: config.chartsRoot ?? ''
      },
      {
        key: 'vectorTheme',
        name: 'Vector theme',
        description: 'Theme pack and variant used for vector tiles.',
        type: 'enum',
        options: getThemeOptions(),
        value: config.vectorTheme ?? getDefaultThemeKey()
      }
    ]
  }

  const applyChanges = (changes: ConfigChange[]): ConfigEntry[] => {
    const config = deps.getConfig()
    const next: ImportsWebConfig = { ...config }

    for (const change of changes) {
      if (change.key === 'chartsRoot') {
        next.chartsRoot = String(change.value ?? '')
      } else if (change.key === 'vectorTheme') {
        next.vectorTheme = String(change.value ?? '')
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
