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

// Download form
export let downloadUrlEl = $('#downloadUrl') as HTMLInputElement | null
export let downloadTypeEl = $('#downloadType') as HTMLSelectElement | null
export let downloadDeliveryEl = $(
  '#downloadDelivery'
) as HTMLSelectElement | null
export let downloadCatalogEl = $('#downloadCatalog') as HTMLSelectElement | null
export let downloadCatalogBody = $('#downloadCatalogBody') as HTMLElement | null
export let downloadChartEl = $('#downloadChart') as HTMLSelectElement | null
export let downloadChartRow = $('#downloadChartRow') as HTMLElement | null
export let downloadCatalogDetails = $(
  '#downloadCatalogDetails'
) as HTMLButtonElement | null
export let downloadCatalogInfo = $('#downloadCatalogInfo') as HTMLElement | null
export let downloadCatalogStatus = $(
  '#downloadCatalogStatus'
) as HTMLElement | null
export let downloadCatalogRefresh = $(
  '#downloadCatalogRefresh'
) as HTMLButtonElement | null
export let downloadUrlHome = $('#downloadUrlHome') as HTMLElement | null
export let downloadUrlRow = $('#downloadUrlRow') as HTMLElement | null
export let downloadBboxEl = $('#downloadBbox') as HTMLInputElement | null
export let downloadBboxPick = $('#downloadBboxPick') as HTMLButtonElement | null
export let downloadHeavyWarn = $('#downloadHeavyWarn') as HTMLElement | null
export let downloadBtn = $('#downloadBtn') as HTMLButtonElement | null
export let downloadStatus = $('#downloadStatus') as HTMLElement | null

// Upload form
export let uploadFileEl = $('#uploadFile') as HTMLInputElement | null
export let uploadTypeEl = $('#uploadType') as HTMLSelectElement | null
export let uploadHeavyWarn = $('#uploadHeavyWarn') as HTMLElement | null
export let uploadBtn = $('#uploadBtn') as HTMLButtonElement | null
export let uploadStatus = $('#uploadStatus') as HTMLElement | null

// Stream form
export let streamUrlEl = $('#streamUrl') as HTMLInputElement | null
export let streamTypeEl = $('#streamType') as HTMLSelectElement | null
export let streamNameEl = $('#streamName') as HTMLInputElement | null
export let streamDescriptionEl = $('#streamDescription') as HTMLInputElement | null
export let streamFormatEl = $('#streamFormat') as HTMLSelectElement | null
export let streamMinZoomEl = $('#streamMinZoom') as HTMLInputElement | null
export let streamMaxZoomEl = $('#streamMaxZoom') as HTMLInputElement | null
export let streamBoundsEl = $('#streamBounds') as HTMLInputElement | null
export let streamLayersEl = $('#streamLayers') as HTMLInputElement | null
export let streamTileMatrixSetEl =
  $('#streamTileMatrixSet') as HTMLInputElement | null
export let streamHeadersEl = $('#streamHeaders') as HTMLTextAreaElement | null
export let streamProxyEl = $('#streamProxy') as HTMLInputElement | null
export let streamHeavyWarn = $('#streamHeavyWarn') as HTMLElement | null
export let streamBtn = $('#streamBtn') as HTMLButtonElement | null
export let streamStatus = $('#streamStatus') as HTMLElement | null

// Global refresh
export let refreshBtn = $('#refreshBtn') as HTMLButtonElement | null
export let liveStateEl = $('#liveState') as HTMLElement | null

// Imports UI
export let importsListEl = $('#importsList') as HTMLElement | null
export let importsEmptyEl = $('#importsEmpty') as HTMLElement | null
export let providersListEl = $('#providersList') as HTMLElement | null
export let providersEmptyEl = $('#providersEmpty') as HTMLElement | null
export let errorBanner = $('#errorBanner') as HTMLElement | null
export let kpiActive = $('#kpiActive') as HTMLElement | null
export let kpiAvailable = $('#kpiAvailable') as HTMLElement | null
export let kpiFailed = $('#kpiFailed') as HTMLElement | null
export let kpiTotal = $('#kpiTotal') as HTMLElement | null
export let sourcesOpenBtn = $('#sourcesOpen') as HTMLButtonElement | null
export let sourcesCloseBtn = $('#sourcesClose') as HTMLButtonElement | null
export let sourcesPopup = $('#sourcesPopup') as HTMLElement | null

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

