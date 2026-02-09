import {
  providersEmptyEl,
  providersListEl,
  refreshDom
} from '../core/dom.js'
import type { OnlineProviderRecord } from '../core/state.js'
import { state } from '../core/state.js'
import { api } from '../core/api.js'
import { escapeAttr, escapeHtml, fmtIso, getErrorMessage } from '../core/utils.js'
import { showError } from '../core/ui.js'

const describeProvider = (provider: OnlineProviderRecord) => {
  const type = provider.serverType || 'tilelayer'
  const format = provider.format || 'png'
  const layers = Array.isArray(provider.layers) && provider.layers.length > 0
    ? provider.layers.join(', ')
    : null
  const proxy = provider.proxy ? 'proxy' : 'direct'
  const updated = provider.updatedAt ? fmtIso(String(provider.updatedAt)) : null
  return { type, format, layers, proxy, updated }
}

export const renderProviders = (providers: OnlineProviderRecord[]) => {
  if (!providersListEl) refreshDom()
  const items = Array.isArray(providers) ? providers : []

  if (providersEmptyEl) {
    providersEmptyEl.classList.toggle('is-hidden', items.length > 0)
  }
  if (providersListEl) providersListEl.innerHTML = ''

  for (const provider of items) {
    const meta = describeProvider(provider)
    const el = document.createElement('div')
    el.className = 'item'
    el.innerHTML = `
      <div class="item__top">
        <div style="min-width:0;">
          <div class="item__name">${escapeHtml(provider.name || provider.id)}</div>
          <div class="item__sub">${escapeHtml(provider.url)}</div>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <span class="chip chip--available">online</span>
        </div>
      </div>

      <div class="metaGrid">
        <div class="pill"><b>type</b><span>${escapeHtml(meta.type)}</span></div>
        <div class="pill"><b>format</b><span>${escapeHtml(meta.format)}</span></div>
        <div class="pill"><b>proxy</b><span>${escapeHtml(meta.proxy)}</span></div>
        <div class="pill"><b>layers</b><span>${escapeHtml(meta.layers || '-')}</span></div>
        <div class="pill"><b>updated</b><span>${escapeHtml(meta.updated || '-')}</span></div>
      </div>

      <div class="rowActions">
        <button class="btn btn--danger btn--sm" data-delete="${escapeAttr(provider.id)}">Delete</button>
      </div>
    `

    const deleteBtn = el.querySelector('button[data-delete]') as
      | HTMLButtonElement
      | null
    deleteBtn?.addEventListener('click', async (ev) => {
      ev.stopPropagation()
      if (!window.confirm('Delete this online provider?')) return
      if (deleteBtn) deleteBtn.disabled = true
      try {
        await api.deleteOnlineProvider(provider.id)
        await refreshProviders()
      } catch (err: unknown) {
        showError(`Delete failed: ${getErrorMessage(err)}`)
      } finally {
        if (deleteBtn) deleteBtn.disabled = false
      }
    })

    providersListEl?.appendChild(el)
  }
}

export const refreshProviders = async () => {
  try {
    const payload: unknown = await api.listOnlineProviders()
    const providers = Array.isArray((payload as { providers?: unknown }).providers)
      ? ((payload as { providers?: OnlineProviderRecord[] }).providers as OnlineProviderRecord[])
      : []
    state.providers = providers
    renderProviders(providers)
  } catch (err: unknown) {
    showError(`Online providers list failed: ${getErrorMessage(err)}`)
    state.providers = []
    renderProviders([])
  }
}

export const initProviders = () => {
  renderProviders(state.providers)
}
