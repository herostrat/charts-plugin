import {
  currentPathEl,
  fsListEl,
  goBtn,
  localHeavyWarn,
  localMetaBox,
  localMetaStatus,
  localTypeEl,
  pathInput,
  registerBtn,
  registerStatus,
  selectedFileEl,
  upBtn
} from '../core/dom.js'
import { state } from '../core/state.js'
import { api } from '../core/api.js'
import { clearError, setHeavyWarn, setStatus, showError } from '../core/ui.js'
import {
  detectTypeFromName,
  escapeHtml,
  fmtBytes,
  fmtIso,
  getErrorMessage,
  isSupportedType,
  requiresMeta
} from '../core/utils.js'
import {
  getRequiredMeta,
  toggleMetaBox,
  validateFolderMeta,
  wireMetaInputs
} from '../core/meta.js'

type FsEntry = {
  name: string
  path: string
  size?: number
  mtime?: string
  type: 'directory' | 'file'
}

type FsResponse = {
  path?: string
  parent?: string | null
  entries?: unknown
}

export const loadDir = async (path: string) => {
  clearError()
  if (fsListEl) fsListEl.innerHTML = ''

  const skeleton = document.createElement('li')
  skeleton.className = 'fs__item'
  skeleton.innerHTML = `<div class="fs__left"><div class="fs__name">Loading...</div><div class="fs__meta">Listing server filesystem</div></div>`
  fsListEl?.appendChild(skeleton)

  try {
    const data = (await api.fs(path)) as FsResponse
    state.fsPath = data.path ?? path
    state.fsParent = data.parent ?? null

    if (currentPathEl) currentPathEl.textContent = state.fsPath
    if (pathInput) pathInput.value = state.fsPath
    if (upBtn) upBtn.disabled = !state.fsParent

    const entries = Array.isArray(data.entries)
      ? (data.entries as FsEntry[]).slice()
      : []
    entries.sort((a, b) => {
      const ta = a.type === 'directory' ? 0 : 1
      const tb = b.type === 'directory' ? 0 : 1
      if (ta !== tb) return ta - tb
      return String(a.name).localeCompare(String(b.name))
    })

    renderFs(entries)
  } catch (err: unknown) {
    if (fsListEl) fsListEl.innerHTML = ''
    showError(`Filesystem list failed: ${getErrorMessage(err)}`)
  }
}

const renderFs = (entries: FsEntry[]) => {
  if (!fsListEl) return
  fsListEl.innerHTML = ''

  if (!entries.length) {
    const li = document.createElement('li')
    li.className = 'fs__item'
    li.innerHTML = `<div class="fs__left"><div class="fs__name">Empty folder</div><div class="fs__meta">No entries</div></div>`
    fsListEl.appendChild(li)
    return
  }

  for (const ent of entries) {
    const li = document.createElement('li')
    li.className = 'fs__item'

    const tag =
      ent.type === 'directory'
        ? `<span class="fs__tag">dir</span>`
        : `<span class="fs__tag">${escapeHtml(detectTypeFromName(ent.name))}</span>`

    const meta =
      ent.type === 'directory'
        ? 'directory'
        : `${fmtBytes(ent.size)} • ${fmtIso(ent.mtime)}`

    const actions =
      ent.type === 'directory'
        ? `<button class="btn btn--ghost btn--sm" data-open="1">Open</button>
         <button class="btn btn--ghost btn--sm" data-select="1">Select</button>`
        : `<button class="btn btn--ghost btn--sm" data-select="1">Select</button>`

    li.innerHTML = `
      <div class="fs__left">
        <div class="fs__name">${escapeHtml(ent.name)}</div>
        <div class="fs__meta">${escapeHtml(meta)}</div>
      </div>
      <div style="display:flex; gap:8px; align-items:center;">
        ${tag}
        <div style="display:flex; gap:8px; align-items:center;">${actions}</div>
      </div>
    `

    li.querySelector('[data-open]')?.addEventListener('click', () =>
      loadDir(ent.path)
    )
    li.querySelector('[data-select]')?.addEventListener('click', () =>
      selectLocalEntry(ent)
    )

    li.addEventListener('dblclick', () => {
      if (ent.type === 'directory') loadDir(ent.path)
      else selectLocalEntry(ent)
    })

    fsListEl.appendChild(li)
  }
}

