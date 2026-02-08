const getDocument = () => (typeof document === 'undefined' ? null : document)

const getNodeList = <T extends Element = HTMLElement>(sel: string) =>
  getDocument()?.querySelectorAll<T>(sel) || ([] as unknown as NodeListOf<T>)

export const $ = <T extends Element = HTMLElement>(sel: string) =>
  getDocument()?.querySelector<T>(sel) ?? null

// Tabs (right)
export let sourceTabBtns = getNodeList<HTMLElement>('[data-tab]')
export let sourcePanels = getNodeList<HTMLElement>('[data-panel]')

// Filters (left)
export let filterBtns = getNodeList<HTMLElement>('[data-filter]')

// Local FS
export let fsListEl = $('#fsList') as HTMLUListElement | null
export let currentPathEl = $('#currentPath') as HTMLElement | null
export let upBtn = $('#upBtn') as HTMLButtonElement | null
export let pathInput = $('#pathInput') as HTMLInputElement | null
export let goBtn = $('#goBtn') as HTMLButtonElement | null

// Local form
export let selectedFileEl = $('#selectedFile') as HTMLInputElement | null
export let localTypeEl = $('#localType') as HTMLSelectElement | null
export let localMetaBox = $('#localMetaBox') as HTMLElement | null
export let localMetaStatus = $('#localMetaStatus') as HTMLElement | null
export let localHeavyWarn = $('#localHeavyWarn') as HTMLElement | null
export let registerBtn = $('#registerBtn') as HTMLButtonElement | null
export let registerStatus = $('#registerStatus') as HTMLElement | null

// Download form
export let downloadUrlEl = $('#downloadUrl') as HTMLInputElement | null
export let downloadTypeEl = $('#downloadType') as HTMLSelectElement | null
export let downloadMetaBox = $('#downloadMetaBox') as HTMLElement | null
export let dlMetaStatus = $('#dlMetaStatus') as HTMLElement | null
export let downloadHeavyWarn = $('#downloadHeavyWarn') as HTMLElement | null
export let downloadBtn = $('#downloadBtn') as HTMLButtonElement | null
export let downloadStatus = $('#downloadStatus') as HTMLElement | null

// Upload form
export let uploadFileEl = $('#uploadFile') as HTMLInputElement | null
export let uploadTypeEl = $('#uploadType') as HTMLSelectElement | null
export let uploadMetaBox = $('#uploadMetaBox') as HTMLElement | null
export let uploadMetaStatus = $('#upMetaStatus') as HTMLElement | null
export let uploadHeavyWarn = $('#uploadHeavyWarn') as HTMLElement | null
export let uploadBtn = $('#uploadBtn') as HTMLButtonElement | null
export let uploadStatus = $('#uploadStatus') as HTMLElement | null

// Stream form
export let streamUrlEl = $('#streamUrl') as HTMLInputElement | null
export let streamTypeEl = $('#streamType') as HTMLSelectElement | null
export let streamDetectedTypeEl = $(
  '#streamDetectedType'
) as HTMLSelectElement | null
export let streamMetaBox = $('#streamMetaBox') as HTMLElement | null
export let stMetaStatus = $('#stMetaStatus') as HTMLElement | null
export let streamHeavyWarn = $('#streamHeavyWarn') as HTMLElement | null
export let streamBtn = $('#streamBtn') as HTMLButtonElement | null
export let streamStatus = $('#streamStatus') as HTMLElement | null

// Global refresh
export let refreshBtn = $('#refreshBtn') as HTMLButtonElement | null
export let liveStateEl = $('#liveState') as HTMLElement | null

// Imports UI
export let importsListEl = $('#importsList') as HTMLElement | null
export let importsEmptyEl = $('#importsEmpty') as HTMLElement | null
export let errorBanner = $('#errorBanner') as HTMLElement | null
export let kpiActive = $('#kpiActive') as HTMLElement | null
export let kpiAvailable = $('#kpiAvailable') as HTMLElement | null
export let kpiFailed = $('#kpiFailed') as HTMLElement | null
export let kpiTotal = $('#kpiTotal') as HTMLElement | null

// Map
export let mapEl = $('#leafletMap') as HTMLDivElement | null
export let mapWrap = $('#mapWrap') as HTMLElement | null
export let mapReset = $('#mapReset') as HTMLButtonElement | null
export let mapToggle = $('#mapToggle') as HTMLButtonElement | null
export let mapEmpty = $('#mapEmpty') as HTMLElement | null
export let basemapNote = $('#basemapNote') as HTMLElement | null

// Details overlay
export let detailsOverlay = $('#detailsOverlay') as HTMLElement | null
export let detailsClose = $('#detailsClose') as HTMLButtonElement | null
export let detailsTitle = $('#detailsTitle') as HTMLElement | null
export let detailsSub = $('#detailsSub') as HTMLElement | null
export let detailsChip = $('#detailsChip') as HTMLElement | null
export let detailsMeta = $('#detailsMeta') as HTMLElement | null
export let detailsItemJson = $('#detailsItemJson') as HTMLElement | null
export let detailsJobJson = $('#detailsJobJson') as HTMLElement | null

