import {
  streamBtn,
  streamDetectedTypeEl,
  streamHeavyWarn,
  streamMetaBox,
  streamStatus,
  streamTypeEl,
  streamUrlEl,
  stMetaStatus
} from '../core/dom.js';
import { api } from '../core/api.js';
import { setHeavyWarn, setStatus } from '../core/ui.js';
import { isSupportedType, requiresMeta } from '../core/utils.js';
import { getRequiredMeta, toggleMetaBox, validateFolderMeta, wireMetaInputs } from '../core/meta.js';

export const updateStreamState = () => {
  const url = streamUrlEl?.value.trim() || '';
  const t = streamDetectedTypeEl?.value || 'unknown';

  setHeavyWarn(streamHeavyWarn, t);

  if (!url) {
    if (streamBtn) streamBtn.disabled = true;
    setStatus(streamStatus, 'status', 'Provide a stream URL.');
    toggleMetaBox(streamMetaBox, stMetaStatus, false);
    return;
  }

  if (!isSupportedType(t)) {
    if (streamBtn) streamBtn.disabled = true;
    setStatus(streamStatus, 'status is-warn', 'Pick a supported detected type hint.');
    toggleMetaBox(streamMetaBox, stMetaStatus, false);
    return;
  }

  const needMeta = requiresMeta(t);
  toggleMetaBox(streamMetaBox, stMetaStatus, needMeta);

  if (needMeta) {
    const v = validateFolderMeta('st');
    stMetaStatus?.classList.toggle('is-hidden', v.ok);
    if (streamBtn) streamBtn.disabled = !v.ok;
    setStatus(streamStatus, v.ok ? 'status' : 'status is-warn', v.ok ? 'Ready to register stream.' : 'Fill required metadata for folder import.');
    return;
  }

  if (streamBtn) streamBtn.disabled = false;
  setStatus(streamStatus, 'status', 'Ready to register stream.');
};

export const initStream = (opts: { refreshJobs: () => Promise<void>; isSseConnected: () => boolean }) => {
  streamUrlEl?.addEventListener('input', updateStreamState);
  streamDetectedTypeEl?.addEventListener('change', updateStreamState);
  wireMetaInputs('st', updateStreamState);

  streamBtn?.addEventListener('click', async () => {
    const streamUrl = streamUrlEl?.value.trim() || '';
    const streamType = streamTypeEl?.value || 'wms';
    const detectedType = streamDetectedTypeEl?.value || 'unknown';
    if (!streamUrl || !isSupportedType(detectedType)) return;

    streamBtn.disabled = true;
    setStatus(streamStatus, 'status', 'Creating streaming job...');

    try {
      const item: { streamUrl: string; streamType: string; detectedType: string; metadata?: unknown } = { streamUrl, streamType, detectedType };

      const meta = getRequiredMeta(detectedType, 'st', streamStatus, 'Missing required folder metadata.');
      if (meta === null) return;
      if (meta) item.metadata = meta;

      await api.createJob({ items: [item] });
      setStatus(streamStatus, 'status', 'Streaming source registered.');
      await opts.refreshJobs();
    } catch (e: any) {
      setStatus(streamStatus, 'status is-bad', `Register stream failed: ${e.message}`);
    } finally {
      streamBtn.disabled = false;
    }
  });
};
