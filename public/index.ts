interface Window {
  L?: unknown
}

(() => {
  'use strict';

  const API_BASE = '/@signalk/charts-plugin/imports';
  const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel);
  const assetUrl = (() => {
    const scriptEl = (document.currentScript as HTMLScriptElement | null) ||
      document.querySelector<HTMLScriptElement>('script[src$="index.js"]');
    const base = scriptEl?.src ? new URL('./', scriptEl.src) : new URL('./', window.location.href);
    return (rel) => new URL(rel, base).toString();
  })();
  const L = window.L as any;

  const SUPPORTED_TYPES = ['geotiff','s57','mbtiles','pmtiles','folder'];
  const HEAVY_TYPES = new Set(['geotiff','s57']);

  // Tabs (right)
  const sourceTabBtns = document.querySelectorAll<HTMLElement>('[data-tab]');
  const sourcePanels = document.querySelectorAll<HTMLElement>('[data-panel]');

  // Filters (left)
  const filterBtns = document.querySelectorAll<HTMLElement>('[data-filter]');

  // Local FS
  const fsListEl = $('#fsList') as HTMLUListElement | null;
  const currentPathEl = $('#currentPath') as HTMLElement | null;
  const upBtn = $('#upBtn') as HTMLButtonElement | null;
  const pathInput = $('#pathInput') as HTMLInputElement | null;
  const goBtn = $('#goBtn') as HTMLButtonElement | null;

  // Local form
  const selectedFileEl = $('#selectedFile') as HTMLInputElement | null;
  const localTypeEl = $('#localType') as HTMLSelectElement | null;
  const localMetaBox = $('#localMetaBox') as HTMLElement | null;
  const localMetaStatus = $('#localMetaStatus') as HTMLElement | null;
  const localHeavyWarn = $('#localHeavyWarn') as HTMLElement | null;
  const registerBtn = $('#registerBtn') as HTMLButtonElement | null;
  const registerStatus = $('#registerStatus') as HTMLElement | null;

  // Download form
  const downloadUrlEl = $('#downloadUrl') as HTMLInputElement | null;
  const downloadTypeEl = $('#downloadType') as HTMLSelectElement | null;
  const downloadMetaBox = $('#downloadMetaBox') as HTMLElement | null;
  const dlMetaStatus = $('#dlMetaStatus') as HTMLElement | null;
  const downloadHeavyWarn = $('#downloadHeavyWarn') as HTMLElement | null;
  const downloadBtn = $('#downloadBtn') as HTMLButtonElement | null;
  const downloadStatus = $('#downloadStatus') as HTMLElement | null;

  // Stream form
  const streamUrlEl = $('#streamUrl') as HTMLInputElement | null;
  const streamTypeEl = $('#streamType') as HTMLSelectElement | null;
  const streamDetectedTypeEl = $('#streamDetectedType') as HTMLSelectElement | null;
  const streamMetaBox = $('#streamMetaBox') as HTMLElement | null;
  const stMetaStatus = $('#stMetaStatus') as HTMLElement | null;
  const streamHeavyWarn = $('#streamHeavyWarn') as HTMLElement | null;
  const streamBtn = $('#streamBtn') as HTMLButtonElement | null;
  const streamStatus = $('#streamStatus') as HTMLElement | null;

  // Global refresh
  const refreshBtn = $('#refreshBtn') as HTMLButtonElement | null;
  const autoRefreshEl = $('#autoRefresh') as HTMLInputElement | null;
  const liveStateEl = $('#liveState') as HTMLElement | null;

  // Imports UI
  const importsListEl = $('#importsList') as HTMLElement | null;
  const importsEmptyEl = $('#importsEmpty') as HTMLElement | null;
  const errorBanner = $('#errorBanner') as HTMLElement | null;
  const kpiActive = $('#kpiActive') as HTMLElement | null;
  const kpiAvailable = $('#kpiAvailable') as HTMLElement | null;
  const kpiFailed = $('#kpiFailed') as HTMLElement | null;
  const kpiTotal = $('#kpiTotal') as HTMLElement | null;

  // Map
  const mapEl = $('#leafletMap') as HTMLDivElement | null;
  const mapWrap = $('#mapWrap') as HTMLElement | null;
  const mapToggle = $('#mapToggle') as HTMLButtonElement | null;
  const mapEmpty = $('#mapEmpty') as HTMLElement | null;
  const basemapNote = $('#basemapNote') as HTMLElement | null;
  const resetViewBtn = $('#resetViewBtn') as HTMLButtonElement | null;

  // Details overlay
  const detailsOverlay = $('#detailsOverlay') as HTMLElement | null;
  const detailsClose = $('#detailsClose') as HTMLButtonElement | null;
  const detailsTitle = $('#detailsTitle') as HTMLElement | null;
  const detailsSub = $('#detailsSub') as HTMLElement | null;
  const detailsChip = $('#detailsChip') as HTMLElement | null;
  const detailsMeta = $('#detailsMeta') as HTMLElement | null;
  const detailsItemJson = $('#detailsItemJson') as HTMLElement | null;
  const detailsJobJson = $('#detailsJobJson') as HTMLElement | null;

  // Config overlay
  const configBtn = $('#configBtn') as HTMLButtonElement | null;
  const configOverlay = $('#configOverlay') as HTMLElement | null;
  const configClose = $('#configClose') as HTMLButtonElement | null;
  const configSave = $('#configSave') as HTMLButtonElement | null;
  const configStatus = $('#configStatus') as HTMLElement | null;
  const configList = $('#configList') as HTMLElement | null;

  let lastFocusEl = null;

  const cfg = {
    loaded: false,
    entries: [],
    original: new Map(),
    current: new Map(),
  };

  const state = {
    fsPath: '/',
    fsParent: null,
    jobs: [],
    focusedKey: null,
    mapHidden: false,
    filter: 'active',
    sse: { es: null, status: 'off', lastEventAt: 0, watchdog: null },
    local: { selected: null, type: 'unknown' },
    download: { typeOverridden: false },
  };

  // ---------- Utils ----------
  const fmtBytes = (n) => {
    if (!Number.isFinite(n) || n <= 0) return '-';
    const u = ['B','KB','MB','GB','TB'];
    let v = n;
    let i = 0;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i += 1; }
    return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
  };

  const fmtIso = (iso) => {
    if (!iso) return '-';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString(undefined, { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
  };

  const detectTypeFromName = (name) => {
    if (!name) return 'unknown';
    const lower = String(name).toLowerCase();
    if (lower.endsWith('.tif') || lower.endsWith('.tiff')) return 'geotiff';
    if (lower.endsWith('.mbtiles')) return 'mbtiles';
    if (lower.endsWith('.pmtiles')) return 'pmtiles';
    if (lower.endsWith('.000') || lower.endsWith('.001') || lower.endsWith('.s57')) return 's57';
    return 'unknown';
  };

  const isSupportedType = (t) => SUPPORTED_TYPES.includes(String(t || 'unknown'));
  const requiresMeta = (t) => String(t) === 'folder';

  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));

  const escapeAttr = (s) => escapeHtml(s).replace(/"/g, '&quot;');

  const setHeavyWarn = (el, t) => {
    if (!el) return;
    const on = HEAVY_TYPES.has(String(t));
    el.classList.toggle('is-hidden', !on);
  };

  const clearError = () => {
    if (!errorBanner) return;
    errorBanner.classList.add('is-hidden');
    errorBanner.textContent = '';
  };

  const showError = (msg) => {
    if (!errorBanner) return;
    errorBanner.textContent = msg;
    errorBanner.classList.remove('is-hidden');
  };

  // Bounds are expected to come from the backend and may appear later via SSE.
  const getBounds = (item) =>
    item?.bounds ??
    item?.meta?.bounds ??
    item?.metadata?.bounds ??
    item?.metadataOverrides?.bounds ??
    item?.metadata_overrides?.bounds ??
    null;

  const boundsToText = (b) => {
    if (!Array.isArray(b) || b.length !== 4) return '-';
    const [minLon, minLat, maxLon, maxLat] = b.map(Number);
    if ([minLon,minLat,maxLon,maxLat].some((v) => !Number.isFinite(v))) return '-';
    return `${minLon.toFixed(4)}, ${minLat.toFixed(4)} → ${maxLon.toFixed(4)}, ${maxLat.toFixed(4)}`;
  };

  const normalizeStatus = (job, item) => {
    const s = String(item?.state || job?.state || '').toUpperCase();
    if (s === 'DOWNLOADING') return 'uploading';
    if (s === 'COPYING') return 'uploading';
    if (s === 'DOWNLOADED') return 'queued';
    if (s === 'CONVERTING') return 'converting';
    if (s === 'AVAILABLE') return 'available';
    if (s === 'METADATA_FAILED') return 'failed';
    if (s === 'RUNNING') return 'uploading';
    if (s === 'STAGED') return 'converting';
    if (s === 'COMPLETED') return 'available';
    if (s === 'FAILED') return 'failed';
    if (s === 'CANCELED' || s === 'CANCELLED') return 'canceled';
    return 'queued';
  };

  const chipClass = (status) => {
    switch (status) {
      case 'uploading': return 'chip chip--uploading';
      case 'converting': return 'chip chip--converting';
      case 'available': return 'chip chip--available';
      case 'failed': return 'chip chip--failed';
      case 'canceled': return 'chip chip--canceled';
      default: return 'chip chip--queued';
    }
  };

  // ---------- API ----------
  async function apiGet(url) {
    const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  }

  async function apiSend(url, method, bodyObj) {
    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: bodyObj ? JSON.stringify(bodyObj) : undefined
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      throw new Error(`${r.status} ${r.statusText}${txt ? ` — ${txt}` : ''}`);
    }
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('application/json')) return r.json();
    return null;
  }

  const api = {
    fs: (path) => apiGet(`${API_BASE}/fs?path=${encodeURIComponent(path)}`),
    listJobs: () => apiGet(`${API_BASE}`),
    createJob: (payload) => apiSend(`${API_BASE}`, 'POST', payload),
    cancelJob: (id) => apiSend(`${API_BASE}/${encodeURIComponent(id)}`, 'DELETE', null),
    getConfig: () => apiGet(`${API_BASE}/config`),
    setConfig: (changes) => apiSend(`${API_BASE}/config`, 'PUT', { changes }),
  };

  // ---------- Tabs / Filters ----------
  const setActiveSourceTab = (name) => {
    sourceTabBtns.forEach((b) => b.classList.toggle('is-active', b.dataset.tab === name));
    sourcePanels.forEach((p) => p.classList.toggle('is-active', p.dataset.panel === name));
  };
  sourceTabBtns.forEach((b) => b.addEventListener('click', () => setActiveSourceTab(b.dataset.tab)));

  const setFilter = (name) => {
    state.filter = name;
    filterBtns.forEach((b) => b.classList.toggle('is-active', b.dataset.filter === name));
    renderImports(state.jobs);
  };
  filterBtns.forEach((b) => b.addEventListener('click', () => setFilter(b.dataset.filter)));

  // ---------- Metadata helpers ----------
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
    // datetime-local is local time without tz; convert to ISO.
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  };

  const validateFolderMeta = (prefix) => {
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

  const folderMetaPayload = (prefix) => {
    const v = validateFolderMeta(prefix);
    if (!v.ok) return null;
    return {
      bounds: v.bounds,
      minZoom: v.minZoom,
      maxZoom: v.maxZoom,
      updatedAt: v.updatedAt,
      format: v.format,
      description: v.description,
    };
  };

  const toggleMetaBox = (boxEl, statusEl, enabled) => {
    boxEl?.classList.toggle('is-hidden', !enabled);
    statusEl?.classList.add('is-hidden');
  };

  // ---------- FS Browser ----------
  async function loadDir(path) {
    clearError();
    if (fsListEl) fsListEl.innerHTML = '';

    const skeleton = document.createElement('li');
    skeleton.className = 'fs__item';
    skeleton.innerHTML = `<div class="fs__left"><div class="fs__name">Loading…</div><div class="fs__meta">Listing server filesystem</div></div>`;
    fsListEl?.appendChild(skeleton);

    try {
      const data = await api.fs(path);
      state.fsPath = data.path ?? path;
      state.fsParent = data.parent ?? null;

      if (currentPathEl) currentPathEl.textContent = state.fsPath;
      if (pathInput) pathInput.value = state.fsPath;
      if (upBtn) upBtn.disabled = !state.fsParent;

      const entries = Array.isArray(data.entries) ? data.entries.slice() : [];
      entries.sort((a,b) => {
        const ta = a.type === 'directory' ? 0 : 1;
        const tb = b.type === 'directory' ? 0 : 1;
        if (ta !== tb) return ta - tb;
        return String(a.name).localeCompare(String(b.name));
      });

      renderFs(entries);
    } catch (e) {
      if (fsListEl) fsListEl.innerHTML = '';
      showError(`Filesystem list failed: ${e.message}`);
    }
  }

  function renderFs(entries) {
    if (!fsListEl) return;
    fsListEl.innerHTML = '';

    if (!entries.length) {
      const li = document.createElement('li');
      li.className = 'fs__item';
      li.innerHTML = `<div class="fs__left"><div class="fs__name">Empty folder</div><div class="fs__meta">No entries</div></div>`;
      fsListEl.appendChild(li);
      return;
    }

    for (const ent of entries) {
      const li = document.createElement('li');
      li.className = 'fs__item';

      const tag = ent.type === 'directory'
        ? `<span class="fs__tag">dir</span>`
        : `<span class="fs__tag">${escapeHtml(detectTypeFromName(ent.name))}</span>`;

      const meta = ent.type === 'directory'
        ? `directory`
        : `${fmtBytes(ent.size)} • ${fmtIso(ent.mtime)}`;

      const actions = ent.type === 'directory'
        ? `<button class="btn btn--ghost btn--sm" data-open="1">Open</button>
           <button class="btn btn--ghost btn--sm" data-select="1">Select</button>`
        : `<button class="btn btn--ghost btn--sm" data-select="1">Select</button>`;

      li.innerHTML = `
        <div class="fs__left">
          <div class="fs__name">${escapeHtml(ent.name)}</div>
          <div class="fs__meta">${escapeHtml(meta)}</div>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          ${tag}
          <div style="display:flex; gap:8px; align-items:center;">${actions}</div>
        </div>
      `;

      li.querySelector('[data-open]')?.addEventListener('click', () => loadDir(ent.path));
      li.querySelector('[data-select]')?.addEventListener('click', () => selectLocalEntry(ent));

      li.addEventListener('dblclick', () => {
        if (ent.type === 'directory') loadDir(ent.path);
        else selectLocalEntry(ent);
      });

      fsListEl.appendChild(li);
    }
  }

  function selectLocalEntry(ent) {
    const isDir = ent.type === 'directory';
    const guessed = isDir ? 'folder' : detectTypeFromName(ent.name);

    state.local.selected = { name: ent.name, path: ent.path, size: ent.size, isDir };
    state.local.type = isSupportedType(guessed) ? guessed : 'unknown';

    if (selectedFileEl) selectedFileEl.value = ent.name;
    if (localTypeEl) {
      localTypeEl.disabled = false;
      localTypeEl.value = state.local.type;
    }

    setHeavyWarn(localHeavyWarn, localTypeEl?.value || 'unknown');
    toggleMetaBox(localMetaBox, localMetaStatus, requiresMeta(localTypeEl?.value || 'unknown'));
    updateLocalRegisterState();
  }

  function updateLocalRegisterState() {
    const sel = state.local.selected;
    const t = localTypeEl?.value || 'unknown';
    state.local.type = t;

    setHeavyWarn(localHeavyWarn, t);

    if (!sel) {
      if (registerBtn) registerBtn.disabled = true;
      if (registerStatus) {
        registerStatus.className = 'status';
        registerStatus.textContent = 'Select a file or folder to register.';
      }
      if (localTypeEl) localTypeEl.disabled = true;
      toggleMetaBox(localMetaBox, localMetaStatus, false);
      return;
    }

    if (!isSupportedType(t)) {
      if (registerBtn) registerBtn.disabled = true;
      if (registerStatus) {
        registerStatus.className = 'status is-warn';
        registerStatus.textContent = 'Unsupported type. Choose a supported detected type.';
      }
      toggleMetaBox(localMetaBox, localMetaStatus, false);
      return;
    }

    const needMeta = requiresMeta(t);
    toggleMetaBox(localMetaBox, localMetaStatus, needMeta);

    if (needMeta) {
      if (!sel.isDir) {
        if (registerBtn) registerBtn.disabled = true;
        if (registerStatus) {
          registerStatus.className = 'status is-warn';
          registerStatus.textContent = 'Type "folder" requires selecting a directory.';
        }
        localMetaStatus?.classList.add('is-hidden');
        return;
      }
      const v = validateFolderMeta('local');
      localMetaStatus?.classList.toggle('is-hidden', v.ok);
      if (registerBtn) registerBtn.disabled = !v.ok;
      if (registerStatus) {
        registerStatus.className = v.ok ? 'status' : 'status is-warn';
        registerStatus.textContent = v.ok ? 'Ready to register folder.' : 'Fill required metadata for folder import.';
      }
      return;
    }

    if (registerBtn) registerBtn.disabled = false;
    if (registerStatus) {
      registerStatus.className = 'status';
      registerStatus.textContent = 'Ready to register.';
    }
  }

  localTypeEl?.addEventListener('change', updateLocalRegisterState);
  ['#localMinLon','#localMinLat','#localMaxLon','#localMaxLat','#localMinZoom','#localMaxZoom','#localUpdated','#localFormat','#localDescription']
    .forEach((id) => $(id)?.addEventListener('input', updateLocalRegisterState));

  registerBtn?.addEventListener('click', async () => {
    const sel = state.local.selected;
    const t = state.local.type;
    if (!sel || !isSupportedType(t)) return;

    registerBtn.disabled = true;
    if (registerStatus) {
      registerStatus.className = 'status';
      registerStatus.textContent = 'Creating import job…';
    }

    try {
      const item: {
        filename: string
        sourcePath: string
        sizeBytes?: number
        detectedType: string
        metadataOverrides?: unknown
      } = {
        filename: sel.name,
        sourcePath: sel.path,
        sizeBytes: sel.size,
        detectedType: t,
      };

      if (requiresMeta(t)) {
        const meta = folderMetaPayload('local');
        if (!meta) {
          if (registerStatus) {
            registerStatus.className = 'status is-warn';
            registerStatus.textContent = 'Missing required folder metadata.';
          }
          return;
        }
        item.metadataOverrides = meta;
      }

      await api.createJob({ items: [item] });

      // Clear selection
      state.local.selected = null;
      state.local.type = 'unknown';
      if (selectedFileEl) selectedFileEl.value = 'None';
      if (localTypeEl) {
        localTypeEl.value = 'unknown';
        localTypeEl.disabled = true;
      }
      toggleMetaBox(localMetaBox, localMetaStatus, false);
      localHeavyWarn?.classList.add('is-hidden');

      if (registerStatus) registerStatus.textContent = 'Registered. Job queued.';
      if (!isSseConnected()) await refreshJobs();
    } catch (e) {
      if (registerStatus) {
        registerStatus.className = 'status is-bad';
        registerStatus.textContent = `Register failed: ${e.message}`;
      }
    } finally {
      // for non-folder we still want enabled only when selection exists
      if (registerBtn) registerBtn.disabled = true;
    }
  });

  // FS nav
  upBtn?.addEventListener('click', () => state.fsParent && loadDir(state.fsParent));
  goBtn?.addEventListener('click', () => loadDir(pathInput?.value.trim() || '/'));
  pathInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadDir(pathInput.value.trim() || '/'); });

  // ---------- Download ----------
  const guessTypeFromUrl = (url) => {
    if (!url) return 'unknown';
    const noHash = url.split('#')[0];
    const noQ = noHash.split('?')[0];
    const base = noQ.split('/').pop() || '';
    return detectTypeFromName(base);
  };

  function updateDownloadState() {
    const url = downloadUrlEl?.value.trim() || '';
    if (!url) {
      if (downloadBtn) downloadBtn.disabled = true;
      if (downloadStatus) {
        downloadStatus.className = 'status';
        downloadStatus.textContent = 'Enter a URL.';
      }
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
      if (downloadStatus) {
        downloadStatus.className = 'status is-warn';
        downloadStatus.textContent = 'Unsupported type. Choose a supported detected type.';
      }
      toggleMetaBox(downloadMetaBox, dlMetaStatus, false);
      return;
    }

    const needMeta = requiresMeta(t);
    toggleMetaBox(downloadMetaBox, dlMetaStatus, needMeta);

    if (needMeta) {
      const v = validateFolderMeta('dl');
      dlMetaStatus?.classList.toggle('is-hidden', v.ok);
      if (downloadBtn) downloadBtn.disabled = !v.ok;
      if (downloadStatus) {
        downloadStatus.className = v.ok ? 'status' : 'status is-warn';
        downloadStatus.textContent = v.ok ? 'Ready to create download job.' : 'Fill required metadata for folder import.';
      }
      return;
    }

    if (downloadBtn) downloadBtn.disabled = false;
    if (downloadStatus) {
      downloadStatus.className = 'status';
      downloadStatus.textContent = 'Ready to create download job.';
    }
  }

  downloadUrlEl?.addEventListener('input', updateDownloadState);
  downloadTypeEl?.addEventListener('change', () => {
    state.download.typeOverridden = true;
    updateDownloadState();
  });
  ['#dlMinLon','#dlMinLat','#dlMaxLon','#dlMaxLat','#dlMinZoom','#dlMaxZoom','#dlUpdated','#dlFormat','#dlDescription']
    .forEach((id) => $(id)?.addEventListener('input', updateDownloadState));

  downloadBtn?.addEventListener('click', async () => {
    const url = downloadUrlEl?.value.trim() || '';
    const t = downloadTypeEl?.value || 'unknown';
    if (!url || !isSupportedType(t)) return;

    downloadBtn.disabled = true;
    if (downloadStatus) {
      downloadStatus.className = 'status';
      downloadStatus.textContent = 'Creating download job…';
    }

    try {
      const filename = (url.split('#')[0].split('?')[0].split('/').pop() || 'download');
      const item: {
        filename: string
        sourceUrl: string
        detectedType: string
        metadataOverrides?: unknown
      } = { filename, sourceUrl: url, detectedType: t };

      if (requiresMeta(t)) {
        const meta = folderMetaPayload('dl');
        if (!meta) {
          if (downloadStatus) {
            downloadStatus.className = 'status is-warn';
            downloadStatus.textContent = 'Missing required folder metadata.';
          }
          return;
        }
        item.metadataOverrides = meta;
      }

      await api.createJob({ items: [item] });
      if (downloadStatus) downloadStatus.textContent = 'Download job created.';
      if (!isSseConnected()) await refreshJobs();
    } catch (e) {
      if (downloadStatus) {
        downloadStatus.className = 'status is-bad';
        downloadStatus.textContent = `Download failed: ${e.message}`;
      }
    } finally {
      downloadBtn.disabled = false;
    }
  });

  // ---------- Streaming ----------
  function updateStreamState() {
    const url = streamUrlEl?.value.trim() || '';
    const t = streamDetectedTypeEl?.value || 'unknown';

    setHeavyWarn(streamHeavyWarn, t);

    if (!url) {
      if (streamBtn) streamBtn.disabled = true;
      if (streamStatus) {
        streamStatus.className = 'status';
        streamStatus.textContent = 'Provide a stream URL.';
      }
      toggleMetaBox(streamMetaBox, stMetaStatus, false);
      return;
    }

    if (!isSupportedType(t)) {
      if (streamBtn) streamBtn.disabled = true;
      if (streamStatus) {
        streamStatus.className = 'status is-warn';
        streamStatus.textContent = 'Pick a supported detected type hint.';
      }
      toggleMetaBox(streamMetaBox, stMetaStatus, false);
      return;
    }

    const needMeta = requiresMeta(t);
    toggleMetaBox(streamMetaBox, stMetaStatus, needMeta);

    if (needMeta) {
      const v = validateFolderMeta('st');
      stMetaStatus?.classList.toggle('is-hidden', v.ok);
      if (streamBtn) streamBtn.disabled = !v.ok;
      if (streamStatus) {
        streamStatus.className = v.ok ? 'status' : 'status is-warn';
        streamStatus.textContent = v.ok ? 'Ready to register stream.' : 'Fill required metadata for folder import.';
      }
      return;
    }

    if (streamBtn) streamBtn.disabled = false;
    if (streamStatus) {
      streamStatus.className = 'status';
      streamStatus.textContent = 'Ready to register stream.';
    }
  }

  streamUrlEl?.addEventListener('input', updateStreamState);
  streamDetectedTypeEl?.addEventListener('change', updateStreamState);
  ['#stMinLon','#stMinLat','#stMaxLon','#stMaxLat','#stMinZoom','#stMaxZoom','#stUpdated','#stFormat','#stDescription']
    .forEach((id) => $(id)?.addEventListener('input', updateStreamState));

  streamBtn?.addEventListener('click', async () => {
    const streamUrl = streamUrlEl?.value.trim() || '';
    const streamType = streamTypeEl?.value || 'wms';
    const detectedType = streamDetectedTypeEl?.value || 'unknown';
    if (!streamUrl || !isSupportedType(detectedType)) return;

    streamBtn.disabled = true;
    if (streamStatus) {
      streamStatus.className = 'status';
      streamStatus.textContent = 'Creating streaming job…';
    }

    try {
      const item: {
        streamUrl: string
        streamType: string
        detectedType: string
        metadataOverrides?: unknown
      } = { streamUrl, streamType, detectedType };

      if (requiresMeta(detectedType)) {
        const meta = folderMetaPayload('st');
        if (!meta) {
          if (streamStatus) {
            streamStatus.className = 'status is-warn';
            streamStatus.textContent = 'Missing required folder metadata.';
          }
          return;
        }
        item.metadataOverrides = meta;
      }

      await api.createJob({ items: [item] });
      if (streamStatus) streamStatus.textContent = 'Streaming source registered.';
      if (!isSseConnected()) await refreshJobs();
    } catch (e) {
      if (streamStatus) {
        streamStatus.className = 'status is-bad';
        streamStatus.textContent = `Register stream failed: ${e.message}`;
      }
    } finally {
      streamBtn.disabled = false;
    }
  });

  // ---------- Imports rendering ----------
  function flattenItems(jobs) {
    const safeJobs = Array.isArray(jobs) ? jobs : [];
    const out = [];
    for (const job of safeJobs) {
      const items = Array.isArray(job.items) ? job.items : [];
      for (const item of items) {
        const status = normalizeStatus(job, item);
        const key = `${job.id}:${item.id}`;
        out.push({ job, item, status, key });
      }
    }
    const prio = (s) => (s === 'uploading' || s === 'converting' || s === 'queued') ? 0 : (s === 'available' ? 1 : 2);
    out.sort((a,b) => {
      const pa = prio(a.status), pb = prio(b.status);
      if (pa !== pb) return pa - pb;
      const ta = new Date(a.job.updatedAt || a.job.createdAt || 0).getTime();
      const tb = new Date(b.job.updatedAt || b.job.createdAt || 0).getTime();
      return tb - ta;
    });
    return out;
  }

  function computeKpis(items) {
    const active = items.filter((x) => ['queued','uploading','converting'].includes(x.status)).length;
    const available = items.filter((x) => x.status === 'available').length;
    const failed = items.filter((x) => x.status === 'failed').length;
    const total = items.length;
    if (kpiActive) kpiActive.textContent = String(active);
    if (kpiAvailable) kpiAvailable.textContent = String(available);
    if (kpiFailed) kpiFailed.textContent = String(failed);
    if (kpiTotal) kpiTotal.textContent = String(total);
  }

  function applyFilter(items) {
    switch (state.filter) {
      case 'active': return items.filter((x) => ['queued','uploading','converting'].includes(x.status));
      case 'available': return items.filter((x) => x.status === 'available');
      case 'failed': return items.filter((x) => x.status === 'failed');
      default: return items;
    }
  }

  const sourceLine = (item) => {
    if (item.sourcePath) return item.sourcePath;
    if (item.sourceUrl) return item.sourceUrl;
    if (item.streamUrl) return `${item.streamType || 'stream'}: ${item.streamUrl}`;
    return '—';
  };

  function renderErrors(job, item) {
    const errs = []
      .concat(Array.isArray(item?.errors) ? item.errors : [])
      .concat(Array.isArray(job?.errors) ? job.errors : []);

    if (!errs.length) return '';
    const lines = errs.slice(0, 3).map((e) => `<div>• ${escapeHtml(String(e))}</div>`).join('');
    const more = errs.length > 3 ? `<div>…and ${errs.length - 3} more</div>` : '';
    return `<div style="margin-top:6px; color: #b42318;">${lines}${more}</div>`;
  }

  function renderImports(jobs) {
    const items = flattenItems(jobs);
    computeKpis(items);

    const filtered = applyFilter(items);
    if (importsEmptyEl) importsEmptyEl.classList.toggle('is-hidden', items.length > 0);
    if (importsListEl) importsListEl.innerHTML = '';

    if (!filtered.length && importsListEl) {
      const hint = document.createElement('div');
      hint.className = 'empty';
      hint.textContent = state.filter === 'active' ? 'No active imports right now.' : 'No items matching the filter.';
      importsListEl.appendChild(hint);
    }

    for (const entry of filtered) {
      const job = entry.job;
      const item = entry.item;
      const status = entry.status;
      const key = entry.key;
      const b = getBounds(item);

      const meta = item?.metadata ?? item?.meta ?? {};
      const minZ = meta?.minZoom ?? meta?.minzoom ?? item?.minZoom ?? item?.minzoom;
      const maxZ = meta?.maxZoom ?? meta?.maxzoom ?? item?.maxZoom ?? item?.maxzoom;
      const updated = meta?.updatedAt ?? meta?.updated ?? meta?.date ?? meta?.timestamp;

      const el = document.createElement('div');
      el.className = 'item' + (state.focusedKey === key ? ' is-focused' : '');
      el.innerHTML = `
        <div class="item__top">
          <div style="min-width:0;">
            <div class="item__name">${escapeHtml(item.filename || item.id || 'item')}</div>
            <div class="item__sub">${escapeHtml(sourceLine(item))}</div>
          </div>
          <div style="display:flex; gap:8px; align-items:center;">
            <span class="${chipClass(status)}">${escapeHtml(status)}</span>
          </div>
        </div>

        <div class="metaGrid">
          <div class="pill"><b>job</b><span>${escapeHtml(String(job.id))}</span></div>
          <div class="pill"><b>type</b><span>${escapeHtml(item.detectedType || 'unknown')}</span></div>
          <div class="pill"><b>size</b><span>${escapeHtml(fmtBytes(item.sizeBytes))}</span></div>
          <div class="pill"><b>zoom</b><span>${escapeHtml((minZ != null || maxZ != null) ? `${minZ ?? '?'}–${maxZ ?? '?'}` : '-')}</span></div>
          <div class="pill"><b>bounds</b><span>${escapeHtml(Array.isArray(b) ? 'yes' : 'no')}</span></div>
          <div class="pill"><b>updated</b><span>${escapeHtml(updated ? fmtIso(updated) : fmtIso(job.updatedAt || job.createdAt))}</span></div>
        </div>

        <div class="details">
          <div><code>${escapeHtml(boundsToText(b))}</code></div>
          ${renderErrors(job, item)}
        </div>

        <div class="rowActions">
          <button class="btn btn--ghost btn--sm" data-details="1">Details</button>
          <button class="btn btn--ghost btn--sm" data-cancel="${escapeAttr(String(job.id))}">Cancel job</button>
        </div>
      `;

      el.addEventListener('click', () => {
        state.focusedKey = key;
        renderImports(state.jobs);
        if (Array.isArray(b) && b.length === 4) focusBounds(b);
      });

      el.querySelector('button[data-details]')?.addEventListener('click', (ev) => {
        ev.stopPropagation();
        openDetails(job, item, status);
      });

      const cancelBtn = el.querySelector('button[data-cancel]') as HTMLButtonElement | null;
      cancelBtn?.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        if (cancelBtn) cancelBtn.disabled = true;
        try {
          await api.cancelJob(job.id);
          if (!isSseConnected()) await refreshJobs();
        } catch (e) {
          showError(`Cancel failed: ${e.message}`);
        } finally {
          if (cancelBtn) cancelBtn.disabled = false;
        }
      });

      importsListEl?.appendChild(el);
    }

    // Keep map overview stable: always render all items.
    const allForMap = flattenItems(jobs).map((x) => ({ jobId: x.job.id, item: x.item, key: x.key }));
    renderMap(allForMap);
  }

  // ---------- Details overlay ----------
  const prettyJson = (obj) => {
    try { return JSON.stringify(obj ?? null, null, 2); } catch { return String(obj); }
  };

  function metaValue(item, meta, key, fallbacks) {
    const fb = Array.isArray(fallbacks) ? fallbacks : [];
    const candidates = [ meta?.[key], item?.[key], ...fb.map((k) => meta?.[k] ?? item?.[k]) ];
    for (const v of candidates) {
      if (v === undefined || v === null || v === '') continue;
      return v;
    }
    return null;
  }

  function renderMetaGrid(rows) {
    if (!detailsMeta) return;
    detailsMeta.innerHTML = '';
    for (const r of rows) {
      const div = document.createElement('div');
      div.className = 'kv';
      div.innerHTML = `<div class="kv__k">${escapeHtml(r.k)}</div><div class="kv__v ${r.mono ? 'mono' : ''}">${escapeHtml(r.v ?? '-')}</div>`;
      detailsMeta.appendChild(div);
    }
  }

  function openDetails(job, item, status) {
    if (!detailsOverlay) return;
    lastFocusEl = document.activeElement;

    const meta = item?.metadata ?? item?.meta ?? {};
    const b = getBounds(item);
    const source = sourceLine(item);
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
      { k: 'Staging dir', v: item?.stagingDir ?? '-', mono: true },
    ]);

    if (detailsItemJson) detailsItemJson.textContent = prettyJson(item);
    if (detailsJobJson) detailsJobJson.textContent = prettyJson(job);

    detailsOverlay.classList.remove('is-hidden');
    detailsClose?.focus?.();
  }

  function closeDetails() {
    if (!detailsOverlay) return;
    detailsOverlay.classList.add('is-hidden');
    if (lastFocusEl && typeof lastFocusEl.focus === 'function') {
      try { lastFocusEl.focus(); } catch (_) {}
    }
    lastFocusEl = null;
  }

  detailsClose?.addEventListener('click', closeDetails);
  detailsOverlay?.addEventListener('click', (e) => {
    if (e.target === detailsOverlay) closeDetails();
  });

  // ---------- Config overlay ----------
  const isDeepEqual = (a, b) => {
    if (a === b) return true;
    try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
  };

  const inferCfgType = (entry) => {
    const t = String(entry?.type || '').toLowerCase();
    if (t) return t;
    if (Array.isArray(entry?.options)) return 'enum';
    const v = entry?.value;
    if (typeof v === 'boolean') return 'boolean';
    if (typeof v === 'number') return 'number';
    return 'string';
  };

  const normalizeEnumOptions = (opts) => {
    if (!Array.isArray(opts)) return [];
    return opts.map((o) => {
      if (o && typeof o === 'object') {
        return { value: String(o.value ?? o.id ?? o.key ?? ''), label: String(o.label ?? o.name ?? o.value ?? o.id ?? '') };
      }
      return { value: String(o), label: String(o) };
    }).filter((x) => x.value !== '');
  };

  const cfgDirtyCount = () => {
    let n = 0;
    for (const [k, v] of cfg.current.entries()) {
      const ov = cfg.original.get(k);
      if (!isDeepEqual(v, ov)) n += 1;
    }
    return n;
  };

  const updateCfgSaveState = () => {
    const n = cfg.loaded ? cfgDirtyCount() : 0;
    if (configSave) configSave.disabled = n === 0;
    if (configStatus && cfg.loaded) {
      configStatus.className = 'status';
      configStatus.textContent = n === 0 ? 'No unsaved changes.' : `${n} change${n === 1 ? '' : 's'} pending.`;
    }
  };

  function renderCfg(entries) {
    if (!configList) return;
    configList.innerHTML = '';

    if (!Array.isArray(entries) || entries.length === 0) {
      const div = document.createElement('div');
      div.className = 'empty';
      div.textContent = 'No configuration entries provided by backend.';
      configList.appendChild(div);
      return;
    }

    for (const entry of entries) {
      const key = String(entry.key ?? entry.id ?? entry.name ?? '');
      const name = String(entry.name ?? key);
      const desc = String(entry.description ?? '');
      const type = inferCfgType(entry);

      const row = document.createElement('div');
      row.className = 'cfgRow';

      const safeKey = key.replace(/[^a-zA-Z0-9_-]/g,'_');
      const dirtyId = `cfgDirty__${safeKey}`;
      const hostId = `cfgHost__${safeKey}`;

      row.innerHTML = `
        <div class="cfgRow__top">
          <div style="min-width:0;">
            <div class="cfgRow__name">${escapeHtml(name)}</div>
            <div class="cfgRow__key">${escapeHtml(key)}</div>
          </div>
          <div class="cfgRow__right">
            <span id="${dirtyId}" class="cfgDirty is-hidden">modified</span>
          </div>
        </div>
        ${desc ? `<div class="cfgRow__desc">${escapeHtml(desc)}</div>` : ''}
        <div id="${hostId}" class="cfgControl"></div>
      `;

      const host = row.querySelector(`#${CSS.escape(hostId)}`);
      const dirtyEl = row.querySelector(`#${CSS.escape(dirtyId)}`);

      const originalValue = entry.value;
      cfg.original.set(key, originalValue);
      cfg.current.set(key, originalValue);

      const setDirtyUi = () => {
        const isDirty = !isDeepEqual(cfg.current.get(key), cfg.original.get(key));
        dirtyEl?.classList.toggle('is-hidden', !isDirty);
        updateCfgSaveState();
      };

      const setValue = (val) => {
        cfg.current.set(key, val);
        setDirtyUi();
      };

      if (type === 'boolean') {
        const v = !!cfg.current.get(key);
        host.innerHTML = `
          <label style="display:flex; align-items:center; gap:10px;">
            <input type="checkbox" ${v ? 'checked' : ''} />
            <span style="font-weight:900; font-size:13px;">${v ? 'Enabled' : 'Disabled'}</span>
          </label>
        `;
        const cb = host.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
        cb?.addEventListener('change', () => {
          if (!cb) return;
          setValue(!!cb.checked);
          const label = host.querySelector('span');
          if (label) label.textContent = cb.checked ? 'Enabled' : 'Disabled';
        });
      } else if (type === 'enum') {
        const opts = normalizeEnumOptions(entry.options);
        const cur = String(cfg.current.get(key) ?? '');
        const sel = document.createElement('select');
        sel.className = 'select';
        for (const o of opts) {
          const op = document.createElement('option');
          op.value = o.value;
          op.textContent = o.label;
          if (o.value === cur) op.selected = true;
          sel.appendChild(op);
        }
        sel.addEventListener('change', () => setValue(sel.value));
        host.appendChild(sel);
      } else if (type === 'number') {
        const inp = document.createElement('input');
        inp.className = 'input';
        inp.type = 'number';
        const o = entry.options && typeof entry.options === 'object' && !Array.isArray(entry.options) ? entry.options : {};
        if (o.min != null) inp.min = String(o.min);
        if (o.max != null) inp.max = String(o.max);
        if (o.step != null) inp.step = String(o.step);
        const cur = cfg.current.get(key);
        inp.value = (cur === null || cur === undefined || cur === '') ? '' : String(cur);
        inp.addEventListener('input', () => {
          const v = String(inp.value).trim();
          if (!v) return setValue(null);
          const n = Number(v);
          if (Number.isFinite(n)) setValue(n);
        });
        host.appendChild(inp);
      } else {
        const inp = document.createElement('input');
        inp.className = 'input';
        inp.type = 'text';
        const cur = cfg.current.get(key);
        inp.value = (cur === null || cur === undefined) ? '' : String(cur);
        inp.placeholder = entry.placeholder ? String(entry.placeholder) : '';
        inp.addEventListener('input', () => setValue(inp.value));
        host.appendChild(inp);
      }

      setDirtyUi();
      configList.appendChild(row);
    }

    updateCfgSaveState();
  }

  async function openConfig() {
    if (!configOverlay) return;
    lastFocusEl = document.activeElement;
    configOverlay.classList.remove('is-hidden');

    cfg.loaded = false;
    cfg.entries = [];
    cfg.original = new Map();
    cfg.current = new Map();

    if (configSave) configSave.disabled = true;
    if (configStatus) {
      configStatus.className = 'status';
      configStatus.textContent = 'Loading configuration from backend…';
    }
    if (configList) configList.innerHTML = '';

    try {
      const data = await api.getConfig();
      const entries = Array.isArray(data) ? data : (Array.isArray(data?.entries) ? data.entries : []);
      cfg.entries = entries;
      cfg.loaded = true;
      renderCfg(entries);
    } catch (e) {
      cfg.loaded = false;
      if (configStatus) {
        configStatus.className = 'status is-bad';
        configStatus.textContent = `Failed to load configuration: ${e.message}`;
      }
    }
  }

  function closeConfig() {
    if (!configOverlay) return;
    configOverlay.classList.add('is-hidden');
    if (lastFocusEl && typeof lastFocusEl.focus === 'function') {
      try { lastFocusEl.focus(); } catch (_) {}
    }
    lastFocusEl = null;
  }

  async function saveConfig() {
    if (!cfg.loaded) return;

    const changes = [];
    for (const [k, v] of cfg.current.entries()) {
      const ov = cfg.original.get(k);
      if (!isDeepEqual(v, ov)) changes.push({ key: k, value: v });
    }

    if (!changes.length) {
      updateCfgSaveState();
      return;
    }

    if (configStatus) {
      configStatus.className = 'status';
      configStatus.textContent = 'Saving changes…';
    }
    if (configSave) configSave.disabled = true;

    try {
      const resp = await api.setConfig(changes);
      const entries = Array.isArray(resp) ? resp : (Array.isArray(resp?.entries) ? resp.entries : null);

      if (entries) {
        cfg.entries = entries;
        cfg.original = new Map();
        cfg.current = new Map();
        for (const e of entries) {
          const key = String(e.key ?? e.id ?? e.name ?? '');
          cfg.original.set(key, e.value);
          cfg.current.set(key, e.value);
        }
        renderCfg(entries);
      } else {
        for (const c of changes) cfg.original.set(c.key, cfg.current.get(c.key));
        renderCfg(cfg.entries);
      }

      if (configStatus) {
        configStatus.className = 'status';
        configStatus.textContent = 'Saved.';
      }
      updateCfgSaveState();
    } catch (e) {
      if (configStatus) {
        configStatus.className = 'status is-bad';
        configStatus.textContent = `Save failed: ${e.message}`;
      }
      updateCfgSaveState();
    }
  }

  configBtn?.addEventListener('click', openConfig);
  configClose?.addEventListener('click', closeConfig);
  configSave?.addEventListener('click', saveConfig);
  configOverlay?.addEventListener('click', (e) => { if (e.target === configOverlay) closeConfig(); });

  // ---------- Map (Leaflet) ----------
  let leafletMap = null;
  let boundsGroup = null;
  let basemapLayer = null;

  function initLeaflet() {
    if (!mapEl) return;

    if (!L) {
      mapEl.innerHTML = `
        <div style="padding:14px;color:var(--muted);font-size:13px;line-height:1.45;">
          <b>Leaflet not found.</b><br/>
          Place <code>assets/leaflet/leaflet.js</code> and <code>assets/leaflet/leaflet.css</code> next to this HTML file (same directory), then reload.
        </div>
      `;
      return;
    }

    leafletMap = L.map(mapEl, {
      zoomControl: true,
      attributionControl: true,
      worldCopyJump: true,
    });

    leafletMap.createPane('basemap');
    leafletMap.getPane('basemap').style.zIndex = 200;
    leafletMap.getPane('basemap').style.pointerEvents = 'none';

    leafletMap.createPane('bounds');
    leafletMap.getPane('bounds').style.zIndex = 400;

    boundsGroup = L.featureGroup().addTo(leafletMap);
    leafletMap.setView([20, 0], 2);

    addLocalVectorBasemap();
  }

  async function addLocalVectorBasemap() {
    if (!leafletMap || !L) return;
    if (basemapNote) basemapNote.style.display = 'none';

    try {
      const r = await fetch(assetUrl('assets/world/ne_110m_admin_0_countries.geojson'), { cache: 'no-store' });
      if (r.ok) {
        const gj = await r.json();
        basemapLayer = L.geoJSON(gj, {
          pane: 'basemap',
          interactive: false,
          style: {
            color: 'rgba(18,19,26,.14)',
            weight: 1,
            fillColor: 'rgba(18,19,26,.06)',
            fillOpacity: 1
          }
        }).addTo(leafletMap);
        if (basemapNote) basemapNote.style.display = 'none';
        return;
      }
    } catch (_) {}

    if (basemapNote) basemapNote.style.display = 'block';
  }

  const rectStyle = (focused) => ({
    color: focused ? '#2a67ff' : 'rgba(42,103,255,.75)',
    weight: focused ? 3 : 2,
    fillColor: '#2a67ff',
    fillOpacity: focused ? 0.18 : 0.10,
  });

  function toLatLngBounds(b) {
    if (!Array.isArray(b) || b.length !== 4) return null;
    const [minLon, minLat, maxLon, maxLat] = b.map(Number);
    if ([minLon, minLat, maxLon, maxLat].some((v) => !Number.isFinite(v))) return null;
    return L.latLngBounds([[minLat, minLon], [maxLat, maxLon]]);
  }

  function focusBounds(bounds) {
    if (!leafletMap || !L) return;
    const llb = toLatLngBounds(bounds);
    if (!llb) return;
    leafletMap.fitBounds(llb, { padding: [40, 40], maxZoom: 12 });
  }

  function resetView() {
    if (!leafletMap || !L) return;
    leafletMap.setView([20, 0], 2);
  }

  function renderMap(itemsWithJob) {
    const boundsItems = (Array.isArray(itemsWithJob) ? itemsWithJob : [])
      .map(({ jobId, item, key }) => ({ jobId, item, key, b: getBounds(item) }))
      .filter((x) => Array.isArray(x.b) && x.b.length === 4);

    if (mapEmpty) mapEmpty.style.display = boundsItems.length ? 'none' : 'block';
    if (!leafletMap || !boundsGroup || !L) return;

    boundsGroup.clearLayers();

    for (const { key, b } of boundsItems) {
      const llb = toLatLngBounds(b);
      if (!llb) continue;

      const focused = state.focusedKey === key;
      const rect = L.rectangle(llb, { ...rectStyle(focused), pane: 'bounds' });
      rect.on('click', () => {
        state.focusedKey = key;
        renderImports(state.jobs);
        focusBounds(b);
      });
      rect.addTo(boundsGroup);
    }
  }

  function setMapHidden(hidden) {
    state.mapHidden = !!hidden;
    if (mapWrap) mapWrap.style.display = state.mapHidden ? 'none' : 'block';
    if (mapToggle) mapToggle.textContent = state.mapHidden ? 'Show' : 'Hide';
    if (!state.mapHidden && leafletMap) {
      setTimeout(() => leafletMap.invalidateSize(), 50);
    }
  }

  mapToggle?.addEventListener('click', () => setMapHidden(!state.mapHidden));
  resetViewBtn?.addEventListener('click', resetView);

  // ---------- Refresh ----------
  async function refreshJobs() {
    try {
      const jobs = await api.listJobs();
      state.jobs = Array.isArray(jobs) ? jobs : [];
      clearError();
      renderImports(state.jobs);
    } catch (e) {
      showError(`Imports list failed: ${e.message}`);
      renderImports([]);
    }
  }

  // ---------- SSE ----------
  function setLiveUi(mode, text) {
    state.sse.status = mode;
    if (!liveStateEl) return;

    liveStateEl.classList.remove('live--on','live--re','live--off');
    if (mode === 'connected') liveStateEl.classList.add('live--on');
    else if (mode === 'off') liveStateEl.classList.add('live--off');
    else liveStateEl.classList.add('live--re');

    liveStateEl.textContent = text || mode;
  }

  function disconnectSse() {
    try { state.sse.es?.close?.(); } catch (_) {}
    state.sse.es = null;
    if (state.sse.watchdog) window.clearInterval(state.sse.watchdog);
    state.sse.watchdog = null;
    setLiveUi('off', 'off');
  }

  const safeJson = (str) => {
    try { return JSON.parse(str); } catch { return null; }
  };

  function upsertJob(job) {
    if (!job || job.id == null) return;
    const id = String(job.id);
    const idx = state.jobs.findIndex((j) => String(j.id) === id);
    if (idx >= 0) state.jobs[idx] = job;
    else state.jobs.push(job);
  }

  function upsertItem(jobId, item) {
    if (jobId == null || !item) return;
    const id = String(jobId);
    let job = state.jobs.find((j) => String(j.id) === id);
    if (!job) {
      job = { id: jobId, state: 'QUEUED', items: [] };
      state.jobs.push(job);
    }
    if (!Array.isArray(job.items)) job.items = [];
    const itemId = String(item.id ?? item.filename ?? Math.random());
    const i = job.items.findIndex((x) => String(x.id ?? x.filename) === itemId);
    if (i >= 0) job.items[i] = { ...job.items[i], ...item };
    else job.items.push(item);
  }

  function removeJob(jobId) {
    const id = String(jobId);
    state.jobs = state.jobs.filter((j) => String(j.id) !== id);
  }

  function handleSsePayload(payload) {
    if (payload == null) return;

    if (Array.isArray(payload)) {
      state.jobs = payload;
      renderImports(state.jobs);
      return;
    }

    if (Array.isArray(payload.jobs)) {
      state.jobs = payload.jobs;
      renderImports(state.jobs);
      return;
    }

    if (payload.job) {
      upsertJob(payload.job);
      renderImports(state.jobs);
      return;
    }

    if (payload.item && payload.jobId != null) {
      upsertItem(payload.jobId, payload.item);
      renderImports(state.jobs);
      return;
    }

    if (payload.type === 'snapshot' && Array.isArray(payload.data)) {
      state.jobs = payload.data;
      renderImports(state.jobs);
      return;
    }
    if (payload.type === 'job' && payload.data) {
      upsertJob(payload.data);
      renderImports(state.jobs);
      return;
    }
    if (payload.type === 'item' && payload.data && payload.jobId != null) {
      upsertItem(payload.jobId, payload.data);
      renderImports(state.jobs);
      return;
    }
    if (payload.type === 'delete' && payload.jobId != null) {
      removeJob(payload.jobId);
      renderImports(state.jobs);
      return;
    }
  }

  function connectSse() {
    disconnectSse();

    if (!autoRefreshEl?.checked) {
      setLiveUi('off', 'off');
      return;
    }

    if (!('EventSource' in window)) {
      setLiveUi('off', 'no SSE');
      showError('This browser does not support Server-Sent Events (EventSource).');
      return;
    }

    const url = `${API_BASE}/events`;
    setLiveUi('connecting', 'connecting');

    const es = new EventSource(url);
    state.sse.es = es;
    state.sse.lastEventAt = Date.now();

    es.onopen = () => {
      state.sse.lastEventAt = Date.now();
      setLiveUi('connected', 'connected');
    };

    es.onerror = () => {
      setLiveUi('reconnecting', 'reconnecting');
    };

    const onAny = (ev) => {
      state.sse.lastEventAt = Date.now();
      const payload = safeJson(ev.data);
      handleSsePayload(payload);
    };

    es.onmessage = onAny;
    es.addEventListener('snapshot', onAny);
    es.addEventListener('job', onAny);
    es.addEventListener('item', onAny);
    es.addEventListener('delete', onAny);
    es.addEventListener('ping', () => { state.sse.lastEventAt = Date.now(); });

    state.sse.watchdog = window.setInterval(() => {
      if (!autoRefreshEl?.checked) return;
      const age = Date.now() - (state.sse.lastEventAt || 0);
      if (age > 30000) {
        setLiveUi('reconnecting', 'reconnecting');
        try { es.close(); } catch (_) {}
        connectSse();
      }
    }, 5000);
  }

  function isSseConnected() {
    return state.sse.status === 'connected' && !!state.sse.es;
  }

  refreshBtn?.addEventListener('click', refreshJobs);
  autoRefreshEl?.addEventListener('change', () => {
    if (autoRefreshEl.checked) connectSse();
    else disconnectSse();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (detailsOverlay && !detailsOverlay.classList.contains('is-hidden')) { closeDetails(); return; }
    if (configOverlay && !configOverlay.classList.contains('is-hidden')) { closeConfig(); }
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      refreshJobs();
      if (autoRefreshEl?.checked && !isSseConnected()) connectSse();
    }
  });

  // ---------- Self-tests (lightweight) ----------
  function runSelfTests() {
    // These are intentionally non-throwing in production; they log warnings if something is off.
    const assert = (cond, msg) => { if (!cond) console.warn('[selftest]', msg); };
    assert(detectTypeFromName('a.tif') === 'geotiff', 'detectTypeFromName tif');
    assert(detectTypeFromName('a.mbtiles') === 'mbtiles', 'detectTypeFromName mbtiles');
    assert(isSupportedType('pmtiles') === true, 'isSupportedType pmtiles');
    assert(requiresMeta('folder') === true, 'requiresMeta folder');
    assert(boundsToText([0,0,1,1]).includes('0.0000'), 'boundsToText format');
  }

  // ---------- Init ----------
  runSelfTests();

  initLeaflet();
  setMapHidden(false);
  resetView();

  setActiveSourceTab('register');
  setFilter('active');

  loadDir('/');
  updateLocalRegisterState();
  updateDownloadState();
  updateStreamState();

  refreshJobs();
  connectSse();
})();