const selectLocalEntry = (ent: FsEntry) => {
  const isDir = ent.type === 'directory'
  const guessed = isDir ? 'folder' : detectTypeFromName(ent.name)

  state.local.selected = {
    name: ent.name,
    path: ent.path,
    size: ent.size,
    isDir
  }
  state.local.type = isSupportedType(guessed) ? guessed : 'unknown'

  if (selectedFileEl) selectedFileEl.value = ent.name
  if (localTypeEl) {
    localTypeEl.disabled = false
    localTypeEl.value = state.local.type
  }

  setHeavyWarn(localHeavyWarn, localTypeEl?.value || 'unknown')
  toggleMetaBox(
    localMetaBox,
    localMetaStatus,
    requiresMeta(localTypeEl?.value || 'unknown')
  )
  updateLocalRegisterState()
}

export const updateLocalRegisterState = () => {
  const sel = state.local.selected
  const t = localTypeEl?.value || 'unknown'
  state.local.type = t

  setHeavyWarn(localHeavyWarn, t)

  if (!sel) {
    if (registerBtn) registerBtn.disabled = true
    setStatus(registerStatus, 'status', 'Select a file or folder to register.')
    if (localTypeEl) localTypeEl.disabled = true
    toggleMetaBox(localMetaBox, localMetaStatus, false)
    return
  }

  if (!isSupportedType(t)) {
    if (registerBtn) registerBtn.disabled = true
    setStatus(
      registerStatus,
      'status is-warn',
      'Unsupported type. Choose a supported detected type.'
    )
    toggleMetaBox(localMetaBox, localMetaStatus, false)
    return
  }

  const needMeta = requiresMeta(t)
  toggleMetaBox(localMetaBox, localMetaStatus, needMeta)

  if (needMeta) {
    if (!sel.isDir) {
      if (registerBtn) registerBtn.disabled = true
      setStatus(
        registerStatus,
        'status is-warn',
        'Type "folder" requires selecting a directory.'
      )
      localMetaStatus?.classList.add('is-hidden')
      return
    }
    const v = validateFolderMeta('local')
    localMetaStatus?.classList.toggle('is-hidden', v.ok)
    if (registerBtn) registerBtn.disabled = !v.ok
    setStatus(
      registerStatus,
      v.ok ? 'status' : 'status is-warn',
      v.ok
        ? 'Ready to register folder.'
        : 'Fill required metadata for folder import.'
    )
    return
  }

  if (registerBtn) registerBtn.disabled = false
  setStatus(registerStatus, 'status', 'Ready to register.')
}

export const initLocal = (opts: {
  refreshJobs: () => Promise<void>
  isSseConnected: () => boolean
}) => {
  localTypeEl?.addEventListener('change', updateLocalRegisterState)
  wireMetaInputs('local', updateLocalRegisterState)

  registerBtn?.addEventListener('click', async () => {
    const sel = state.local.selected
    const t = state.local.type
    if (!sel || !isSupportedType(t)) return

    if (registerBtn) registerBtn.disabled = true
    setStatus(registerStatus, 'status', 'Creating import job...')

    try {
      const item: {
        filename: string
        sourcePath: string
        sizeBytes?: number
        detectedType: string
        metadata?: unknown
      } = {
        filename: sel.name,
        sourcePath: sel.path,
        sizeBytes: sel.size,
        detectedType: t
      }

      const meta = getRequiredMeta(
        t,
        'local',
        registerStatus,
        'Missing required folder metadata.'
      )
      if (meta === null) return
      if (meta) item.metadata = meta

      await api.createJob({ items: [item] })

      state.local.selected = null
      state.local.type = 'unknown'
      if (selectedFileEl) selectedFileEl.value = 'None'
      if (localTypeEl) {
        localTypeEl.value = 'unknown'
        localTypeEl.disabled = true
      }
      toggleMetaBox(localMetaBox, localMetaStatus, false)
      localHeavyWarn?.classList.add('is-hidden')

      if (registerStatus) registerStatus.textContent = 'Registered. Job queued.'
      await opts.refreshJobs()
    } catch (err: unknown) {
      setStatus(
        registerStatus,
        'status is-bad',
        `Register failed: ${getErrorMessage(err)}`
      )
    } finally {
      if (registerBtn) registerBtn.disabled = true
    }
  })

  upBtn?.addEventListener(
    'click',
    () => state.fsParent && loadDir(state.fsParent)
  )
  goBtn?.addEventListener('click', () =>
    loadDir(pathInput?.value.trim() || '/')
  )
  pathInput?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return
    const nextPath = pathInput?.value.trim() || '/'
    loadDir(nextPath)
  })
}
