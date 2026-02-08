import {
  uploadBtn,
  uploadFileEl,
  uploadHeavyWarn,
  uploadMetaBox,
  uploadMetaStatus,
  uploadStatus,
  uploadTypeEl
} from '../core/dom.js';
import { api } from '../core/api.js';
import { setHeavyWarn, setStatus } from '../core/ui.js';
import { detectTypeFromName, isSupportedType, requiresMeta } from '../core/utils.js';
import { getRequiredMeta, toggleMetaBox, validateFolderMeta, wireMetaInputs } from '../core/meta.js';
import { state } from '../core/state.js';

const getSelectedFile = () => uploadFileEl?.files?.[0] || null;

export const updateUploadState = () => {
  const file = getSelectedFile();

  if (!file) {
    if (uploadBtn) uploadBtn.disabled = true;
    setStatus(uploadStatus, 'status', 'Select a file to upload.');
    setHeavyWarn(uploadHeavyWarn, 'unknown');
    toggleMetaBox(uploadMetaBox, uploadMetaStatus, false);
    return;
  }

  if (!state.upload.typeOverridden) {
    const g = detectTypeFromName(file.name);
    if (uploadTypeEl) uploadTypeEl.value = isSupportedType(g) ? g : 'unknown';
  }

  const t = uploadTypeEl?.value || 'unknown';
  setHeavyWarn(uploadHeavyWarn, t);

  if (!isSupportedType(t)) {
    if (uploadBtn) uploadBtn.disabled = true;
    setStatus(uploadStatus, 'status is-warn', 'Unsupported type. Choose a supported detected type.');
    toggleMetaBox(uploadMetaBox, uploadMetaStatus, false);
    return;
  }

  const needMeta = requiresMeta(t);
  toggleMetaBox(uploadMetaBox, uploadMetaStatus, needMeta);

  if (needMeta) {
    const v = validateFolderMeta('up');
    uploadMetaStatus?.classList.toggle('is-hidden', v.ok);
    if (uploadBtn) uploadBtn.disabled = !v.ok;
    setStatus(uploadStatus, v.ok ? 'status' : 'status is-warn', v.ok ? 'Ready to upload folder.' : 'Fill required metadata for folder import.');
    return;
  }

  if (uploadBtn) uploadBtn.disabled = false;
  setStatus(uploadStatus, 'status', `Ready to upload ${file.name}.`);
};

export const initUpload = (opts: { refreshJobs: () => Promise<void>; isSseConnected: () => boolean }) => {
  uploadFileEl?.addEventListener('change', () => {
    state.upload.typeOverridden = false;
    updateUploadState();
  });

  uploadTypeEl?.addEventListener('change', () => {
    state.upload.typeOverridden = true;
    updateUploadState();
  });

  wireMetaInputs('up', updateUploadState);

  uploadBtn?.addEventListener('click', async () => {
    const file = getSelectedFile();
    const t = uploadTypeEl?.value || 'unknown';
    if (!file || !isSupportedType(t)) return;

    uploadBtn.disabled = true;
    setStatus(uploadStatus, 'status', 'Uploading...');

    try {
      const meta = getRequiredMeta(t, 'up', uploadStatus, 'Missing required folder metadata.');
      if (meta === null) return;

      await api.upload(file, { detectedType: t, metadata: meta });

      if (uploadFileEl) uploadFileEl.value = '';
      state.upload.typeOverridden = false;
      updateUploadState();
      setStatus(uploadStatus, 'status', 'Upload completed. Job queued.');
      await opts.refreshJobs();
    } catch (e: any) {
      setStatus(uploadStatus, 'status is-bad', `Upload failed: ${e.message}`);
    } finally {
      uploadBtn.disabled = false;
    }
  });
};
