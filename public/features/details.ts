import {
  detailsChip,
  detailsClose,
  detailsItemJson,
  detailsJobJson,
  detailsMeta,
  detailsOverlay,
  detailsSub,
  detailsTitle
} from '../core/dom.js';
import { boundsToText, chipClass, escapeHtml, fmtBytes, fmtIso, getBounds, normalizeStatus } from '../core/utils.js';

let lastFocusEl: Element | null = null;

const prettyJson = (obj: unknown) => {
  try { return JSON.stringify(obj ?? null, null, 2); } catch { return String(obj); }
};

const metaValue = (item: any, meta: any, key: string, fallbacks: string[]) => {
  const fb = Array.isArray(fallbacks) ? fallbacks : [];
  const candidates = [ meta?.[key], item?.[key], ...fb.map((k) => meta?.[k] ?? item?.[k]) ];
  for (const v of candidates) {
    if (v === undefined || v === null || v === '') continue;
    return v;
  }
  return null;
};

const renderMetaGrid = (rows: Array<{ k: string; v: string; mono?: boolean }>) => {
  if (!detailsMeta) return;
  detailsMeta.innerHTML = '';
  for (const r of rows) {
    const div = document.createElement('div');
    div.className = 'kv';
    div.innerHTML = `<div class="kv__k">${escapeHtml(r.k)}</div><div class="kv__v ${r.mono ? 'mono' : ''}">${escapeHtml(r.v ?? '-')}</div>`;
    detailsMeta.appendChild(div);
  }
};

export const openDetails = (job: any, item: any, status: string) => {
  if (!detailsOverlay) return;
  lastFocusEl = document.activeElement;

  const meta = item?.metadata ?? item?.meta ?? {};
  const b = getBounds(item);
  const source = item?.sourcePath || item?.sourceUrl || (item?.streamUrl ? `${item?.streamType || 'stream'}: ${item.streamUrl}` : '—');
  const t = item?.detectedType || 'unknown';

  const minZoom = metaValue(item, meta, 'minZoom', ['minzoom']);
  const maxZoom = metaValue(item, meta, 'maxZoom', ['maxzoom']);
  const updated = metaValue(item, meta, 'updatedAt', ['updated', 'date', 'timestamp']);
  const format = metaValue(item, meta, 'format', []);
  const desc = metaValue(item, meta, 'description', ['desc', 'name']);

  if (detailsTitle) detailsTitle.textContent = item?.filename || item?.id || 'Item details';
  if (detailsSub) detailsSub.textContent = source || '—';
  if (detailsChip) {
    detailsChip.className = chipClass(status || normalizeStatus(job, item));
    detailsChip.textContent = status || normalizeStatus(job, item);
  }

  renderMetaGrid([
    { k: 'Job ID', v: String(job?.id ?? '-'), mono: true },
    { k: 'Item ID', v: String(item?.id ?? '-'), mono: true },
    { k: 'Detected type', v: t, mono: true },
    { k: 'Size', v: fmtBytes(item?.sizeBytes) },
    { k: 'Bounds', v: boundsToText(b), mono: true },
    { k: 'Min zoom', v: minZoom ?? '-', mono: true },
    { k: 'Max zoom', v: maxZoom ?? '-', mono: true },
    { k: 'Updated', v: updated ? fmtIso(updated) : '-' },
    { k: 'Format', v: format ?? '-', mono: true },
    { k: 'Description', v: desc ?? '-' },
    { k: 'Output', v: item?.output ?? '-', mono: true },
    { k: 'Staging dir', v: item?.stagingDir ?? '-', mono: true }
  ]);

  const jobSummary = {
    id: job?.id ?? null,
    state: job?.state ?? null,
    createdAt: job?.createdAt ?? null,
    updatedAt: job?.updatedAt ?? null,
    itemCount: Array.isArray(job?.items) ? job.items.length : 0,
    errors: Array.isArray(job?.errors) ? job.errors : []
  };

  if (detailsItemJson) detailsItemJson.textContent = prettyJson(item);
  if (detailsJobJson) detailsJobJson.textContent = prettyJson(jobSummary);

  detailsOverlay.classList.remove('is-hidden');
  detailsClose?.focus?.();
};

export const closeDetails = () => {
  if (!detailsOverlay) return;
  detailsOverlay.classList.add('is-hidden');
  if (lastFocusEl && typeof (lastFocusEl as any).focus === 'function') {
    try { (lastFocusEl as any).focus(); } catch (_) {}
  }
  lastFocusEl = null;
};

export const initDetails = () => {
  detailsClose?.addEventListener('click', closeDetails);
  detailsOverlay?.addEventListener('click', (e) => {
    if (e.target === detailsOverlay) closeDetails();
  });
};
