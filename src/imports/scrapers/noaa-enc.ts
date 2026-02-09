import { parse, HTMLElement } from 'node-html-parser'
import type { CuratedChart } from '../curated-sources'

const NOAA_ENC_URL = 'https://charts.noaa.gov/ENCs/ENCs.shtml'

const GROUPS = [
  { label: 'All ENCs', match: /All ENCs/i },
  { label: 'ENCs by Coast Guard Districts', match: /Coast Guard Districts/i },
  { label: 'ENCs by State', match: /ENCs by State/i },
  { label: 'ENCs by Region', match: /ENCs by Region/i }
]

const toBytes = (sizeText: string): number | undefined => {
  const m = sizeText.trim().match(/([0-9]+(?:\.[0-9]+)?)\s*(KB|MB|GB|TB)/i)
  if (!m) return undefined
  const value = Number(m[1])
  if (!Number.isFinite(value)) return undefined
  const unit = m[2].toUpperCase()
  const multipliers: Record<string, number> = {
    KB: 1024,
    MB: 1024 ** 2,
    GB: 1024 ** 3,
    TB: 1024 ** 4
  }
  return Math.round(value * (multipliers[unit] || 1))
}

const parseDateUtc = (text: string): string | undefined => {
  const m = text
    .trim()
    .match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!m) return undefined
  const [, mm, dd, yyyy, hh, min, ss] = m
  const iso = new Date(
    Date.UTC(
      Number(yyyy),
      Number(mm) - 1,
      Number(dd),
      Number(hh),
      Number(min),
      Number(ss || '0')
    )
  ).toISOString()
  return iso
}

const slugify = (input: string) =>
  input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const resolveUrl = (href: string) => new URL(href, NOAA_ENC_URL).toString()

const normalizeText = (value: string) =>
  value
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const headerLabels = new Set(['name', 'xml', 'size', 'zip file date time*'])

const isEncTable = (table: HTMLElement) => {
  const headRow = table.querySelector('tr')
  if (!headRow) return false
  const headers = headRow
    .querySelectorAll('td, th')
    .map((cell) => normalizeText(cell.text).toLowerCase())
    .filter((text) => text.length > 0)
  if (headers.length < 4) return false
  if (headers.length > 16) return false
  return headers.every((text) => headerLabels.has(text))
}

const findGroupLabelInNode = (node: HTMLElement) => {
  const bolds = node.querySelectorAll('b')
  for (let i = bolds.length - 1; i >= 0; i -= 1) {
    const text = normalizeText(bolds[i].text)
    const group = GROUPS.find((g) => g.match.test(text))
    if (group) return group.label
  }
  const text = normalizeText(node.text)
  const group = GROUPS.find((g) => g.match.test(text))
  if (group) return group.label
  return null
}

const findGroupLabel = (table: HTMLElement) => {
  let node: HTMLElement | null = table
  for (let depth = 0; depth < 8 && node; depth += 1) {
    let prev = node.previousElementSibling as HTMLElement | null
    while (prev) {
      const label = findGroupLabelInNode(prev)
      if (label) return label
      prev = prev.previousElementSibling as HTMLElement | null
    }
    const parent = node.parentNode as HTMLElement | null
    node = parent instanceof HTMLElement ? parent : null
  }
  return null
}

const pickZipLink = (cells: HTMLElement[]): string | undefined => {
  const links = cells.flatMap((cell) =>
    cell.querySelectorAll('a').map((a) => a.getAttribute('href'))
  )
  const zip = links.find((href) => href && href.toLowerCase().includes('.zip'))
  if (!zip) return undefined
  return resolveUrl(zip)
}

const isSpacerCell = (cell: HTMLElement) => {
  const text = normalizeText(cell.text)
  return text.length === 0
}

const parseTable = (table: HTMLElement, groupLabel: string) => {
  const rows = table.querySelectorAll('tr')
  const charts: CuratedChart[] = []
  for (const row of rows) {
    const cells = row.querySelectorAll('td')
    if (cells.length < 4) continue
    const trimmed = cells.filter((cell) => !isSpacerCell(cell))
    if (trimmed.length < 4) continue
    const header = normalizeText(trimmed[0]?.text || '').toLowerCase()
    if (header === 'name') continue
    for (let i = 0; i + 3 < trimmed.length; i += 4) {
      const name = normalizeText(trimmed[i]?.text || '')
      const sizeText = normalizeText(trimmed[i + 2]?.text || '')
      const dateText = normalizeText(trimmed[i + 3]?.text || '')
      const url = pickZipLink([trimmed[i], trimmed[i + 1], trimmed[i + 2]])
      if (!name || !url) continue
      charts.push({
        id: `noaa-${slugify(groupLabel)}-${slugify(name)}`,
        name,
        url,
        type: 's57',
        sizeBytes: toBytes(sizeText),
        details: `Group: ${groupLabel}`,
        lastUpdated: parseDateUtc(dateText)
      })
    }
  }
  return charts
}

export const fetchNoaaEncCharts = async (): Promise<CuratedChart[]> => {
  try {
    const res = await fetch(NOAA_ENC_URL)
    if (!res.ok) {
      throw new Error(`NOAA ENC fetch failed: ${res.status} ${res.statusText}`)
    }
    const html = await res.text()
    const root = parse(html)

    const tables = root.querySelectorAll('table').filter(isEncTable)
    const charts: CuratedChart[] = []
    for (const table of tables) {
      const label = findGroupLabel(table)
      if (!label) continue
      charts.push(...parseTable(table, label))
    }
    return charts
  } catch {
    return []
  }
}
