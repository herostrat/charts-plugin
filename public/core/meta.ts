import { $ } from './dom.js';
import { requiresMeta } from './utils.js';
import { setStatus } from './ui.js';

const readNum = (id: string) => {
  const el = $(id) as HTMLInputElement | null;
  if (!el) return null;
  const v = String(el.value ?? '').trim();
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const readStr = (id: string) => {
  const el = $(id) as HTMLInputElement | null;
  const v = String(el?.value ?? '').trim();
  return v ? v : null;
};

const readDateTimeLocalToIso = (id: string) => {
  const el = $(id) as HTMLInputElement | null;
  const v = String(el?.value ?? '').trim();
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
};

export const validateFolderMeta = (prefix: string) => {
  const b = [
    readNum(`#${prefix}MinLon`),
    readNum(`#${prefix}MinLat`),
    readNum(`#${prefix}MaxLon`),
    readNum(`#${prefix}MaxLat`)
  ];
  const zmin = readNum(`#${prefix}MinZoom`);
  const zmax = readNum(`#${prefix}MaxZoom`);
  const updatedAt = readDateTimeLocalToIso(`#${prefix}Updated`);
  const format = readStr(`#${prefix}Format`);
  const description = readStr(`#${prefix}Description`);

  const ok = b.every((x) => x != null) && zmin != null && zmax != null && updatedAt != null && format != null && description != null;
  return { ok, bounds: b, minZoom: zmin, maxZoom: zmax, updatedAt, format, description };
};

export const folderMetaPayload = (prefix: string) => {
  const v = validateFolderMeta(prefix);
  if (!v.ok) return null;
  return {
    bounds: v.bounds,
    minZoom: v.minZoom,
    maxZoom: v.maxZoom,
    updatedAt: v.updatedAt,
    format: v.format,
    description: v.description
  };
};

export const wireMetaInputs = (prefix: string, handler: () => void) => {
  const fields = ['MinLon','MinLat','MaxLon','MaxLat','MinZoom','MaxZoom','Updated','Format','Description'];
  fields.forEach((field) => $(
    `#${prefix}${field}`
  )?.addEventListener('input', handler));
};

export const getRequiredMeta = (
  detectedType: string,
  prefix: string,
  statusEl: HTMLElement | null,
  missingText: string
) => {
  if (!requiresMeta(detectedType)) return undefined;
  const meta = folderMetaPayload(prefix);
  if (!meta) {
    setStatus(statusEl, 'status is-warn', missingText);
    return null;
  }
  return meta;
};

export const toggleMetaBox = (boxEl: HTMLElement | null, statusEl: HTMLElement | null, enabled: boolean) => {
  boxEl?.classList.toggle('is-hidden', !enabled);
  statusEl?.classList.add('is-hidden');
};
