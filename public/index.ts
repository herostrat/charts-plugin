import {
  sourcePanels,
  sourceTabBtns,
  refreshBtn,
  detailsOverlay,
  configOverlay,
  refreshDom,
  sourcesCloseBtn,
  sourcesOpenBtn,
  sourcesPopup
} from './core/dom.js'
import { state } from './core/state.js'
import {
  detectTypeFromName,
  boundsToText,
  isSupportedType
} from './core/utils.js'
import { initDownload, updateDownloadState } from './features/download.js'
import { initUpload, updateUploadState } from './features/upload.js'
import { initStream, updateStreamState } from './features/stream.js'
import { initImports, refreshJobs, renderImports } from './features/imports.js'
import { initDetails, closeDetails, openDetails } from './features/details.js'
import { initConfig } from './features/config.js'
import { initBboxPicker, closeBboxPicker } from './features/bbox.js'
import {
  initMap,
  renderMap,
  focusBounds,
  resetView,
  setMapHidden
} from './features/map.js'
import { initSse, connectSse, isSseConnected } from './features/sse.js'
;(() => {
  'use strict'

  refreshDom()

  const setViewportOffsets = () => {
    const topbar = document.querySelector('.topbar') as HTMLElement | null
    const topbarHeight = topbar?.offsetHeight ?? 0
    document.documentElement.style.setProperty(
      '--topbar-height',
      `${topbarHeight}px`
    )
  }
  setViewportOffsets()
  window.addEventListener('resize', setViewportOffsets)

  const setActiveSourceTab = (name: string) => {
    sourceTabBtns.forEach((b) =>
      b.classList.toggle('is-active', b.dataset.tab === name)
    )
    sourcePanels.forEach((p) =>
      p.classList.toggle('is-active', p.dataset.panel === name)
    )
  }
  sourceTabBtns.forEach((b) =>
    b.addEventListener('click', () =>
      setActiveSourceTab(b.dataset.tab || 'download')
    )
  )

  initDetails()
  const { closeConfig } = initConfig()
  initBboxPicker()

  initMap({ renderImports: () => renderImports(state.jobs) })
  initImports({ renderMap, focusBounds, openDetails, isSseConnected })
  initSse({ renderImports })

  initDownload({ refreshJobs, isSseConnected })
  initUpload({ refreshJobs, isSseConnected })
  initStream({ refreshJobs, isSseConnected })

  const isSourcesOpen = () =>
    !sourcesPopup?.classList.contains('is-hidden')

  const setSourcesOpen = (open: boolean) => {
    sourcesPopup?.classList.toggle('is-hidden', !open)
    sourcesOpenBtn?.setAttribute('aria-expanded', open ? 'true' : 'false')
  }

  sourcesOpenBtn?.addEventListener('click', () =>
    setSourcesOpen(!isSourcesOpen())
  )
  sourcesCloseBtn?.addEventListener('click', () => setSourcesOpen(false))

  refreshBtn?.addEventListener('click', refreshJobs)

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    if (detailsOverlay && !detailsOverlay.classList.contains('is-hidden')) {
      closeDetails()
      return
    }
    if (configOverlay && !configOverlay.classList.contains('is-hidden')) {
      closeConfig()
      return
    }
    if (sourcesPopup && !sourcesPopup.classList.contains('is-hidden')) {
      setSourcesOpen(false)
      return
    }
    const bboxOverlay = document.querySelector('#bboxOverlay')
    if (bboxOverlay && !bboxOverlay.classList.contains('is-hidden')) {
      closeBboxPicker()
    }
  })

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      refreshJobs()
      if (!isSseConnected()) connectSse()
    }
  })

  const runSelfTests = () => {
    const assert = (cond: boolean, msg: string) => {
      if (!cond) console.warn('[selftest]', msg)
    }
    assert(detectTypeFromName('a.tif') === 'geotiff', 'detectTypeFromName tif')
    assert(
      detectTypeFromName('a.mbtiles') === 'mbtiles',
      'detectTypeFromName mbtiles'
    )
    assert(isSupportedType('pmtiles') === true, 'isSupportedType pmtiles')
    assert(boundsToText([0, 0, 1, 1]).includes('0.0000'), 'boundsToText format')
  }

  runSelfTests()

  setMapHidden(false)
  resetView()

  setActiveSourceTab('download')
  updateDownloadState()
  updateUploadState()
  updateStreamState()

  refreshJobs()
  connectSse()
})()
