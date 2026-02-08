import { HEAVY_TYPES } from './constants.js'
import { errorBanner } from './dom.js'

export const setHeavyWarn = (el: HTMLElement | null, t: string) => {
  if (!el) return
  const on = HEAVY_TYPES.has(String(t))
  el.classList.toggle('is-hidden', !on)
}

export const setStatus = (
  el: HTMLElement | null,
  className: string,
  text: string
) => {
  if (!el) return
  el.className = className
  el.textContent = text
}

export const clearError = () => {
  if (!errorBanner) return
  errorBanner.classList.add('is-hidden')
  errorBanner.textContent = ''
}

export const showError = (msg: string) => {
  if (!errorBanner) return
  errorBanner.textContent = msg
  errorBanner.classList.remove('is-hidden')
}
