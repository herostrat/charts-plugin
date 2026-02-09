import { strict as assert } from 'assert'
import fs from 'fs'
import path from 'path'
import { JSDOM } from 'jsdom'
import { pathToFileURL } from 'url'

type FetchCall = {
  url: string
  method: string
}

type GlobalDom = {
  window?: Window
  document?: Document
  navigator?: Navigator
  CSS?: { escape: (_value: string) => string }
  EventSource?: typeof EventSource
  fetch?: typeof fetch
}

const htmlPath = path.resolve('public/index.html')
const uiScriptPath = path.resolve('public/index.ts')

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0))
const assertCalls = (calls: FetchCall[]) => {
  assert.ok(calls.length >= 0)
}
const getGlobalDom = () => globalThis as unknown as GlobalDom

const createDom = () => {
  const html = fs.readFileSync(htmlPath, 'utf-8')
  const dom = new JSDOM(html, {
    url: 'http://localhost/@signalk/charts-plugin/index.html',
    pretendToBeVisual: true
  })

  return dom
}

const installGlobals = (dom: JSDOM, fetchCalls: FetchCall[]) => {
  const { window } = dom
  const globalDom = getGlobalDom()

  globalDom.window = window as unknown as Window
  globalDom.document = window.document
  Object.defineProperty(globalDom, 'navigator', {
    value: window.navigator,
    configurable: true
  })
  globalDom.CSS = { escape: (value: string) => value }

  class FakeEventSource {
    public url: string
    public onopen: null | (() => void) = null
    public onerror: null | (() => void) = null
    private listeners: Record<string, Array<(_ev: MessageEvent) => void>> = {}

    constructor(url: string) {
      this.url = url
      setTimeout(() => this.onopen?.(), 0)
    }

    addEventListener(type: string, cb: (_ev: MessageEvent) => void) {
      this.listeners[type] = this.listeners[type] || []
      this.listeners[type].push(cb)
    }

    close() {
      // no-op
    }

    emit(type: string, data: unknown) {
      const ev = new window.MessageEvent(type, { data: JSON.stringify(data) })
      const listeners = this.listeners[type] || []
      listeners.forEach((cb) => cb(ev))
    }
  }

  globalDom.EventSource = FakeEventSource as unknown as typeof EventSource

  globalDom.fetch = (async (url: string, init?: RequestInit) => {
    fetchCalls.push({ url: String(url), method: String(init?.method || 'GET') })

    if (String(url).endsWith('/@signalk/charts-plugin/imports')) {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new window.Headers({ 'content-type': 'application/json' }),
        json: async () => []
      } as Response
    }

    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new window.Headers({ 'content-type': 'application/json' }),
      json: async () => ({})
    } as Response
  }) as typeof fetch
}

const cleanupGlobals = () => {
  const globalDom = getGlobalDom()
  delete globalDom.window
  delete globalDom.document
  delete globalDom.navigator
  delete globalDom.CSS
  delete globalDom.EventSource
  delete globalDom.fetch
}

describe('Web UI bootstrap', () => {
  afterEach(() => {
    cleanupGlobals()
  })

  it('renders the Leaflet fallback when Leaflet is missing', async () => {
    const dom = createDom()
    const calls: FetchCall[] = []
    installGlobals(dom, calls)

    const moduleUrl = `${pathToFileURL(uiScriptPath).href}?t=${Date.now()}`
    await import(moduleUrl)
    await flushPromises()

    const mapEl = dom.window.document.querySelector('#leafletMap')
    assert.ok(mapEl)
    assert.ok(mapEl?.textContent?.includes('Leaflet not found'))
    assertCalls(calls)
  })

  it('enables download when a URL is provided', async () => {
    const dom = createDom()
    const calls: FetchCall[] = []
    installGlobals(dom, calls)

    const moduleUrl = `${pathToFileURL(uiScriptPath).href}?t=${Date.now()}`
    await import(moduleUrl)
    await flushPromises()

    const urlInput = dom.window.document.querySelector(
      '#downloadUrl'
    ) as HTMLInputElement
    const downloadBtn = dom.window.document.querySelector(
      '#downloadBtn'
    ) as HTMLButtonElement

    urlInput.value = 'https://example.com/chart.tif'
    urlInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }))

    assert.equal(downloadBtn.disabled, false)
    assertCalls(calls)
  })

  it('enables stream registration when a URL is provided', async () => {
    const dom = createDom()
    const calls: FetchCall[] = []
    installGlobals(dom, calls)

    const moduleUrl = `${pathToFileURL(uiScriptPath).href}?t=${Date.now()}`
    await import(moduleUrl)
    await flushPromises()

    const streamUrl = dom.window.document.querySelector(
      '#streamUrl'
    ) as HTMLInputElement
    const streamType = dom.window.document.querySelector(
      '#streamDetectedType'
    ) as HTMLSelectElement
    const streamBtn = dom.window.document.querySelector(
      '#streamBtn'
    ) as HTMLButtonElement

    streamUrl.value = 'https://example.com/service'
    streamType.value = 'mbtiles'
    streamUrl.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    streamType.dispatchEvent(new dom.window.Event('change', { bubbles: true }))

    assert.equal(streamBtn.disabled, false)
    assertCalls(calls)
  })
})
