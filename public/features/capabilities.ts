import { api } from '../core/api.js'
import { state } from '../core/state.js'
import { downloadTypeEl, uploadTypeEl } from '../core/dom.js'
import { blockedTypeMessage, isTypeAvailable } from '../core/utils.js'

const applyTypeAvailability = (select: HTMLSelectElement | null) => {
  if (!select) return
  for (const option of Array.from(select.options)) {
    const value = option.value
    if (!value) continue
    const allowed = isTypeAvailable(value, state.capabilities)
    const message = blockedTypeMessage(value, state.capabilities)
    option.disabled = !allowed
    option.textContent = !allowed && message ? `${value} (unavailable)` : value
  }
}

export const loadCapabilities = async () => {
  try {
    const caps = await api.getCapabilities()
    state.capabilities = caps
  } catch {
    state.capabilities = null
  }

  applyTypeAvailability(downloadTypeEl)
  applyTypeAvailability(uploadTypeEl)
}