// Bbox overlay
export let bboxOverlay = $('#bboxOverlay') as HTMLElement | null
export let bboxClose = $('#bboxClose') as HTMLButtonElement | null
export let bboxConfirm = $('#bboxConfirm') as HTMLButtonElement | null
export let bboxMapEl = $('#bboxMap') as HTMLDivElement | null
export let bboxValue = $('#bboxValue') as HTMLElement | null

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

  downloadUrlEl = $('#downloadUrl') as HTMLInputElement | null
  downloadTypeEl = $('#downloadType') as HTMLSelectElement | null
  downloadDeliveryEl = $('#downloadDelivery') as HTMLSelectElement | null
  downloadCatalogEl = $('#downloadCatalog') as HTMLSelectElement | null
  downloadCatalogBody = $('#downloadCatalogBody') as HTMLElement | null
  downloadChartEl = $('#downloadChart') as HTMLSelectElement | null
  downloadChartRow = $('#downloadChartRow') as HTMLElement | null
  downloadCatalogDetails = $(
    '#downloadCatalogDetails'
  ) as HTMLButtonElement | null
  downloadCatalogInfo = $('#downloadCatalogInfo') as HTMLElement | null
  downloadCatalogStatus = $('#downloadCatalogStatus') as HTMLElement | null
  downloadCatalogRefresh = $(
    '#downloadCatalogRefresh'
  ) as HTMLButtonElement | null
  downloadUrlHome = $('#downloadUrlHome') as HTMLElement | null
  downloadUrlRow = $('#downloadUrlRow') as HTMLElement | null
  downloadBboxEl = $('#downloadBbox') as HTMLInputElement | null
  downloadBboxPick = $('#downloadBboxPick') as HTMLButtonElement | null
  downloadHeavyWarn = $('#downloadHeavyWarn') as HTMLElement | null
  downloadBtn = $('#downloadBtn') as HTMLButtonElement | null
  downloadStatus = $('#downloadStatus') as HTMLElement | null

  uploadFileEl = $('#uploadFile') as HTMLInputElement | null
  uploadTypeEl = $('#uploadType') as HTMLSelectElement | null
  uploadHeavyWarn = $('#uploadHeavyWarn') as HTMLElement | null
  uploadBtn = $('#uploadBtn') as HTMLButtonElement | null
  uploadStatus = $('#uploadStatus') as HTMLElement | null

  streamUrlEl = $('#streamUrl') as HTMLInputElement | null
  streamTypeEl = $('#streamType') as HTMLSelectElement | null
  streamNameEl = $('#streamName') as HTMLInputElement | null
  streamDescriptionEl = $('#streamDescription') as HTMLInputElement | null
  streamFormatEl = $('#streamFormat') as HTMLSelectElement | null
  streamMinZoomEl = $('#streamMinZoom') as HTMLInputElement | null
  streamMaxZoomEl = $('#streamMaxZoom') as HTMLInputElement | null
  streamBoundsEl = $('#streamBounds') as HTMLInputElement | null
  streamLayersEl = $('#streamLayers') as HTMLInputElement | null
  streamTileMatrixSetEl =
    $('#streamTileMatrixSet') as HTMLInputElement | null
  streamHeadersEl = $('#streamHeaders') as HTMLTextAreaElement | null
  streamProxyEl = $('#streamProxy') as HTMLInputElement | null
  streamHeavyWarn = $('#streamHeavyWarn') as HTMLElement | null
  streamBtn = $('#streamBtn') as HTMLButtonElement | null
  streamStatus = $('#streamStatus') as HTMLElement | null

  refreshBtn = $('#refreshBtn') as HTMLButtonElement | null
  liveStateEl = $('#liveState') as HTMLElement | null

  importsListEl = $('#importsList') as HTMLElement | null
  importsEmptyEl = $('#importsEmpty') as HTMLElement | null
  providersListEl = $('#providersList') as HTMLElement | null
  providersEmptyEl = $('#providersEmpty') as HTMLElement | null
  errorBanner = $('#errorBanner') as HTMLElement | null
  kpiActive = $('#kpiActive') as HTMLElement | null
  kpiAvailable = $('#kpiAvailable') as HTMLElement | null
  kpiFailed = $('#kpiFailed') as HTMLElement | null
  kpiTotal = $('#kpiTotal') as HTMLElement | null
  sourcesOpenBtn = $('#sourcesOpen') as HTMLButtonElement | null
  sourcesCloseBtn = $('#sourcesClose') as HTMLButtonElement | null
  sourcesPopup = $('#sourcesPopup') as HTMLElement | null

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

  bboxOverlay = $('#bboxOverlay') as HTMLElement | null
  bboxClose = $('#bboxClose') as HTMLButtonElement | null
  bboxConfirm = $('#bboxConfirm') as HTMLButtonElement | null
  bboxMapEl = $('#bboxMap') as HTMLDivElement | null
  bboxValue = $('#bboxValue') as HTMLElement | null

  configBtn = $('#configBtn') as HTMLButtonElement | null
  configOverlay = $('#configOverlay') as HTMLElement | null
  configClose = $('#configClose') as HTMLButtonElement | null
  configSave = $('#configSave') as HTMLButtonElement | null
  configStatus = $('#configStatus') as HTMLElement | null
  configList = $('#configList') as HTMLElement | null
}