// Config overlay
export let configBtn = $('#configBtn') as HTMLButtonElement | null
export let configOverlay = $('#configOverlay') as HTMLElement | null
export let configClose = $('#configClose') as HTMLButtonElement | null
export let configSave = $('#configSave') as HTMLButtonElement | null
export let configStatus = $('#configStatus') as HTMLElement | null
export let configList = $('#configList') as HTMLElement | null

export const refreshDom = () => {
  sourceTabBtns = getNodeList<HTMLElement>('[data-tab]')
  sourcePanels = getNodeList<HTMLElement>('[data-panel]')
  filterBtns = getNodeList<HTMLElement>('[data-filter]')

  fsListEl = $('#fsList') as HTMLUListElement | null
  currentPathEl = $('#currentPath') as HTMLElement | null
  upBtn = $('#upBtn') as HTMLButtonElement | null
  pathInput = $('#pathInput') as HTMLInputElement | null
  goBtn = $('#goBtn') as HTMLButtonElement | null

  selectedFileEl = $('#selectedFile') as HTMLInputElement | null
  localTypeEl = $('#localType') as HTMLSelectElement | null
  localMetaBox = $('#localMetaBox') as HTMLElement | null
  localMetaStatus = $('#localMetaStatus') as HTMLElement | null
  localHeavyWarn = $('#localHeavyWarn') as HTMLElement | null
  registerBtn = $('#registerBtn') as HTMLButtonElement | null
  registerStatus = $('#registerStatus') as HTMLElement | null

  downloadUrlEl = $('#downloadUrl') as HTMLInputElement | null
  downloadTypeEl = $('#downloadType') as HTMLSelectElement | null
  downloadMetaBox = $('#downloadMetaBox') as HTMLElement | null
  dlMetaStatus = $('#dlMetaStatus') as HTMLElement | null
  downloadHeavyWarn = $('#downloadHeavyWarn') as HTMLElement | null
  downloadBtn = $('#downloadBtn') as HTMLButtonElement | null
  downloadStatus = $('#downloadStatus') as HTMLElement | null

  uploadFileEl = $('#uploadFile') as HTMLInputElement | null
  uploadTypeEl = $('#uploadType') as HTMLSelectElement | null
  uploadMetaBox = $('#uploadMetaBox') as HTMLElement | null
  uploadMetaStatus = $('#upMetaStatus') as HTMLElement | null
  uploadHeavyWarn = $('#uploadHeavyWarn') as HTMLElement | null
  uploadBtn = $('#uploadBtn') as HTMLButtonElement | null
  uploadStatus = $('#uploadStatus') as HTMLElement | null

  streamUrlEl = $('#streamUrl') as HTMLInputElement | null
  streamTypeEl = $('#streamType') as HTMLSelectElement | null
  streamDetectedTypeEl = $('#streamDetectedType') as HTMLSelectElement | null
  streamMetaBox = $('#streamMetaBox') as HTMLElement | null
  stMetaStatus = $('#stMetaStatus') as HTMLElement | null
  streamHeavyWarn = $('#streamHeavyWarn') as HTMLElement | null
  streamBtn = $('#streamBtn') as HTMLButtonElement | null
  streamStatus = $('#streamStatus') as HTMLElement | null

  refreshBtn = $('#refreshBtn') as HTMLButtonElement | null
  liveStateEl = $('#liveState') as HTMLElement | null

  importsListEl = $('#importsList') as HTMLElement | null
  importsEmptyEl = $('#importsEmpty') as HTMLElement | null
  errorBanner = $('#errorBanner') as HTMLElement | null
  kpiActive = $('#kpiActive') as HTMLElement | null
  kpiAvailable = $('#kpiAvailable') as HTMLElement | null
  kpiFailed = $('#kpiFailed') as HTMLElement | null
  kpiTotal = $('#kpiTotal') as HTMLElement | null

  mapEl = $('#leafletMap') as HTMLDivElement | null
  mapWrap = $('#mapWrap') as HTMLElement | null
  mapReset = $('#mapReset') as HTMLButtonElement | null
  mapToggle = $('#mapToggle') as HTMLButtonElement | null
  mapEmpty = $('#mapEmpty') as HTMLElement | null
  basemapNote = $('#basemapNote') as HTMLElement | null

  detailsOverlay = $('#detailsOverlay') as HTMLElement | null
  detailsClose = $('#detailsClose') as HTMLButtonElement | null
  detailsTitle = $('#detailsTitle') as HTMLElement | null
  detailsSub = $('#detailsSub') as HTMLElement | null
  detailsChip = $('#detailsChip') as HTMLElement | null
  detailsMeta = $('#detailsMeta') as HTMLElement | null
  detailsItemJson = $('#detailsItemJson') as HTMLElement | null
  detailsJobJson = $('#detailsJobJson') as HTMLElement | null

  configBtn = $('#configBtn') as HTMLButtonElement | null
  configOverlay = $('#configOverlay') as HTMLElement | null
  configClose = $('#configClose') as HTMLButtonElement | null
  configSave = $('#configSave') as HTMLButtonElement | null
  configStatus = $('#configStatus') as HTMLElement | null
  configList = $('#configList') as HTMLElement | null
}
