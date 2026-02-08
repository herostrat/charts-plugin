import {
  downloadBtn,
  downloadHeavyWarn,
  downloadStatus,
  downloadTypeEl,
  downloadUrlEl,
  downloadMetaBox,
  dlMetaStatus
} from '../core/dom.js';
import { api } from '../core/api.js';
import { setHeavyWarn, setStatus } from '../core/ui.js';
import { detectTypeFromName, isSupportedType, requiresMeta } from '../core/utils.js';
import { getRequiredMeta, toggleMetaBox, validateFolderMeta, wireMetaInputs } from '../core/meta.js';
import { state } from '../core/state.js';

const guessTypeFromUrl = (url: string) => {
  if (!url) return 'unknown';
  const noHash = url.split('#')[0];
  const noQ = noHash.split('?')[0];
  const base = noQ.split('/').pop() || '';
  return detectTypeFromName(base);
};

export const updateDownloadState = () => {
  const url = downloadUrlEl?.value.trim() || '';
  if (!url) {
    if (downloadBtn) downloadBtn.disabled = true;
    setStatus(downloadStatus, 'status', 'Enter a URL.');
    setHeavyWarn(downloadHeavyWarn, 'unknown');
    toggleMetaBox(downloadMetaBox, dlMetaStatus, false);
    return;
  }

  if (!state.download.typeOverridden) {
    const g = guessTypeFromUrl(url);
    if (downloadTypeEl) downloadTypeEl.value = isSupportedType(g) ? g : 'unknown';
  }

  const t = downloadTypeEl?.value || 'unknown';
  setHeavyWarn(downloadHeavyWarn, t);

  if (!isSupportedType(t)) {
    if (downloadBtn) downloadBtn.disabled = true;
    setStatus(downloadStatus, 'status is-warn', 'Unsupported type. Choose a supported detected type.');
    toggleMetaBox(downloadMetaBox, dlMetaStatus, false);
    return;
  }

  const needMeta = requiresMeta(t);
  toggleMetaBox(downloadMetaBox, dlMetaStatus, needMeta);

  if (needMeta) {
    const v = validateFolderMeta('dl');
    dlMetaStatus?.classList.toggle('is-hidden', v.ok);
    if (downloadBtn) downloadBtn.disabled = !v.ok;
    setStatus(downloadStatus, v.ok ? 'status' : 'status is-warn', v.ok ? 'Ready to create download job.' : 'Fill required metadata for folder import.');
    return;
  }

  if (downloadBtn) downloadBtn.disabled = false;
  setStatus(downloadStatus, 'status', 'Ready to create download job.');
};

export const initDownload = (opts: { refreshJobs: () => Promise<void>; isSseConnected: () => boolean }) => {
  downloadUrlEl?.addEventListener('input', updateDownloadState);
  downloadTypeEl?.addEventListener('change', () => {
    state.download.typeOverridden = true;
    updateDownloadState();
  });
  wireMetaInputs('dl', updateDownloadState);

  downloadBtn?.addEventListener('click', async () => {
    const url = downloadUrlEl?.value.trim() || '';
    const t = downloadTypeEl?.value || 'unknown';
    if (!url || !isSupportedType(t)) return;

    downloadBtn.disabled = true;
    setStatus(downloadStatus, 'status', 'Creating download job...');

    try {
      const filename = (url.split('#')[0].split('?')[0].split('/').pop() || 'download');
      const item: { filename: string; sourceUrl: string; detectedType: string; metadata?: unknown } = { filename, sourceUrl: url, detectedType: t };

      const meta = getRequiredMeta(t, 'dl', downloadStatus, 'Missing required folder metadata.');
      if (meta === null) return;
      if (meta) item.metadata = meta;

      await api.createJob({ items: [item] });
      setStatus(downloadStatus, 'status', 'Download job created.');
      await opts.refreshJobs();
    } catch (e: any) {
      setStatus(downloadStatus, 'status is-bad', `Download failed: ${e.message}`);
    } finally {
      downloadBtn.disabled = false;
    }
  });
};
