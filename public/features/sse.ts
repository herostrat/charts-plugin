import { liveStateEl, refreshBtn } from '../core/dom.js'
import type { ImportItem, ImportJob } from '../core/state.js'
import { state } from '../core/state.js'
import { API_BASE } from '../core/constants.js'
import { showError } from '../core/ui.js'

type SsePayload = Record<string, unknown>

let renderImportsFn: (jobs: ImportJob[]) => void

const setLiveUi = (mode: string, text?: string) => {
  state.sse.status = mode
  if (!liveStateEl) return

  liveStateEl.classList.remove('live--on', 'live--re', 'live--off')
  if (mode === 'connected') liveStateEl.classList.add('live--on')
  else if (mode === 'off') liveStateEl.classList.add('live--off')
  else liveStateEl.classList.add('live--re')

  liveStateEl.textContent = text || mode
}

const syncRefreshUi = () => {
  if (!refreshBtn) return
  const showRefresh = state.sse.status === 'no-sse'
  refreshBtn.disabled = !showRefresh
  refreshBtn.classList.toggle('is-hidden', !showRefresh)
}

const safeJson = (str: string): unknown => {
  try {
    return JSON.parse(str)
  } catch {
    return null
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const upsertJob = (job: ImportJob) => {
  if (!job || job.id == null) return
  const id = String(job.id)
  const idx = state.jobs.findIndex((j) => String(j.id) === id)
  if (idx >= 0) {
    const prev = state.jobs[idx]
    const merged = {
      ...prev,
      ...job,
      items: Array.isArray(job.items)
        ? (job.items as ImportItem[])
        : prev?.items
    }
    state.jobs[idx] = merged
  } else state.jobs.push(job)
}

const upsertItem = (jobId: unknown, item: ImportItem) => {
  if (jobId == null || !item) return
  const id = String(jobId)
  let job = state.jobs.find((j) => String(j.id) === id)
  if (!job) {
    job = { id: jobId, state: 'QUEUED', items: [] }
    state.jobs.push(job)
  }
  if (!Array.isArray(job.items)) job.items = []
  const items = job.items as ImportItem[]
  const itemId = String(item.id ?? item.filename ?? Math.random())
  const i = items.findIndex((x) => String(x.id ?? x.filename) === itemId)
  if (i >= 0) items[i] = { ...items[i], ...item }
  else items.push(item)
}

const removeJob = (jobId: unknown) => {
  const id = String(jobId)
  state.jobs = state.jobs.filter((j) => String(j.id) !== id)
}

const handleSsePayload = (payload: unknown) => {
  if (payload == null) return

  if (state.sse.status !== 'connected') {
    setLiveUi('connected', 'active')
    syncRefreshUi()
  }

  if (Array.isArray(payload)) {
    state.jobs = payload as ImportJob[]
    renderImportsFn?.(state.jobs)
    return
  }

  if (!isRecord(payload)) return
  const data = payload as SsePayload

  if (Array.isArray(data.jobs)) {
    state.jobs = data.jobs as ImportJob[]
    renderImportsFn?.(state.jobs)
    return
  }

  if (data.job) {
    upsertJob(data.job as ImportJob)
    renderImportsFn?.(state.jobs)
    return
  }

  if (data.item && data.jobId != null) {
    upsertItem(data.jobId, data.item as ImportItem)
    renderImportsFn?.(state.jobs)
    return
  }

  if (data.type === 'snapshot' && Array.isArray(data.data)) {
    state.jobs = data.data as ImportJob[]
    renderImportsFn?.(state.jobs)
    return
  }
  if (data.type === 'job' && data.data) {
    upsertJob(data.data as ImportJob)
    renderImportsFn?.(state.jobs)
    return
  }
  if (data.type === 'item' && data.data && data.jobId != null) {
    upsertItem(data.jobId, data.data as ImportItem)
    renderImportsFn?.(state.jobs)
    return
  }
  if (data.type === 'delete' && data.jobId != null) {
    removeJob(data.jobId)
    renderImportsFn?.(state.jobs)
  }
}

export const disconnectSse = () => {
  try {
    state.sse.es?.close?.()
  } catch (err) {
    void err
  }
  state.sse.es = null
  setLiveUi('off', 'off')
  syncRefreshUi()
}

export const connectSse = () => {
  disconnectSse()

  if (!('EventSource' in window)) {
    setLiveUi('no-sse', 'no SSE')
    showError('This browser does not support Server-Sent Events (EventSource).')
    syncRefreshUi()
    return
  }

  const url = new URL(`${API_BASE}/events`, window.location.origin).toString()
  setLiveUi('connecting', 'connecting')
  syncRefreshUi()

  const es = new EventSource(url)
  state.sse.es = es
  state.sse.lastEventAt = Date.now()

  const readyFallback = window.setTimeout(() => {
    if (state.sse.es === es && es.readyState === 1) {
      setLiveUi('connected', 'active')
      syncRefreshUi()
    }
  }, 1500)

  es.onopen = () => {
    state.sse.lastEventAt = Date.now()
    setLiveUi('connected', 'active')
    window.clearTimeout(readyFallback)
  }

  es.onerror = () => {
    window.clearTimeout(readyFallback)
    setLiveUi('reconnecting', 'reconnecting')
  }

  const onAny = (ev: MessageEvent) => {
    state.sse.lastEventAt = Date.now()
    const payload = safeJson(ev.data)
    window.clearTimeout(readyFallback)
    handleSsePayload(payload)
  }

  es.onmessage = onAny
  es.addEventListener('snapshot', onAny)
  es.addEventListener('job', onAny)
  es.addEventListener('item', onAny)
  es.addEventListener('delete', onAny)
  es.addEventListener('hello', onAny)
  es.addEventListener('ping', () => {
    state.sse.lastEventAt = Date.now()
  })

  // No watchdog: idle periods can be normal for this app.
}

export const isSseConnected = () => {
  return state.sse.status === 'connected' && !!state.sse.es
}

export const initSse = (opts: {
  renderImports: (jobs: ImportJob[]) => void
}) => {
  renderImportsFn = opts.renderImports

  syncRefreshUi()
}
