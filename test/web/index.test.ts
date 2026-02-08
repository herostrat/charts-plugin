import { strict as assert } from 'assert'
import fs from 'fs'
import path from 'path'
import { JSDOM } from 'jsdom'
import { pathToFileURL } from 'url'

type FetchCall = {
  url: string
  method: string
}

const htmlPath = path.resolve('public/index.html')
const uiScriptPath = path.resolve('public/index.ts')

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0))

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

  ;(globalThis as any).window = window as unknown as Window
  ;(globalThis as any).document = window.document
  Object.defineProperty(globalThis, 'navigator', {
    value: window.navigator,
    configurable: true
  })
  ;(globalThis as any).CSS = { escape: (value: string) => value } as any

  class FakeEventSource {
    public url: string
    public onopen: null | (() => void) = null
    public onerror: null | (() => void) = null
    private listeners: Record<string, Array<(ev: MessageEvent) => void>> = {}

    constructor(url: string) {
      this.url = url
      setTimeout(() => this.onopen?.(), 0)
    }

    addEventListener(type: string, cb: (ev: MessageEvent) => void) {
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

  ;(globalThis as any).EventSource = FakeEventSource as unknown as typeof EventSource

  const now = new Date().toISOString()
  const fsEntries = [
    {
      name: 'sample.tif',
      path: '/charts/sample.tif',
      size: 1024,
      mtime: now,
      type: 'file'
    }
  ]

  ;(globalThis as any).fetch = (async (url: string, init?: RequestInit) => {
    fetchCalls.push({ url: String(url), method: String(init?.method || 'GET') })

    if (String(url).includes('/@signalk/charts-plugin/imports/fs')) {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new window.Headers({ 'content-type': 'application/json' }),
        json: async () => ({ path: '/', parent: null, entries: fsEntries })
      } as Response
    }

    if (String(url).endsWith('/@signalk/charts-plugin/imports')) {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new window.Headers({ 'content-type': 'application/json' }),
        json: async () => ([])
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
  delete (globalThis as any).window
  delete (globalThis as any).document
  delete (globalThis as any).navigator
  delete (globalThis as any).CSS
  delete (globalThis as any).EventSource
  delete (globalThis as any).fetch
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
  })

  it('enables register after selecting a file', async () => {
    const dom = createDom()
    const calls: FetchCall[] = []
    installGlobals(dom, calls)

    const moduleUrl = `${pathToFileURL(uiScriptPath).href}?t=${Date.now()}`
    await import(moduleUrl)
    await flushPromises()

    const selectButton = dom.window.document.querySelector('button[data-select]') as HTMLButtonElement
    assert.ok(selectButton)
    selectButton.click()

    const selected = dom.window.document.querySelector('#selectedFile') as HTMLInputElement
    const registerBtn = dom.window.document.querySelector('#registerBtn') as HTMLButtonElement
    const status = dom.window.document.querySelector('#registerStatus') as HTMLElement

    assert.equal(selected.value, 'sample.tif')
    assert.equal(registerBtn.disabled, false)
    assert.ok(status.textContent?.includes('Ready to register'))
  })

  it('enables download when a URL is provided', async () => {
    const dom = createDom()
    const calls: FetchCall[] = []
    installGlobals(dom, calls)

    const moduleUrl = `${pathToFileURL(uiScriptPath).href}?t=${Date.now()}`
    await import(moduleUrl)
    await flushPromises()

    const urlInput = dom.window.document.querySelector('#downloadUrl') as HTMLInputElement
    const downloadBtn = dom.window.document.querySelector('#downloadBtn') as HTMLButtonElement

    urlInput.value = 'https://example.com/chart.tif'
    urlInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }))

    assert.equal(downloadBtn.disabled, false)
  })

  it('enables stream registration when a URL is provided', async () => {
    const dom = createDom()
    const calls: FetchCall[] = []
    installGlobals(dom, calls)

    const moduleUrl = `${pathToFileURL(uiScriptPath).href}?t=${Date.now()}`
    await import(moduleUrl)
    await flushPromises()

    const streamUrl = dom.window.document.querySelector('#streamUrl') as HTMLInputElement
    const streamType = dom.window.document.querySelector('#streamDetectedType') as HTMLSelectElement
    const streamBtn = dom.window.document.querySelector('#streamBtn') as HTMLButtonElement

    streamUrl.value = 'https://example.com/service'
    streamType.value = 'mbtiles'
    streamUrl.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    streamType.dispatchEvent(new dom.window.Event('change', { bubbles: true }))

    assert.equal(streamBtn.disabled, false)
  })
})
