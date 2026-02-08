export const cfg = {
  loaded: false,
  entries: [] as any[],
  original: new Map<string, any>(),
  current: new Map<string, any>()
};

export const state = {
  fsPath: '/',
  fsParent: null as string | null,
  jobs: [] as any[],
  focusedKey: null as string | null,
  mapHidden: false,
  filter: 'active',
  sse: { es: null as EventSource | null, status: 'off', lastEventAt: 0, watchdog: null as number | null },
  local: { selected: null as any, type: 'unknown' },
  download: { typeOverridden: false }
};
