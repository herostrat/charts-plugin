import {
  downloadBtn,
  downloadHeavyWarn,
  downloadStatus,
  downloadTypeEl,
  downloadDeliveryEl,
  downloadUrlEl,
  downloadCatalogEl,
  downloadCatalogBody,
  downloadChartEl,
  downloadChartRow,
  downloadCatalogDetails,
  downloadCatalogInfo,
  downloadCatalogStatus,
  downloadCatalogRefresh,
  downloadBboxEl,
  downloadBboxPick,
  downloadUrlHome,
  downloadUrlRow,
  downloadMetaBox,
  dlMetaStatus
} from '../core/dom.js'
import { api } from '../core/api.js'
import { setHeavyWarn, setStatus } from '../core/ui.js'
import {
  detectTypeFromName,
  fmtBytes,
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
import { state } from '../core/state.js'
import { openBboxPicker } from './bbox.js'

type CuratedChart = {
  id: string
  name: string
  url: string
  type?: string
  note?: string
  sizeBytes?: number
  details?: string
  lastUpdated?: string
  deliveries?: CuratedDelivery[]
}

type CuratedDelivery = {
  id: string
  label?: string
  kind: 'direct' | 'bbox'
  method?: 'pmtiles' | 'url'
  type?: string
  url?: string
  sourceUrl?: string
  urlTemplate?: string
  bboxParam?: string
  maxZoom?: number
  preferred?: boolean
  note?: string
}

type CuratedProvider = {
  id: string
  name: string
  homepage?: string
  note?: string
  checkedAt?: string
  charts: CuratedChart[]
}

type CuratedCatalog = {
  generatedAt?: string
  source?: string
  providers?: CuratedProvider[]
}

type CatalogEntry = {
  provider: CuratedProvider
  chart: CuratedChart
}

let curatedProviders: CuratedProvider[] = []
let activeEntry: CatalogEntry | null = null
let activeProvider: CuratedProvider | null = null
let activeChart: CuratedChart | null = null
let activeDelivery: CuratedDelivery | null = null
let detailsOpen = false

const manualProvider: CuratedProvider = {
  id: 'manual',
  name: 'By Link',
  charts: []
}

const manualEntry: CatalogEntry = {
  provider: manualProvider,
  chart: {
    id: 'by-link',
    name: 'By Link',
    url: ''
  }
}

const downloadDeliveryRow = document.getElementById(
  'downloadDeliveryRow'
) as HTMLElement | null
const downloadBboxRow = document.getElementById(
  'downloadBboxRow'
) as HTMLElement | null

const setCatalogStatus = (msg: string, warn = false) => {
  if (!downloadCatalogStatus) return
  downloadCatalogStatus.textContent = msg
  downloadCatalogStatus.classList.toggle('is-hidden', !msg)
  downloadCatalogStatus.classList.toggle('is-warn', warn)
}

const isManualEntry = (entry: CatalogEntry | null) =>
  entry?.provider.id === 'manual'

const moveUrlRow = (destination: HTMLElement | null) => {
  if (!downloadUrlRow || !destination) return
  if (downloadUrlRow.parentElement === destination) return
  destination.appendChild(downloadUrlRow)
  if (downloadCatalogInfo) destination.appendChild(downloadCatalogInfo)
}

const setDetailsOpen = (open: boolean) => {
  detailsOpen = open
  downloadCatalogInfo?.classList.toggle('is-hidden', !open)
  downloadCatalogDetails?.setAttribute('aria-pressed', open ? 'true' : 'false')
}

const setActiveChart = (
  provider: CuratedProvider | null,
  chart: CuratedChart | null
) => {
  activeProvider = provider
  activeChart = chart
  if (!provider || !chart) {
    activeEntry = null
    activeDelivery = null
    renderDeliveryOptions(null)
    renderCatalogInfo(null)
    return
  }
  activeEntry = { provider, chart }
  renderDeliveryOptions(activeEntry)
  renderCatalogInfo(activeEntry)
}

const getCatalogProviders = () => [manualProvider, ...curatedProviders]

const getDeliveries = (chart: CuratedChart): CuratedDelivery[] => {
  if (Array.isArray(chart.deliveries) && chart.deliveries.length > 0) {
    return chart.deliveries
  }
  if (chart.url) {
    return [
      {
        id: 'direct',
        label: 'Direct download',
        kind: 'direct',
        type: chart.type,
        url: chart.url,
        preferred: true
      }
    ]
  }
  return []
}

const pickDefaultDelivery = (deliveries: CuratedDelivery[]) => {
  if (!deliveries.length) return null
  return (
    deliveries.find((d) => d.preferred) ||
    deliveries.find((d) => d.type === 'pmtiles') ||
    deliveries[0]
  )
}

const parseBboxText = (value: string) => {
  const parts = String(value || '')
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
  if (parts.length !== 4) return null
  const nums = parts.map((v) => Number(v))
  if (nums.some((v) => !Number.isFinite(v))) return null
  return nums as [number, number, number, number]
}

const formatBbox = (bbox: [number, number, number, number]) =>
  `${bbox[0].toFixed(4)},${bbox[1].toFixed(4)},${bbox[2].toFixed(4)},${bbox[3].toFixed(4)}`

const setBboxField = (bbox: [number, number, number, number]) => {
  if (!downloadBboxEl) return
  downloadBboxEl.value = formatBbox(bbox)
}

const buildBboxUrl = (
  delivery: CuratedDelivery,
  bbox: [number, number, number, number]
) => {
  if (!delivery.urlTemplate) return null
  const token = '{bbox}'
  if (!delivery.urlTemplate.includes(token)) return null
  return delivery.urlTemplate.replace(token, formatBbox(bbox))
}

const applyDelivery = (entry: CatalogEntry | null, delivery: CuratedDelivery | null) => {
  activeEntry = entry
  activeDelivery = delivery

  if (isManualEntry(entry)) {
    downloadChartRow?.classList.add('is-hidden')
    downloadDeliveryRow?.classList.add('is-hidden')
    downloadBboxRow?.classList.add('is-hidden')
    moveUrlRow(downloadCatalogBody)
    if (downloadTypeEl) {
      downloadTypeEl.disabled = false
      state.download.typeOverridden = false
    }
    if (downloadUrlEl) {
      downloadUrlEl.disabled = false
      downloadUrlEl.placeholder = 'https://example.com/chart.tif'
      downloadUrlEl.value = ''
    }
    return
  }

  moveUrlRow(downloadUrlHome)

  const showBbox = delivery?.kind === 'bbox'
  downloadBboxRow?.classList.toggle('is-hidden', !showBbox)

  if (downloadTypeEl) {
    if (delivery?.type) {
      downloadTypeEl.value = delivery.type
      downloadTypeEl.disabled = true
      state.download.typeOverridden = true
    } else {
      downloadTypeEl.disabled = false
      state.download.typeOverridden = false
    }
  }

  if (downloadUrlEl) {
    if (delivery?.kind === 'direct') {
      if (delivery.url) downloadUrlEl.value = delivery.url
      downloadUrlEl.disabled = false
    } else if (delivery?.kind === 'bbox') {
      const sourceUrl = delivery.sourceUrl || delivery.url || ''
      if (sourceUrl) downloadUrlEl.value = sourceUrl
      downloadUrlEl.disabled = true
    } else {
      downloadUrlEl.disabled = false
    }
  }
}

const renderDeliveryOptions = (entry: CatalogEntry | null) => {
  if (!downloadDeliveryEl) return
  if (!entry) {
    downloadDeliveryEl.innerHTML = ''
    downloadDeliveryRow?.classList.add('is-hidden')
    applyDelivery(null, null)
    return
  }

  if (isManualEntry(entry)) {
    downloadDeliveryEl.innerHTML = ''
    downloadDeliveryRow?.classList.add('is-hidden')
    applyDelivery(entry, null)
    return
  }

  const deliveries = getDeliveries(entry.chart)
  const active = pickDefaultDelivery(deliveries)
  downloadDeliveryEl.innerHTML = ''
  if (deliveries.length === 0) {
    downloadDeliveryRow?.classList.add('is-hidden')
    applyDelivery(entry, null)
    return
  }
  for (const delivery of deliveries) {
    const opt = document.createElement('option')
    opt.value = delivery.id
    opt.textContent = delivery.label || delivery.id
    if (active && delivery.id === active.id) {
      opt.selected = true
    }
    downloadDeliveryEl.appendChild(opt)
  }
  downloadDeliveryRow?.classList.toggle('is-hidden', deliveries.length <= 1)
  applyDelivery(entry, active)
}

const renderCatalogInfo = (entry?: CatalogEntry) => {
  if (!downloadCatalogInfo) return
  downloadCatalogInfo.innerHTML = ''

  const wrap = document.createElement('div')
  wrap.className = 'catalogDetails'

  const addRow = (label: string, value: string | null | undefined) => {
    if (!value) return
    const row = document.createElement('div')
    row.className = 'catalogDetails__row'
    const key = document.createElement('span')
    key.textContent = label
    const val = document.createElement('div')
    val.textContent = value
    row.appendChild(key)
    row.appendChild(val)
    wrap.appendChild(row)
  }

  if (!entry) {
    addRow('Info', 'Pick a curated source to prefill the download URL and type.')
    downloadCatalogInfo.appendChild(wrap)
    return
  }

  if (isManualEntry(entry)) {
    addRow('Info', 'By Link: paste any direct download URL and choose the type.')
    downloadCatalogInfo.appendChild(wrap)
    return
  }

  const provider = entry.provider
  const chart = entry.chart
  const deliveries = getDeliveries(chart)
  const delivery =
    entry === activeEntry
      ? activeDelivery
      : pickDefaultDelivery(deliveries)

  addRow('Provider', provider.name)
  addRow('Chart', chart.name)
  addRow('Type', chart.type)
  addRow('Size', chart.sizeBytes ? fmtBytes(chart.sizeBytes) : null)
  addRow('Delivery', delivery?.kind)
  addRow('Format', delivery?.type)
  addRow('Updated', chart.lastUpdated)
  addRow('Note', chart.note)
  addRow('Delivery note', delivery?.note)
  addRow('Details', chart.details)

  downloadCatalogInfo.appendChild(wrap)
}

const renderChartOptions = (provider: CuratedProvider | null) => {
  if (!downloadChartEl) return null
  downloadChartEl.innerHTML = ''

  if (!provider || provider.id === 'manual') {
    downloadChartRow?.classList.add('is-hidden')
    return null
  }

  const charts = Array.isArray(provider.charts) ? provider.charts : []
  for (const chart of charts) {
    const opt = document.createElement('option')
    opt.value = chart.id
    opt.textContent = chart.name
    downloadChartEl.appendChild(opt)
  }

  downloadChartRow?.classList.toggle('is-hidden', charts.length === 0)

  const selected =
    charts.find((chart) => chart.id === activeChart?.id) ||
    charts[0] ||
    null
  if (selected) downloadChartEl.value = selected.id
  return selected
}

const renderCatalogOptions = () => {
  if (!downloadCatalogEl) return
  downloadCatalogEl.innerHTML = ''

  for (const provider of getCatalogProviders()) {
    const opt = document.createElement('option')
    opt.value = provider.id
    opt.textContent = provider.name
    downloadCatalogEl.appendChild(opt)
  }

  downloadCatalogEl.value = manualProvider.id
  renderChartOptions(manualProvider)
  setActiveChart(manualProvider, manualEntry.chart)
}

const loadCatalog = async () => {
  setCatalogStatus('Loading curated sources...', false)
  try {
    const payload = (await api.listSources({ refresh: false })) as CuratedCatalog
    curatedProviders = Array.isArray(payload?.providers)
      ? (payload.providers as CuratedProvider[])
      : []
    renderCatalogOptions()
    if (curatedProviders.length === 0) {
      setCatalogStatus('No curated sources available yet.', true)
    } else {
      setCatalogStatus('', false)
    }
  } catch (err: unknown) {
    curatedProviders = []
    renderCatalogOptions()
    setCatalogStatus(
      `Failed to load curated sources: ${getErrorMessage(err)}`,
      true
    )
  }
}

const guessTypeFromUrl = (url: string) => {
  if (!url) return 'unknown'
  const noHash = url.split('#')[0]
  const noQ = noHash.split('?')[0]
  const base = noQ.split('/').pop() || ''
  return detectTypeFromName(base)
}

export const updateDownloadState = () => {
  const url = downloadUrlEl?.value.trim() || ''
  if (!url) {
    if (downloadBtn) downloadBtn.disabled = true
    setStatus(downloadStatus, 'status', 'Enter a URL.')
    setHeavyWarn(downloadHeavyWarn, 'unknown')
    toggleMetaBox(downloadMetaBox, dlMetaStatus, false)
    return
  }

  if (activeDelivery?.kind === 'bbox') {
    const bboxText = downloadBboxEl?.value || ''
    const bbox = parseBboxText(bboxText)
    if (!bbox) {
      if (downloadBtn) downloadBtn.disabled = true
      setStatus(
        downloadStatus,
        'status is-warn',
        'Enter a valid bounding box: minLon,minLat,maxLon,maxLat.'
      )
      setHeavyWarn(downloadHeavyWarn, 'unknown')
      toggleMetaBox(downloadMetaBox, dlMetaStatus, false)
      return
    }
  }

  if (!state.download.typeOverridden) {
    const g = guessTypeFromUrl(url)
    if (downloadTypeEl)
      downloadTypeEl.value = isSupportedType(g) ? g : 'unknown'
  }

  const t = downloadTypeEl?.value || 'unknown'
  setHeavyWarn(downloadHeavyWarn, t)

  if (!isSupportedType(t)) {
    if (downloadBtn) downloadBtn.disabled = true
    setStatus(
      downloadStatus,
      'status is-warn',
      'Unsupported type. Choose a supported detected type.'
    )
    toggleMetaBox(downloadMetaBox, dlMetaStatus, false)
    return
  }

  const needMeta = requiresMeta(t)
  toggleMetaBox(downloadMetaBox, dlMetaStatus, needMeta)

  if (needMeta) {
    const v = validateFolderMeta('dl')
    dlMetaStatus?.classList.toggle('is-hidden', v.ok)
    if (downloadBtn) downloadBtn.disabled = !v.ok
    setStatus(
      downloadStatus,
      v.ok ? 'status' : 'status is-warn',
      v.ok
        ? 'Ready to create download job.'
        : 'Fill required metadata for folder import.'
    )
    return
  }

  if (downloadBtn) downloadBtn.disabled = false
  setStatus(downloadStatus, 'status', 'Ready to create download job.')
}

export const initDownload = (opts: {
  refreshJobs: () => Promise<void>
  isSseConnected: () => boolean
}) => {
  downloadUrlEl?.addEventListener('input', updateDownloadState)
  downloadTypeEl?.addEventListener('change', () => {
    state.download.typeOverridden = true
    updateDownloadState()
  })
  downloadCatalogEl?.addEventListener('change', () => {
    if (!downloadCatalogEl) return
    const providerId = downloadCatalogEl.value
    const provider = getCatalogProviders().find((p) => p.id === providerId)
    if (!provider) {
      renderChartOptions(null)
      setActiveChart(null, null)
      updateDownloadState()
      return
    }

    if (provider.id === 'manual') {
      renderChartOptions(provider)
      setActiveChart(manualProvider, manualEntry.chart)
      updateDownloadState()
      return
    }

    const chart = renderChartOptions(provider)
    setActiveChart(provider, chart)
    updateDownloadState()
  })
  downloadCatalogDetails?.addEventListener('click', (ev) => {
    ev.preventDefault()
    setDetailsOpen(!detailsOpen)
  })
  downloadChartEl?.addEventListener('change', () => {
    if (!downloadChartEl || !activeProvider || activeProvider.id === 'manual') {
      return
    }
    const chart =
      activeProvider.charts.find((c) => c.id === downloadChartEl.value) ||
      null
    setActiveChart(activeProvider, chart)
    updateDownloadState()
  })
  downloadDeliveryEl?.addEventListener('change', () => {
    if (!activeEntry || !downloadDeliveryEl) return
    const deliveries = getDeliveries(activeEntry.chart)
    const delivery =
      deliveries.find((d) => d.id === downloadDeliveryEl.value) ||
      pickDefaultDelivery(deliveries)
    applyDelivery(activeEntry, delivery)
    renderCatalogInfo(activeEntry)
    updateDownloadState()
  })
  downloadBboxEl?.addEventListener('input', updateDownloadState)
  downloadBboxPick?.addEventListener('click', (ev) => {
    ev.preventDefault()
    const initial = parseBboxText(downloadBboxEl?.value || '')
    openBboxPicker({
      initial,
      onConfirm: (bbox) => {
        setBboxField(bbox)
        updateDownloadState()
      }
    })
  })
  downloadCatalogRefresh?.addEventListener('click', (ev) => {
    ev.preventDefault()
    const btn = downloadCatalogRefresh
    if (btn) btn.disabled = true
    setCatalogStatus('Refreshing curated sources...', false)
    api
      .listSources({ refresh: true })
      .then((payload) => {
        curatedProviders = Array.isArray(payload?.providers)
          ? (payload.providers as CuratedProvider[])
          : []
        renderCatalogOptions()
        setCatalogStatus(
          curatedProviders.length === 0
            ? 'No curated sources available yet.'
            : '',
          curatedProviders.length === 0
        )
      })
      .catch((err: unknown) => {
        curatedProviders = []
        renderCatalogOptions()
        setCatalogStatus(
          `Failed to load curated sources: ${getErrorMessage(err)}`,
          true
        )
      })
      .finally(() => {
        if (btn) btn.disabled = false
      })
  })
  wireMetaInputs('dl', updateDownloadState)

  loadCatalog()

  setDetailsOpen(false)

  downloadBtn?.addEventListener('click', async () => {
    const url = downloadUrlEl?.value.trim() || ''
    const t = downloadTypeEl?.value || 'unknown'
    if (!url || !isSupportedType(t)) return

    if (downloadBtn) downloadBtn.disabled = true
    setStatus(downloadStatus, 'status', 'Creating download job...')

    try {
      const filename =
        url.split('#')[0].split('?')[0].split('/').pop() || 'download'
      let sourceUrl = url
      let detectedType = t
      let extract: { kind: 'pmtiles'; bbox: [number, number, number, number]; maxZoom?: number } | undefined

      if (activeDelivery?.kind === 'bbox') {
        const bbox = parseBboxText(downloadBboxEl?.value || '')
        if (!bbox) {
          setStatus(
            downloadStatus,
            'status is-warn',
            'Enter a valid bounding box before downloading.'
          )
          return
        }

        if (activeDelivery.method === 'pmtiles') {
          sourceUrl = activeDelivery.sourceUrl || url
          detectedType = activeDelivery.type || t
          extract = {
            kind: 'pmtiles',
            bbox,
            maxZoom: activeDelivery.maxZoom
          }
        } else if (activeDelivery.method === 'url') {
          const built = buildBboxUrl(activeDelivery, bbox)
          if (!built) {
            setStatus(
              downloadStatus,
              'status is-warn',
              'This source does not provide a bbox URL template.'
            )
            return
          }
          sourceUrl = built
          detectedType = activeDelivery.type || t
        }
      }

      const item: {
        filename: string
        sourceUrl: string
        detectedType: string
        extract?: { kind: 'pmtiles'; bbox: [number, number, number, number]; maxZoom?: number }
        metadata?: unknown
      } = { filename, sourceUrl, detectedType, extract }

      const meta = getRequiredMeta(
        detectedType,
        'dl',
        downloadStatus,
        'Missing required folder metadata.'
      )
      if (meta === null) return
      if (meta) item.metadata = meta

      await api.createJob({ items: [item] })
      setStatus(downloadStatus, 'status', 'Download job created.')
      await opts.refreshJobs()
    } catch (err: unknown) {
      setStatus(
        downloadStatus,
        'status is-bad',
        `Download failed: ${getErrorMessage(err)}`
      )
    } finally {
      if (downloadBtn) downloadBtn.disabled = false
    }
  })
}
