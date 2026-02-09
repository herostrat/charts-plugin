import {
  streamBtn,
  streamDetectedTypeEl,
  streamHeavyWarn,
  streamStatus,
  streamTypeEl,
  streamUrlEl
} from '../core/dom.js'
import { api } from '../core/api.js'
import { setHeavyWarn, setStatus } from '../core/ui.js'
import { getErrorMessage, isSupportedType } from '../core/utils.js'

export const updateStreamState = () => {
  const url = streamUrlEl?.value.trim() || ''
  const t = streamDetectedTypeEl?.value || 'unknown'

  setHeavyWarn(streamHeavyWarn, t)

  if (!url) {
    if (streamBtn) streamBtn.disabled = true
    setStatus(streamStatus, 'status', 'Provide a stream URL.')
    return
  }

  if (!isSupportedType(t)) {
    if (streamBtn) streamBtn.disabled = true
    setStatus(
      streamStatus,
      'status is-warn',
      'Pick a supported detected type hint.'
    )
    return
  }

  if (streamBtn) streamBtn.disabled = false
  setStatus(streamStatus, 'status', 'Ready to register stream.')
}

export const initStream = (opts: {
  refreshJobs: () => Promise<void>
  isSseConnected: () => boolean
}) => {
  streamUrlEl?.addEventListener('input', updateStreamState)
  streamDetectedTypeEl?.addEventListener('change', updateStreamState)

  streamBtn?.addEventListener('click', async () => {
    const streamUrl = streamUrlEl?.value.trim() || ''
    const streamType = streamTypeEl?.value || 'wms'
    const detectedType = streamDetectedTypeEl?.value || 'unknown'
    if (!streamUrl || !isSupportedType(detectedType)) return

    if (streamBtn) streamBtn.disabled = true
    setStatus(streamStatus, 'status', 'Creating streaming job...')

    try {
      const item: {
        streamUrl: string
        streamType: string
        detectedType: string
      } = { streamUrl, streamType, detectedType }

      await api.createJob({ items: [item] })
      setStatus(streamStatus, 'status', 'Streaming source registered.')
      await opts.refreshJobs()
    } catch (err: unknown) {
      setStatus(
        streamStatus,
        'status is-bad',
        `Register stream failed: ${getErrorMessage(err)}`
      )
    } finally {
      if (streamBtn) streamBtn.disabled = false
    }
  })
}
