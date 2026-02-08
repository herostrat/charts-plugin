import {
  configBtn,
  configClose,
  configList,
  configOverlay,
  configSave,
  configStatus
} from '../core/dom.js'
import type { ConfigEntry } from '../core/state.js'
import { cfg } from '../core/state.js'
import { api } from '../core/api.js'
import { escapeHtml, getErrorMessage } from '../core/utils.js'

let lastFocusEl: Element | null = null

const isDeepEqual = (a: unknown, b: unknown) => {
  if (a === b) return true
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

const inferCfgType = (entry: ConfigEntry) => {
  const t = String(entry?.type || '').toLowerCase()
  if (t) return t
  if (Array.isArray(entry?.options)) return 'enum'
  const v = entry?.value
  if (typeof v === 'boolean') return 'boolean'
  if (typeof v === 'number') return 'number'
  return 'string'
}

const normalizeEnumOptions = (
  opts: unknown
): Array<{ value: string; label: string }> => {
  if (!Array.isArray(opts)) return []
  return opts
    .map((o) => {
      if (o && typeof o === 'object') {
        const obj = o as Record<string, unknown>
        return {
          value: String(obj.value ?? obj.id ?? obj.key ?? ''),
          label: String(obj.label ?? obj.name ?? obj.value ?? obj.id ?? '')
        }
      }
      return { value: String(o), label: String(o) }
    })
    .filter((x) => x.value !== '')
}

const cfgDirtyCount = () => {
  let n = 0
  for (const [k, v] of cfg.current.entries()) {
    const ov = cfg.original.get(k)
    if (!isDeepEqual(v, ov)) n += 1
  }
  return n
}

const updateCfgSaveState = () => {
  const n = cfg.loaded ? cfgDirtyCount() : 0
  if (configSave) configSave.disabled = n === 0
  if (configStatus && cfg.loaded) {
    configStatus.className = 'status'
    configStatus.textContent =
      n === 0
        ? 'No unsaved changes.'
        : `${n} change${n === 1 ? '' : 's'} pending.`
  }
}

const renderCfg = (entries: ConfigEntry[]) => {
  if (!configList) return
  configList.innerHTML = ''

  if (!Array.isArray(entries) || entries.length === 0) {
    const div = document.createElement('div')
    div.className = 'empty'
    div.textContent = 'No configuration entries provided by backend.'
    configList.appendChild(div)
    return
  }

  for (const entry of entries) {
    const key = String(entry.key ?? entry.id ?? entry.name ?? '')
    const name = String(entry.name ?? key)
    const desc = String(entry.description ?? '')
    const type = inferCfgType(entry)

    const row = document.createElement('div')
    row.className = 'cfgRow'

    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_')
    const dirtyId = `cfgDirty__${safeKey}`
    const hostId = `cfgHost__${safeKey}`

    row.innerHTML = `
      <div class="cfgRow__top">
        <div style="min-width:0;">
          <div class="cfgRow__name">${escapeHtml(name)}</div>
          <div class="cfgRow__key">${escapeHtml(key)}</div>
        </div>
        <div class="cfgRow__right">
          <span id="${dirtyId}" class="cfgDirty is-hidden">modified</span>
        </div>
      </div>
      ${desc ? `<div class="cfgRow__desc">${escapeHtml(desc)}</div>` : ''}
      <div id="${hostId}" class="cfgControl"></div>
    `

    const host = row.querySelector(`#${CSS.escape(hostId)}`)
    const dirtyEl = row.querySelector(`#${CSS.escape(dirtyId)}`)

    const originalValue = entry.value
    cfg.original.set(key, originalValue)
    cfg.current.set(key, originalValue)

    const setDirtyUi = () => {
      const isDirty = !isDeepEqual(cfg.current.get(key), cfg.original.get(key))
      dirtyEl?.classList.toggle('is-hidden', !isDirty)
      updateCfgSaveState()
    }

    const setValue = (val: unknown) => {
      cfg.current.set(key, val)
      setDirtyUi()
    }

    if (type === 'boolean') {
      const v = !!cfg.current.get(key)
      if (!host) {
        configList.appendChild(row)
        continue
      }
      host.innerHTML = `
        <label style="display:flex; align-items:center; gap:10px;">
          <input type="checkbox" ${v ? 'checked' : ''} />
          <span style="font-weight:900; font-size:13px;">${v ? 'Enabled' : 'Disabled'}</span>
        </label>
      `
      const cb = host.querySelector(
        'input[type="checkbox"]'
      ) as HTMLInputElement | null
      cb?.addEventListener('change', () => {
        if (!cb) return
        setValue(!!cb.checked)
        const label = host.querySelector('span')
        if (label) label.textContent = cb.checked ? 'Enabled' : 'Disabled'
      })
    } else if (type === 'enum') {
      if (!host) {
        configList.appendChild(row)
        continue
      }
      const opts = normalizeEnumOptions(entry.options)
      const cur = String(cfg.current.get(key) ?? '')
      const sel = document.createElement('select')
      sel.className = 'select'
      for (const o of opts) {
        const op = document.createElement('option')
        op.value = o.value
        op.textContent = o.label
        if (o.value === cur) op.selected = true
        sel.appendChild(op)
      }
      sel.addEventListener('change', () => setValue(sel.value))
      host.appendChild(sel)
    } else if (type === 'number') {
      if (!host) {
        configList.appendChild(row)
        continue
      }
      const inp = document.createElement('input')
      inp.className = 'input'
      inp.type = 'number'
      const rawOptions = entry.options
      const options =
        rawOptions &&
        typeof rawOptions === 'object' &&
        !Array.isArray(rawOptions)
          ? (rawOptions as Record<string, unknown>)
          : {}
      if (options.min != null) inp.min = String(options.min)
      if (options.max != null) inp.max = String(options.max)
      if (options.step != null) inp.step = String(options.step)
      const cur = cfg.current.get(key)
      inp.value =
        cur === null || cur === undefined || cur === '' ? '' : String(cur)
      inp.addEventListener('input', () => {
        const v = String(inp.value).trim()
        if (!v) return setValue(null)
        const n = Number(v)
        if (Number.isFinite(n)) setValue(n)
      })
      host.appendChild(inp)
    } else {
      if (!host) {
        configList.appendChild(row)
        continue
      }
      const inp = document.createElement('input')
      inp.className = 'input'
      inp.type = 'text'
      const cur = cfg.current.get(key)
      inp.value = cur === null || cur === undefined ? '' : String(cur)
      inp.placeholder = entry.placeholder ? String(entry.placeholder) : ''
      inp.addEventListener('input', () => setValue(inp.value))
      host.appendChild(inp)
    }

    setDirtyUi()
    configList.appendChild(row)
  }

  updateCfgSaveState()
}

const openConfig = async () => {
  if (!configOverlay) return
  lastFocusEl = document.activeElement
  configOverlay.classList.remove('is-hidden')
  if (configStatus) {
    configStatus.className = 'status'
    configStatus.textContent = 'Loading configuration...'
  }
  if (configList) configList.innerHTML = ''

  try {
    const data: unknown = await api.getConfig()
    const entries: ConfigEntry[] = Array.isArray(data)
      ? (data as ConfigEntry[])
      : Array.isArray((data as { entries?: unknown } | null)?.entries)
        ? ((data as { entries?: unknown }).entries as ConfigEntry[])
        : []
    cfg.entries = entries
    cfg.loaded = true
    renderCfg(entries)
  } catch (err: unknown) {
    cfg.loaded = false
    if (configStatus) {
      configStatus.className = 'status is-bad'
      configStatus.textContent = `Failed to load configuration: ${getErrorMessage(err)}`
    }
  }
}

const closeConfig = () => {
  if (!configOverlay) return
  configOverlay.classList.add('is-hidden')
  if (lastFocusEl instanceof HTMLElement) {
    try {
      lastFocusEl.focus()
    } catch (err) {
      void err
    }
  }
  lastFocusEl = null
}

const saveConfig = async () => {
  if (!cfg.loaded) return

  const changes: Array<{ key: string; value: unknown }> = []
  for (const [k, v] of cfg.current.entries()) {
    const ov = cfg.original.get(k)
    if (!isDeepEqual(v, ov)) changes.push({ key: k, value: v })
  }

  if (!changes.length) {
    updateCfgSaveState()
    return
  }

  if (configStatus) {
    configStatus.className = 'status'
    configStatus.textContent = 'Saving changes...'
  }
  if (configSave) configSave.disabled = true

  try {
    const resp: unknown = await api.setConfig(changes)
    const entries: ConfigEntry[] | null = Array.isArray(resp)
      ? (resp as ConfigEntry[])
      : Array.isArray((resp as { entries?: unknown } | null)?.entries)
        ? ((resp as { entries?: unknown }).entries as ConfigEntry[])
        : null

    if (entries) {
      cfg.entries = entries
      cfg.original = new Map()
      cfg.current = new Map()
      for (const e of entries) {
        const key = String(e.key ?? e.id ?? e.name ?? '')
        cfg.original.set(key, e.value)
        cfg.current.set(key, e.value)
      }
      renderCfg(entries)
    } else {
      for (const c of changes) cfg.original.set(c.key, cfg.current.get(c.key))
      renderCfg(cfg.entries)
    }

    if (configStatus) {
      configStatus.className = 'status'
      configStatus.textContent = 'Saved.'
    }
    updateCfgSaveState()
  } catch (err: unknown) {
    if (configStatus) {
      configStatus.className = 'status is-bad'
      configStatus.textContent = `Save failed: ${getErrorMessage(err)}`
    }
    updateCfgSaveState()
  }
}

export const initConfig = () => {
  configBtn?.addEventListener('click', openConfig)
  configClose?.addEventListener('click', closeConfig)
  configSave?.addEventListener('click', saveConfig)
  configOverlay?.addEventListener('click', (e) => {
    if (e.target === configOverlay) closeConfig()
  })

  return { closeConfig }
}
