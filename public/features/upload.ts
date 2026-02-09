import {
  uploadBtn,
  uploadFileEl,
  uploadHeavyWarn,
  uploadStatus,
  uploadTypeEl
} from '../core/dom.js'
import { api } from '../core/api.js'
import { setHeavyWarn, setStatus } from '../core/ui.js'
import {
  blockedTypeMessage,
  detectTypeFromName,
  getErrorMessage,
  isSupportedType,
  isTypeAvailable
} from '../core/utils.js'
import { state } from '../core/state.js'

const getSelectedFile = () => uploadFileEl?.files?.[0] || null

export const updateUploadState = () => {
  const file = getSelectedFile()

  if (!file) {
    if (uploadBtn) uploadBtn.disabled = true
    setStatus(uploadStatus, 'status', 'Select a file to upload.')
    setHeavyWarn(uploadHeavyWarn, 'unknown')
    return
  }

  if (!state.upload.typeOverridden) {
    const g = detectTypeFromName(file.name)
    if (uploadTypeEl) uploadTypeEl.value = isSupportedType(g) ? g : 'unknown'
  }

  const t = uploadTypeEl?.value || 'unknown'
  setHeavyWarn(uploadHeavyWarn, t)

  if (!isSupportedType(t)) {
    if (uploadBtn) uploadBtn.disabled = true
    setStatus(
      uploadStatus,
      'status is-warn',
      'Unsupported type. Choose a supported detected type.'
    )
    return
  }

  if (!isTypeAvailable(t, state.capabilities)) {
    if (uploadBtn) uploadBtn.disabled = true
    const reason = blockedTypeMessage(t, state.capabilities)
    setStatus(
      uploadStatus,
      'status is-warn',
      reason ? `Type unavailable. ${reason}` : 'Type unavailable.'
    )
    return
  }

  if (uploadBtn) uploadBtn.disabled = false
  setStatus(uploadStatus, 'status', `Ready to upload ${file.name}.`)
}

export const initUpload = (opts: {
  refreshJobs: () => Promise<void>
  isSseConnected: () => boolean
}) => {
  uploadFileEl?.addEventListener('change', () => {
    state.upload.typeOverridden = false
    updateUploadState()
  })

  uploadTypeEl?.addEventListener('change', () => {
    state.upload.typeOverridden = true
    updateUploadState()
  })

  uploadBtn?.addEventListener('click', async () => {
    const file = getSelectedFile()
    const t = uploadTypeEl?.value || 'unknown'
    if (!file || !isSupportedType(t) || !isTypeAvailable(t, state.capabilities))
      return

    if (uploadBtn) uploadBtn.disabled = true
    setStatus(uploadStatus, 'status', 'Uploading...')

    try {
      await api.upload(file, { detectedType: t })

      if (uploadFileEl) uploadFileEl.value = ''
      state.upload.typeOverridden = false
      updateUploadState()
      setStatus(uploadStatus, 'status', 'Upload completed. Job queued.')
      await opts.refreshJobs()
    } catch (err: unknown) {
      setStatus(
        uploadStatus,
        'status is-bad',
        `Upload failed: ${getErrorMessage(err)}`
      )
    } finally {
      if (uploadBtn) uploadBtn.disabled = false
    }
  })
}
